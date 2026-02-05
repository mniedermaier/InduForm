"""Tests for WebSocket message validation and connection manager."""

import json
import pytest

from induform.api.websocket.routes import _validate_message
from induform.api.websocket.manager import ConnectionManager


class TestMessageValidation:
    """Tests for WebSocket message validation."""

    def test_valid_cursor_message(self):
        """Test a valid cursor message."""
        msg, err = _validate_message('{"type": "cursor", "position": {"x": 100, "y": 200}}')
        assert err is None
        assert msg["type"] == "cursor"
        assert msg["position"] == {"x": 100, "y": 200}

    def test_valid_cursor_without_position(self):
        """Test cursor message without position (optional)."""
        msg, err = _validate_message('{"type": "cursor"}')
        assert err is None
        assert msg["type"] == "cursor"

    def test_valid_selection_message(self):
        """Test a valid selection message."""
        msg, err = _validate_message('{"type": "selection", "entity_id": "zone-1"}')
        assert err is None
        assert msg["entity_id"] == "zone-1"

    def test_valid_selection_deselect(self):
        """Test selection with null entity_id (deselect)."""
        msg, err = _validate_message('{"type": "selection"}')
        assert err is None
        assert msg["type"] == "selection"

    def test_valid_edit_message(self):
        """Test a valid edit message with required fields."""
        raw = json.dumps({
            "type": "edit",
            "entity": "zone",
            "action": "update",
            "data": {"name": "New Zone Name"},
        })
        msg, err = _validate_message(raw)
        assert err is None
        assert msg["entity"] == "zone"
        assert msg["action"] == "update"

    def test_edit_missing_entity(self):
        """Test edit message missing required 'entity' field."""
        raw = json.dumps({"type": "edit", "action": "update"})
        msg, err = _validate_message(raw)
        assert msg is None
        assert "Missing required field 'entity'" in err

    def test_edit_missing_action(self):
        """Test edit message missing required 'action' field."""
        raw = json.dumps({"type": "edit", "entity": "zone"})
        msg, err = _validate_message(raw)
        assert msg is None
        assert "Missing required field 'action'" in err

    def test_valid_ping_message(self):
        """Test a valid ping message."""
        msg, err = _validate_message('{"type": "ping", "timestamp": 1234567890}')
        assert err is None
        assert msg["type"] == "ping"

    def test_unknown_message_type(self):
        """Test an unknown message type."""
        msg, err = _validate_message('{"type": "unknown_type"}')
        assert msg is None
        assert "Unknown message type" in err

    def test_missing_type_field(self):
        """Test message without type field."""
        msg, err = _validate_message('{"data": "no type"}')
        assert msg is None
        assert "Missing or invalid 'type'" in err

    def test_invalid_type_field(self):
        """Test message with non-string type field."""
        msg, err = _validate_message('{"type": 123}')
        assert msg is None
        assert "Missing or invalid 'type'" in err

    def test_invalid_json(self):
        """Test invalid JSON input."""
        msg, err = _validate_message("not json at all")
        assert msg is None
        assert "Invalid JSON" in err

    def test_non_object_message(self):
        """Test a non-object JSON message."""
        msg, err = _validate_message('"just a string"')
        assert msg is None
        assert "must be a JSON object" in err

    def test_array_message(self):
        """Test an array JSON message."""
        msg, err = _validate_message('[1, 2, 3]')
        assert msg is None
        assert "must be a JSON object" in err

    def test_message_too_large(self):
        """Test message exceeding max size."""
        large = json.dumps({"type": "cursor", "data": "x" * 20000})
        msg, err = _validate_message(large)
        assert msg is None
        assert "Message too large" in err

    def test_cursor_invalid_position_type(self):
        """Test cursor with non-object position."""
        msg, err = _validate_message('{"type": "cursor", "position": "invalid"}')
        assert msg is None
        assert "'position' must be an object" in err

    def test_cursor_position_as_number(self):
        """Test cursor with numeric position."""
        msg, err = _validate_message('{"type": "cursor", "position": 42}')
        assert msg is None
        assert "'position' must be an object" in err

    def test_empty_object_message(self):
        """Test empty JSON object."""
        msg, err = _validate_message("{}")
        assert msg is None
        assert "Missing or invalid 'type'" in err


class TestConnectionManager:
    """Tests for the WebSocket connection manager."""

    def test_get_viewers_empty(self):
        """Test getting viewers for a project with no connections."""
        mgr = ConnectionManager()
        assert mgr.get_viewers("project-1") == []

    @pytest.mark.asyncio
    async def test_disconnect_not_connected(self):
        """Test disconnecting a user that isn't connected."""
        mgr = ConnectionManager()
        # Should not raise
        await mgr.disconnect("project-1", "user-1")
        assert mgr.get_viewers("project-1") == []

    @pytest.mark.asyncio
    async def test_send_to_user_not_connected(self):
        """Test sending to a user not in any project."""
        mgr = ConnectionManager()
        # Should not raise
        await mgr.send_to_user("project-1", "user-1", {"type": "test"})

    @pytest.mark.asyncio
    async def test_broadcast_empty_project(self):
        """Test broadcasting to a project with no connections."""
        mgr = ConnectionManager()
        # Should not raise
        await mgr.broadcast("project-1", {"type": "test"})
