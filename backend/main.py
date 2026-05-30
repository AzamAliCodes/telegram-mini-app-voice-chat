from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .api import ice, rooms
from .core.config import settings
from .signaling.manager import manager
from loguru import logger
import json
import asyncio

app = FastAPI(title="VCBot Signaling Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming: {request.method} {request.url.path}")
    response = await call_next(request)
    if response.status_code == 404:
        logger.warning(f"404: {request.url.path}")
    return response

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ROOT SIGNALING ENDPOINTS (Most compatible with HF/Proxies)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{user_id}")
@app.websocket("/api/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    logger.info(f"[Room: {room_id}] Action: WS_CONNECT_ATTEMPT | user_id={user_id}")
    
    # Check room state
    from .core.redis import redis_client
    room_state = await redis_client.get(f"room:{room_id}:state")
    if room_state == "ended":
        await websocket.accept()
        await websocket.send_text(json.dumps({"type": "room_ended"}))
        await websocket.close(code=1000)
        return
    elif not room_state:
        # If no state is found, it means the room was never started or expired
        await websocket.accept()
        await websocket.send_text(json.dumps({"type": "room_not_started"}))
        await websocket.close(code=1000)
        return

    await manager.connect(websocket, room_id, user_id)
    try:
        # Auto-Auth for v3.1 Debugging
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            logger.info(f"[Room: {room_id}] Action: HANDSHAKE | user_id={user_id}")
        except: pass
        
        await websocket.send_text(json.dumps({"type": "auth_ok"}))
        while True:
            data = await websocket.receive_text()
            await _handle_message(json.loads(data), room_id, user_id)
    except WebSocketDisconnect:
        await manager.disconnect(room_id, user_id)
    except Exception as e:
        logger.error(f"[Room: {room_id}] Action: WS_ERROR | user_id={user_id} error='{e}'")
        await manager.disconnect(room_id, user_id)

@app.post("/poll/{room_id}/{user_id}/connect")
@app.post("/api/poll/{room_id}/{user_id}/connect")
async def poll_connect(room_id: str, user_id: str, request: Request):
    logger.info(f"[Room: {room_id}] Action: POLL_CONNECT | user_id={user_id}")
    
    # Check if room is ended
    from .core.redis import redis_client
    room_state = await redis_client.get(f"room:{room_id}:state")
    if room_state == "ended":
        return {"status": "error", "message": "room_ended"}
    elif not room_state:
        return {"status": "error", "message": "room_not_started"}

    manager.register_sse_client(room_id, user_id)
    body = await request.json()
    if body.get("type"): await _handle_message(body, room_id, user_id)
    participants = await manager.get_participants(room_id)
    return {"status": "ok", "initial_state": participants}

@app.get("/poll/{room_id}/{user_id}")
@app.get("/api/poll/{room_id}/{user_id}")
async def poll_messages(room_id: str, user_id: str):
    s_user_id = str(user_id)
    messages = []
    if room_id in manager.sse_clients and s_user_id in manager.sse_clients[room_id]:
        queue = manager.sse_clients[room_id][s_user_id]
        while not queue.empty():
            try: messages.append(queue.get_nowait())
            except: break
    return {"messages": messages}

@app.post("/signal/{room_id}/{user_id}")
@app.post("/api/signal/{room_id}/{user_id}")
async def signal_send(room_id: str, user_id: str, request: Request):
    await _handle_message(await request.json(), room_id, user_id)
    return {"status": "ok"}

@app.get("/ice-config")
@app.get("/api/ice-config")
async def get_ice_root():
    # Helper to ensure ICE config is reachable at root
    from .api.ice import get_ice_config
    return await get_ice_config()

# Shared message handler
async def _handle_message(message: dict, room_id: str, user_id: str):
    m_type = message.get("type")
    if m_type == "ping":
        await manager.send_to_user(room_id, user_id, {"type": "pong"})
    elif m_type == "join":
        u_info = message.get("user_info", {})
        parts = await manager.add_participant(room_id, user_id, u_info)
        logger.info(f"[Room: {room_id}] [Users: {len(parts)}] Action: JOIN | user_id={user_id} name='{u_info.get('first_name', 'Anon')}'")
        await manager.broadcast_to_room(room_id, {"type": "room_state", "participants": parts})
        await manager.broadcast_to_room(room_id, {"type": "user_joined", "from_user_id": user_id, "user_info": u_info}, exclude_user=user_id)
    elif m_type in ["offer", "answer", "ice_candidate"]:
        target = message.get("target_user_id")
        if target:
            message["from_user_id"] = user_id
            await manager.send_to_user(room_id, target, message)
    elif m_type == "mute":
        is_m = message.get("is_muted", True)
        parts = await manager.get_participants(room_id)
        logger.info(f"[Room: {room_id}] [Users: {len(parts)}] Action: MUTE_TOGGLE | user_id={user_id} is_muted={is_m}")
        for p in parts:
            if p["user_id"] == user_id: p["is_muted"] = is_m
        await manager.set_participants(room_id, parts)
        await manager.broadcast_to_room(room_id, {"type": "mute", "from_user_id": user_id, "is_muted": is_m}, exclude_user=user_id)
    elif m_type == "speaker":
        is_spk = message.get("is_speaker_on", True)
        parts = await manager.get_participants(room_id)
        logger.info(f"[Room: {room_id}] [Users: {len(parts)}] Action: SPEAKER_TOGGLE | user_id={user_id} is_speaker_on={is_spk}")
        await manager.broadcast_to_room(room_id, {"type": "speaker", "from_user_id": user_id, "is_speaker_on": is_spk}, exclude_user=user_id)
    elif m_type == "speaking":
        is_spk = message.get("is_speaking", False)
        await manager.broadcast_to_room(room_id, {"type": "speaking", "from_user_id": user_id, "is_speaking": is_spk}, exclude_user=user_id)
    elif m_type == "chat_message":
        text = message.get("text", "")
        if text:
            parts = await manager.get_participants(room_id)
            logger.info(f"[Room: {room_id}] [Users: {len(parts)}] Action: CHAT_MSG | user_id={user_id}")
            await manager.broadcast_to_room(room_id, {
                "type": "chat_message",
                "from_user_id": user_id,
                "text": text,
                "sender_name": message.get("sender_name", "Unknown"),
            })

app.include_router(ice.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "ok", "msg": "VCBot Backend Running"}
