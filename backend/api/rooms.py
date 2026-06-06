from fastapi import APIRouter
from ..core.redis import redis_client
from loguru import logger
from ..core.state import room_participants

router = APIRouter()

@router.delete("/room/{room_id}")
async def end_room(room_id: str):
    # Clear room state in Redis
    await redis_client.delete(f"room:{room_id}:state")
    
    # Clear in-memory participant tracker if it exists
    if room_id in room_participants:
        room_participants[room_id] = set()
        
    logger.info(f"[Room: {room_id}] [Users: 0 ] Action: ROOM_ENDED")
    return {"status": "success", "message": f"Room {room_id} ended"}

@router.post("/room/{room_id}/start")
async def start_room(room_id: str):
    # Mark room as active in Redis for Anti-DDoS token verification
    await redis_client.set(f"room:{room_id}:state", "active")
    logger.info(f"[Room: {room_id}] [Users: 0 ] Action: ROOM_STARTED")
    return {"status": "success", "message": f"Room {room_id} started"}

@router.post("/room/{room_id}/reset")
async def reset_room(room_id: str):
    # Clear any state
    await redis_client.delete(f"room:{room_id}:state")
    
    # Clear in-memory participant tracker if it exists
    if room_id in room_participants:
        room_participants[room_id] = set()
        
    logger.info(f"[Room: {room_id}] [Users: 0 ] Action: ROOM_RESET")
    return {"status": "success", "message": f"Room {room_id} reset"}
