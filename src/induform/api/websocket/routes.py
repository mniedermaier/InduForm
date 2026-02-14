"""WebSocket routes for real-time collaboration."""

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from induform.api.websocket.manager import manager
from induform.db import RevokedToken, get_db
from induform.security.jwt import ALGORITHM, SECRET_KEY, decode_token
from induform.security.permissions import Permission, check_project_permission

logger = logging.getLogger(__name__)

# Allowed message types and their required/optional fields
_MESSAGE_SCHEMAS: dict[str, dict[str, Any]] = {
    "cursor": {"required": [], "optional": ["position"]},
    "selection": {"required": [], "optional": ["entity_id"]},
    "edit": {"required": ["entity", "action"], "optional": ["data"]},
    "ping": {"required": [], "optional": ["timestamp"]},
}

# Maximum incoming message size (16 KB)
_MAX_MESSAGE_SIZE = 16384


def _validate_message(raw: str) -> tuple[dict | None, str | None]:
    """Validate and parse an incoming WebSocket message.

    Returns (parsed_message, error_string). On success error is None.
    """
    if len(raw) > _MAX_MESSAGE_SIZE:
        return None, "Message too large"

    try:
        message = json.loads(raw)
    except json.JSONDecodeError:
        return None, "Invalid JSON"

    if not isinstance(message, dict):
        return None, "Message must be a JSON object"

    msg_type = message.get("type")
    if not isinstance(msg_type, str):
        return None, "Missing or invalid 'type' field"

    schema = _MESSAGE_SCHEMAS.get(msg_type)
    if schema is None:
        return None, f"Unknown message type: {msg_type}"

    for field in schema["required"]:
        if field not in message:
            return None, f"Missing required field '{field}' for type '{msg_type}'"

    # Validate position shape if present
    if msg_type == "cursor":
        pos = message.get("position")
        if pos is not None and not isinstance(pos, dict):
            return None, "'position' must be an object"

    return message, None


router = APIRouter(tags=["WebSocket"])

# Re-validate token every 5 minutes
_TOKEN_REVALIDATION_INTERVAL = 300


async def _is_token_still_valid(token: str) -> bool:
    """Check if a token is still valid (not expired, not revoked)."""
    token_data = decode_token(token)
    if token_data is None:
        return False

    if token_data.jti:
        async for db in get_db():
            result = await db.execute(
                select(RevokedToken).where(RevokedToken.jti == token_data.jti)
            )
            if result.scalar_one_or_none():
                return False
            break

    return True


@router.websocket("/ws/projects/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time project collaboration.

    Connect with: ws://host/ws/projects/{project_id}?token={jwt_token}

    Message types:
    - Incoming:
        - {"type": "cursor", "position": {"x": 100, "y": 200}}
        - {"type": "selection", "entity_id": "zone-1"}
        - {"type": "edit", "entity": "zone", "action": "update", "data": {...}}

    - Outgoing:
        - {"type": "presence", "viewers": [...]}
        - {"type": "cursor", "user_id": "...", "username": "...", "position": {...}}
        - {"type": "selection", "user_id": "...", "username": "...", "entity_id": "..."}
        - {"type": "edit", "user_id": "...", "username": "...",
           "entity": "...", "action": "...", "data": {...}}
    """
    # Validate JWT token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        username: str = payload.get("username", "Unknown")
        display_name: str = payload.get("display_name")

        if user_id is None:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Check if token is revoked
    if not await _is_token_still_valid(token):
        await websocket.close(code=4001, reason="Token revoked")
        return

    # Check project access
    async for db in get_db():
        has_access = await check_project_permission(db, project_id, user_id, Permission.VIEWER)
        if not has_access:
            await websocket.close(code=4003, reason="Access denied")
            return
        break

    # Connect
    await manager.connect(websocket, project_id, user_id, username, display_name)
    logger.info("WebSocket connected: user=%s project=%s", username, project_id)

    last_revalidation = time.monotonic()

    try:
        while True:
            # Receive message with timeout to allow periodic token re-validation
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=_TOKEN_REVALIDATION_INTERVAL,
                )
            except TimeoutError:
                # Periodic token re-validation
                if not await _is_token_still_valid(token):
                    logger.info(
                        "WebSocket token expired/revoked: user=%s project=%s", username, project_id
                    )
                    await manager.send_to_user(
                        project_id,
                        user_id,
                        {"type": "error", "message": "Session expired. Please reconnect."},
                    )
                    await websocket.close(code=4001, reason="Token expired")
                    break
                last_revalidation = time.monotonic()
                continue

            # Re-validate token if enough time has passed since last check
            now = time.monotonic()
            if now - last_revalidation > _TOKEN_REVALIDATION_INTERVAL:
                if not await _is_token_still_valid(token):
                    logger.info(
                        "WebSocket token expired/revoked: user=%s project=%s", username, project_id
                    )
                    await manager.send_to_user(
                        project_id,
                        user_id,
                        {"type": "error", "message": "Session expired. Please reconnect."},
                    )
                    await websocket.close(code=4001, reason="Token expired")
                    break
                last_revalidation = now

            message, error = _validate_message(data)
            if error:
                await manager.send_to_user(
                    project_id,
                    user_id,
                    {"type": "error", "message": error},
                )
                continue

            msg_type = message["type"]

            if msg_type == "cursor":
                position = message.get("position", {})
                await manager.broadcast_cursor(project_id, user_id, username, position)

            elif msg_type == "selection":
                entity_id = message.get("entity_id")
                await manager.broadcast_selection(project_id, user_id, username, entity_id)

            elif msg_type == "edit":
                # Verify user has edit permission
                async for db in get_db():
                    has_edit_access = await check_project_permission(
                        db, project_id, user_id, Permission.EDITOR
                    )
                    if not has_edit_access:
                        await manager.send_to_user(
                            project_id,
                            user_id,
                            {"type": "error", "message": "Edit permission denied"},
                        )
                        continue

                    await manager.broadcast_edit(
                        project_id,
                        user_id,
                        username,
                        message["entity"],
                        message["action"],
                        message.get("data", {}),
                    )
                    break

            elif msg_type == "ping":
                await manager.send_to_user(
                    project_id,
                    user_id,
                    {"type": "pong", "timestamp": message.get("timestamp")},
                )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user=%s project=%s", username, project_id)
        await manager.disconnect(project_id, user_id)
    except Exception as e:
        logger.warning("WebSocket error for user=%s project=%s: %s", username, project_id, e)
        await manager.disconnect(project_id, user_id)
