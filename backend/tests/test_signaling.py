import pytest
from ..signaling.manager import ConnectionManager
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_manager_connect():
    manager = ConnectionManager()
    ws = AsyncMock()
    room_id = "test_room"
    user_id = "test_user"
    
    await manager.connect(ws, room_id, user_id)
    
    assert room_id in manager.active_connections
    assert user_id in manager.active_connections[room_id]
    ws.accept.assert_called_once()

@pytest.mark.asyncio
async def test_manager_disconnect():
    manager = ConnectionManager()
    # Mock redis and other dependencies if needed, or just test memory state
    manager.get_participants = AsyncMock(return_value=[])
    manager.set_participants = AsyncMock()
    
    ws = AsyncMock()
    room_id = "test_room"
    user_id = "test_user"
    
    await manager.connect(ws, room_id, user_id)
    await manager.disconnect(room_id, user_id)
    
    assert room_id not in manager.active_connections
