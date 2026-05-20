from fastapi import APIRouter
from ..core.config import settings

router = APIRouter()

@router.get("/ice-config")
async def get_ice_config():
    ice_servers = [
        {"urls": "stun:stun.l.google.com:19302"}
    ]

    turn_url = settings.TURN_URL
    if turn_url and turn_url.startswith("turn:"):
        ice_servers.append({
            "urls": turn_url,
            "username": settings.TURN_USERNAME,
            "credential": settings.TURN_PASSWORD
        })

    return {"iceServers": ice_servers}
