from fastapi import APIRouter
from ..core.redis import redis_client
from ..signaling.manager import manager
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

@router.delete("/room/{room_id}")
async def end_room(room_id: str):
    await manager.end_room(room_id)
    return {"status": "success", "message": f"Room {room_id} ended"}

@router.post("/room/{room_id}/start")
async def start_room(room_id: str):
    # Mark room as active in Redis
    await redis_client.set(f"room:{room_id}:state", "active")
    return {"status": "success", "message": f"Room {room_id} started"}

@router.post("/room/{room_id}/reset")
async def reset_room(room_id: str):
    # Clear any state
    await redis_client.delete(f"room:{room_id}:state")
    return {"status": "success", "message": f"Room {room_id} reset"}
