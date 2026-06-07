import json
from fastapi import APIRouter, Body
from ..core.redis import redis_client
from loguru import logger
from ..core.state import room_participants

router = APIRouter()

@router.get("/room/{room_id}/history")
async def get_room_history(room_id: str):
    # Fetch last 50 messages from Redis list
    messages_raw = await redis_client.lrange(f"room:{room_id}:history", -50, -1)
    messages = [json.loads(m) for m in messages_raw]
    return {"status": "success", "messages": messages}

@router.post("/room/{room_id}/message")
async def add_message_to_history(room_id: str, data: dict = Body(...)):
    # Add message to Redis and trim to last 50
    # Expected data: {id, text, sender_name, from_user_id}
    msg_json = json.dumps(data)
    await redis_client.rpush(f"room:{room_id}:history", msg_json)
    await redis_client.ltrim(f"room:{room_id}:history", -50, -1)
    return {"status": "success"}

@router.delete("/room/{room_id}")
async def end_room(room_id: str):
    # Clear room state and history in Redis
    await redis_client.delete(f"room:{room_id}:state")
    await redis_client.delete(f"room:{room_id}:history")
    
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
