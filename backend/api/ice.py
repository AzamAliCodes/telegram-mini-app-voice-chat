from fastapi import APIRouter
from ..core.config import settings
import logging
import time

router = APIRouter()
logger = logging.getLogger(__name__)

_ice_cache = {"data": None, "expires": 0}

@router.get("/ice-config")
async def get_ice_config():
    now = time.time()
    if _ice_cache["data"] and _ice_cache["expires"] > now:
        return _ice_cache["data"]

    ice_servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun2.l.google.com:19302"},
        {"urls": "stun:stun.stunprotocol.org"},
    ]

    turn_url = settings.TURN_URL
    if turn_url and turn_url.startswith("turn:"):
        logger.info("Using TURN credentials from env vars.")
        ice_servers.append({
            "urls": turn_url,
            "username": settings.TURN_USERNAME,
            "credential": settings.TURN_PASSWORD
        })
    else:
        logger.info("No TURN configured — STUN-only. P2P may fail on restrictive networks.")

    res = {"iceServers": ice_servers}
    _ice_cache["data"] = res
    _ice_cache["expires"] = time.time() + 600
    return res
