import pytest
from httpx import AsyncClient, ASGITransport
from ..main import app

@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_root():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "msg": "VCBot Backend Running"}

@pytest.mark.asyncio
async def test_ice_config():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/ice-config")
    assert response.status_code == 200
    assert "iceServers" in response.json()

from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_get_participants_empty():
    with patch('backend.api.rooms.redis_client.get', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/room/nonexistent/participants")
        assert response.status_code == 200
        assert response.json() == []
