import pytest
from httpx import AsyncClient
from ..main import app

@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "backend"}

@pytest.mark.asyncio
async def test_ice_config():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/ice-config")
    assert response.status_code == 200
    assert "iceServers" in response.json()

@pytest.mark.asyncio
async def test_get_participants_empty():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/room/nonexistent/participants")
    assert response.status_code == 200
    assert response.json() == []
