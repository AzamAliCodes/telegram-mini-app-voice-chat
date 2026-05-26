from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from .api import ice, rooms
from .core.config import settings
from .signaling.manager import manager
from .core.security import verify_telegram_init_data
from loguru import logger
import json
import asyncio

app = FastAPI(title="VCBot Signaling Server")

# Enable CORS with maximum permissions for mobile devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global Request Logger
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming {request.method}: {request.url.path}")
    response = await call_next(request)
    if response.status_code == 404:
        logger.warning(f"404 Not Found: {request.url.path}")
    return response

@app.get("/")
async def root():
    return {"message": "VCBot Signaling Server is running", "v": "2.5"}

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.5"}

app.include_router(ice.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")

AUTH_TIMEOUT_SECONDS = 10


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TRANSPORT 1: WebSocket
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    logger.info(f"WS Attempt: room={room_id}, user={user_id}")
    await manager.connect(websocket, room_id, user_id)

    try:
        # ── Auth handshake (Temporarily disabled for debugging) ─────
        authenticated = True 
        
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
            logger.info(f"Received handshake from {user_id}")
        except asyncio.TimeoutError:
            pass

        await websocket.send_text(json.dumps({"type": "auth_ok"}))
        logger.info(f"WS Auto-Auth OK: user={user_id}")

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            await _handle_message(message, room_id, user_id)

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from room {room_id}")
        await manager.disconnect(room_id, user_id)
        await manager.broadcast_to_room(room_id, {"type": "user_left", "from_user_id": user_id})
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await manager.disconnect(room_id, user_id)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TRANSPORT 2: HTTP Polling (fallback — works on mobile)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/poll/{room_id}/{user_id}/connect")
async def poll_connect(room_id: str, user_id: str, request: Request):
    """
    Register a polling client and return initial room state immediately.
    """
    logger.info(f"Poll connect: room={room_id}, user={user_id}")
    manager.register_sse_client(room_id, user_id)  # Reuses SSE queue infra

    body = await request.json()
    if body.get("type"):
        await _handle_message(body, room_id, user_id)

    # Fetch fresh participants list for immediate UI update
    participants = await manager.get_participants(room_id)
    return {"status": "ok", "initial_state": participants}


@app.get("/api/poll/{room_id}/{user_id}")
async def poll_messages(room_id: str, user_id: str):
    """
    Drain all pending messages for this user.
    """
    s_user_id = str(user_id)
    messages = []
    if room_id in manager.sse_clients and s_user_id in manager.sse_clients[room_id]:
        queue = manager.sse_clients[room_id][s_user_id]
        while not queue.empty():
            try:
                msg = queue.get_nowait()
                messages.append(msg)
            except asyncio.QueueEmpty:
                break
    return {"messages": messages}


@app.post("/api/poll/{room_id}/{user_id}/disconnect")
async def poll_disconnect(room_id: str, user_id: str):
    """Clean up when a polling client leaves."""
    logger.info(f"Poll disconnect: room={room_id}, user={user_id}")
    manager.unregister_sse_client(room_id, user_id)
    await manager.disconnect(room_id, user_id)
    await manager.broadcast_to_room(room_id, {"type": "user_left", "from_user_id": user_id})
    return {"status": "ok"}


@app.post("/api/signal/{room_id}/{user_id}")
async def signal_send(room_id: str, user_id: str, request: Request):
    """
    HTTP POST endpoint for polling clients to send messages.
    """
    body = await request.json()
    await _handle_message(body, room_id, user_id)
    return {"status": "ok"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Shared message handler
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _handle_message(message: dict, room_id: str, user_id: str):
    """Process a single incoming signaling message from either transport."""
    message_type = message.get("type")

    if message_type == "ping":
        await manager.send_to_user(room_id, user_id, {"type": "pong"})

    elif message_type == "join":
        user_info = message.get("user_info", {})
        logger.info(f"User {user_id} ({user_info.get('first_name')}) joined room {room_id}")
        participants = await manager.add_participant(room_id, user_id, user_info)
        await manager.broadcast_to_room(room_id, {"type": "room_state", "participants": participants})
        await manager.broadcast_to_room(
            room_id,
            {"type": "user_joined", "from_user_id": user_id, "user_info": user_info},
            exclude_user=user_id,
        )

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
        await manager.broadcast_to_room(
            room_id,
            {"type": "speaking", "from_user_id": user_id, "is_speaking": is_speaking},
            exclude_user=user_id,
        )

    elif message_type == "mute":
        is_muted = message.get("is_muted", True)
        participants = await manager.get_participants(room_id)
        for p in participants:
            if p["user_id"] == user_id:
                p["is_muted"] = is_muted
        await manager.set_participants(room_id, participants)
        await manager.broadcast_to_room(
            room_id,
            {"type": "mute", "from_user_id": user_id, "is_muted": is_muted},
            exclude_user=user_id,
        )

    elif message_type == "chat_message":
        text = message.get("text", "")
        if text:
            logger.info(f"Chat from {user_id} in {room_id}: {text[:50]}")
            await manager.broadcast_to_room(room_id, {
                "type": "chat_message",
                "from_user_id": user_id,
                "text": text,
                "sender_name": message.get("sender_name", "Unknown"),
            })
