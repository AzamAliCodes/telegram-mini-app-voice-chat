from fastapi import APIRouter
from ..core.redis import redis_client
import json

router = APIRouter()

@router.get("/room/{room_id}/participants")
async def get_participants(room_id: str):
    # Fetch participants from Redis
    participants_json = await redis_client.get(f"room:{room_id}:participants")
    if not participants_json:
        return []
    return json.loads(participants_json)

@router.post("/room/{room_id}/participants/notify")
async def notify_participants(room_id: str):
    # Placeholder for notifying participants via bot
    return {"status": "notified"}
