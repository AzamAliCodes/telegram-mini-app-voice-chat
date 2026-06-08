import json
import os
from fastapi import APIRouter, Body, Depends
from ..core.redis import redis_client
from ..core.state import room_participants
from loguru import logger
from fastapi_limiter.depends import RateLimiter

router = APIRouter()

@router.get("/room/{room_id}/history", dependencies=[Depends(RateLimiter(times=10, seconds=60))])
async def get_room_history(room_id: str):
    # Fetch last 50 messages from Redis list
    messages_raw = await redis_client.lrange(f"room:{room_id}:history", -50, -1)
    messages = [json.loads(m) for m in messages_raw]
    return {"status": "success", "messages": messages}

@router.post("/room/{room_id}/message", dependencies=[Depends(RateLimiter(times=30, seconds=60))])
async def add_message_to_history(room_id: str, data: dict = Body(...)):

    # Add message to Redis and trim to last 50
    # Expected data: {id, text, sender_name, from_user_id}
    msg_json = json.dumps(data)
    await redis_client.rpush(f"room:{room_id}:history", msg_json)
    await redis_client.ltrim(f"room:{room_id}:history", -50, -1)
    return {"status": "success"}

@router.delete("/room/{room_id}")
async def end_room(room_id: str):
    # Set room state to ended and clear history in Redis
    await redis_client.set(f"room:{room_id}:state", "ended")
    await redis_client.delete(f"room:{room_id}:history")
    
    # Clear in-memory participant tracker if it exists
    if room_id in room_participants:
        room_participants[room_id] = set()
        
    # End room in LiveKit and notify connected clients
    try:
        from livekit import api
        api_key = os.environ.get("LIVEKIT_API_KEY", "devkey")
        api_secret = os.environ.get("LIVEKIT_API_SECRET", "secret")
        livekit_url = os.environ.get("LIVEKIT_URL", "http://localhost:7880")
        
        api_url = livekit_url.replace("wss://", "https://").replace("ws://", "http://")
        
        lkapi = api.LiveKitAPI(url=api_url, api_key=api_key, api_secret=api_secret)
        
        # 1. Broadcast room_ended event via data channel
        msg_payload = json.dumps({"type": "room_ended"}).encode('utf-8')
        req = api.SendDataRequest(room=room_id, data=msg_payload, kind=api.DataPacket.Kind.RELIABLE, destination_identities=[])
        try:
            await lkapi.room.send_data(req)
        except Exception as e:
            logger.warning(f"Failed to broadcast room_ended data: {e}")
            
        # 2. Force delete room to disconnect everyone
        try:
            await lkapi.room.delete_room(api.DeleteRoomRequest(room=room_id))
        except Exception as e:
            logger.warning(f"Failed to delete room: {e}")
            
        await lkapi.aclose()
    except Exception as e:
        logger.warning(f"Failed to clear LiveKit room {room_id}: {e}")

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
        
    try:
        from livekit import api
        api_key = os.environ.get("LIVEKIT_API_KEY", "devkey")
        api_secret = os.environ.get("LIVEKIT_API_SECRET", "secret")
        livekit_url = os.environ.get("LIVEKIT_URL", "http://localhost:7880")
        
        api_url = livekit_url.replace("wss://", "https://").replace("ws://", "http://")
        
        lkapi = api.LiveKitAPI(url=api_url, api_key=api_key, api_secret=api_secret)
        await lkapi.room.delete_room(api.DeleteRoomRequest(room=room_id))
        await lkapi.aclose()
    except Exception as e:
        logger.warning(f"Failed to clear LiveKit room {room_id} on reset: {e}")

    logger.info(f"[Room: {room_id}] [Users: 0 ] Action: ROOM_RESET")
    return {"status": "success", "message": f"Room {room_id} reset"}
