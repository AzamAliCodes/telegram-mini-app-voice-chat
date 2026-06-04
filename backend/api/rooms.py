from fastapi import APIRouter
from ..core.redis import redis_client

router = APIRouter()

@router.delete("/room/{room_id}")
async def end_room(room_id: str):
    # Clear room state in Redis
    await redis_client.delete(f"room:{room_id}:state")
    return {"status": "success", "message": f"Room {room_id} ended"}

@router.post("/room/{room_id}/start")
async def start_room(room_id: str):
    # Mark room as active in Redis for Anti-DDoS token verification
    await redis_client.set(f"room:{room_id}:state", "active")
    return {"status": "success", "message": f"Room {room_id} started"}

@router.post("/room/{room_id}/reset")
async def reset_room(room_id: str):
    # Clear any state
    await redis_client.delete(f"room:{room_id}:state")
    return {"status": "success", "message": f"Room {room_id} reset"}
