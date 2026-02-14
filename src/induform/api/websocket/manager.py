"""WebSocket connection manager for real-time collaboration."""

import asyncio
import logging
from datetime import datetime

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time collaboration."""

    def __init__(self):
        # project_id -> {user_id: {"websocket": WebSocket, "username": str, "display_name": str}}
        self.active_connections: dict[str, dict[str, dict]] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        project_id: str,
        user_id: str,
        username: str,
        display_name: str | None = None,
    ):
        """Accept a new WebSocket connection."""
        await websocket.accept()

        async with self._lock:
            if project_id not in self.active_connections:
                self.active_connections[project_id] = {}

            # Disconnect existing connection for this user if any
            if user_id in self.active_connections[project_id]:
                old_ws = self.active_connections[project_id][user_id]["websocket"]
                try:
                    await old_ws.close()
                except Exception as e:
                    logger.debug("Failed to close old WebSocket for user %s: %s", user_id, e)

            self.active_connections[project_id][user_id] = {
                "websocket": websocket,
                "username": username,
                "display_name": display_name,
                "connected_at": datetime.utcnow().isoformat(),
            }

        # Broadcast presence update to other users
        await self.broadcast_presence(project_id)

    async def disconnect(self, project_id: str, user_id: str):
        """Remove a WebSocket connection."""
        async with self._lock:
            if project_id in self.active_connections:
                self.active_connections[project_id].pop(user_id, None)
                if not self.active_connections[project_id]:
                    del self.active_connections[project_id]

        # Broadcast presence update to remaining users
        await self.broadcast_presence(project_id)

    def get_viewers(self, project_id: str) -> list[dict]:
        """Get list of current viewers for a project."""
        if project_id not in self.active_connections:
            return []

        return [
            {
                "user_id": user_id,
                "username": data["username"],
                "display_name": data.get("display_name"),
            }
            for user_id, data in self.active_connections[project_id].items()
        ]

    async def broadcast_presence(self, project_id: str):
        """Broadcast presence update to all users in a project.

        Excludes self from each user's list.
        """
        all_viewers = self.get_viewers(project_id)
        timestamp = datetime.utcnow().isoformat()

        if project_id not in self.active_connections:
            return

        disconnected = []
        for user_id, data in self.active_connections[project_id].items():
            # Each user sees everyone except themselves
            viewers_for_user = [v for v in all_viewers if v["user_id"] != user_id]
            message = {
                "type": "presence",
                "viewers": viewers_for_user,
                "timestamp": timestamp,
            }
            try:
                await data["websocket"].send_json(message)
            except Exception as e:
                logger.debug("WebSocket presence send failed for user %s: %s", user_id, e)
                disconnected.append(user_id)

        for user_id in disconnected:
            await self.disconnect(project_id, user_id)

    async def broadcast(
        self,
        project_id: str,
        message: dict,
        exclude_user: str | None = None,
    ):
        """Broadcast a message to all users in a project."""
        if project_id not in self.active_connections:
            return

        disconnected = []
        for user_id, data in self.active_connections[project_id].items():
            if exclude_user and user_id == exclude_user:
                continue

            try:
                await data["websocket"].send_json(message)
            except Exception as e:
                logger.debug("WebSocket send failed for user %s: %s", user_id, e)
                disconnected.append(user_id)

        # Clean up disconnected users
        for user_id in disconnected:
            await self.disconnect(project_id, user_id)

    async def send_to_user(
        self,
        project_id: str,
        user_id: str,
        message: dict,
    ):
        """Send a message to a specific user."""
        if project_id not in self.active_connections:
            return

        if user_id not in self.active_connections[project_id]:
            return

        try:
            await self.active_connections[project_id][user_id]["websocket"].send_json(message)
        except Exception as e:
            logger.debug("WebSocket send_to_user failed for %s: %s", user_id, e)
            await self.disconnect(project_id, user_id)

    async def broadcast_edit(
        self,
        project_id: str,
        user_id: str,
        username: str,
        entity: str,
        action: str,
        data: dict,
    ):
        """Broadcast an edit event to other users."""
        message = {
            "type": "edit",
            "user_id": user_id,
            "username": username,
            "entity": entity,
            "action": action,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.broadcast(project_id, message, exclude_user=user_id)

    async def broadcast_cursor(
        self,
        project_id: str,
        user_id: str,
        username: str,
        position: dict,
    ):
        """Broadcast cursor position to other users."""
        message = {
            "type": "cursor",
            "user_id": user_id,
            "username": username,
            "position": position,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.broadcast(project_id, message, exclude_user=user_id)

    async def broadcast_selection(
        self,
        project_id: str,
        user_id: str,
        username: str,
        entity_id: str | None,
    ):
        """Broadcast selection change to other users."""
        message = {
            "type": "selection",
            "user_id": user_id,
            "username": username,
            "entity_id": entity_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.broadcast(project_id, message, exclude_user=user_id)


# Global connection manager instance
manager = ConnectionManager()
