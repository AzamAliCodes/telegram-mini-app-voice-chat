import pytest
from ..signaling.manager import ConnectionManager
from unittest.mock import AsyncMock, patch

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
    with patch('backend.signaling.manager.redis_client') as mock_redis:
        # Mock redis lock and expire
        mock_lock = AsyncMock()
        mock_lock.__aenter__.return_value = None
        mock_lock.__aexit__.return_value = None
        mock_redis.lock.return_value = mock_lock
        mock_redis.expire = AsyncMock()
        
        manager = ConnectionManager()
        # Mock other dependencies
        manager.get_participants = AsyncMock(return_value=[])
        manager.set_participants = AsyncMock()
        manager.broadcast_to_room = AsyncMock()
        
        ws = AsyncMock()
        room_id = "test_room"
        user_id = "test_user"
        
        await manager.connect(ws, room_id, user_id)
        await manager.disconnect(room_id, user_id)
        
        assert room_id not in manager.active_connections
