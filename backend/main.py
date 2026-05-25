from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import ice, rooms
from .core.config import settings

from .signaling.manager import manager
from fastapi import WebSocket, WebSocketDisconnect
import json

app = FastAPI(title="VCBot Signaling Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "VCBot Signaling Server is running"}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "backend"}

app.include_router(ice.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")

from fastapi import WebSocket, WebSocketDisconnect, Query
from loguru import logger
from .core.security import verify_telegram_init_data

@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str, init_data: str = Query(None)):
    logger.info(f"Connection attempt: room={room_id}, user={user_id}, has_init_data={init_data is not None}")
    
    # Security: Validate init_data from Telegram if in production
    if settings.ENVIRONMENT == "production":
        if not init_data or not verify_telegram_init_data(init_data, settings.TELEGRAM_BOT_TOKEN):
            logger.warning(f"Forbidden connection attempt rejected: user={user_id}")
            await websocket.close(code=4003) # Forbidden
            return

    await manager.connect(websocket, room_id, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            logger.debug(f"Received message {message_type} from {user_id} in {room_id}")
            
            if message_type == "join":
                user_info = message.get("user_info", {})
                logger.info(f"User {user_id} ({user_info.get('first_name')}) joined room {room_id}")
                participants = await manager.add_participant(room_id, user_id, user_info)
                # Broadcast new state
                await manager.broadcast_to_room(room_id, {
                    "type": "room_state",
                    "participants": participants
                })
                # Notify others about new user
                await manager.broadcast_to_room(room_id, {
                    "type": "user_joined",
                    "from_user_id": user_id,
                    "user_info": user_info
                }, exclude_user=user_id)
                
            elif message_type in ["offer", "answer", "ice_candidate"]:
                target_user_id = message.get("target_user_id")
                if target_user_id:
                    message["from_user_id"] = user_id
                    await manager.send_to_user(room_id, target_user_id, message)
            
            elif message_type == "speaking":
                is_speaking = message.get("is_speaking", False)
                participants = await manager.get_participants(room_id)
                for p in participants:
                    if p["user_id"] == user_id:
                        p["is_speaking"] = is_speaking
                await manager.set_participants(room_id, participants)
                await manager.broadcast_to_room(room_id, {
                    "type": "speaking",
                    "from_user_id": user_id,
                    "is_speaking": is_speaking
                }, exclude_user=user_id)

            elif message_type == "mute":
                is_muted = message.get("is_muted", True)
                participants = await manager.get_participants(room_id)
                for p in participants:
                    if p["user_id"] == user_id:
                        p["is_muted"] = is_muted
                await manager.set_participants(room_id, participants)
                await manager.broadcast_to_room(room_id, {
                    "type": "mute",
                    "from_user_id": user_id,
                    "is_muted": is_muted
                }, exclude_user=user_id)

            elif message_type == "chat_message":
                text = message.get("text", "")
                if text:
                    logger.info(f"Chat from {user_id} in {room_id}: {text[:50]}")
                    await manager.broadcast_to_room(room_id, {
                        "type": "chat_message",
                        "from_user_id": user_id,
                        "text": text,
                        "sender_name": message.get("sender_name", "Unknown")
                    })
                
    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from room {room_id}")
        await manager.disconnect(room_id, user_id)
        await manager.broadcast_to_room(room_id, {
            "type": "user_left",
            "from_user_id": user_id
        })
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await manager.disconnect(room_id, user_id)
