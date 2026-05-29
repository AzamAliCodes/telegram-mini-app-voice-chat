from fastapi import WebSocket
from typing import Dict, List, Optional
import asyncio
import json
from loguru import logger

from ..core.redis import redis_client


class ConnectionManager:
    def __init__(self):
        # WebSocket handles: {room_id: {user_id: WebSocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # SSE handles: {room_id: {user_id: asyncio.Queue}}
        self.sse_clients: Dict[str, Dict[str, asyncio.Queue]] = {}

    # ── WebSocket connections ──────────────────────────────────────

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        s_user_id = str(user_id)
        self.active_connections[room_id][s_user_id] = websocket
        logger.info(f"[Room: {room_id}] Action: WS_CONNECTED | user_id={s_user_id}")

    async def disconnect(self, room_id: str, user_id: str):
        s_user_id = str(user_id)
        if room_id in self.active_connections:
            if s_user_id in self.active_connections[room_id]:
                del self.active_connections[room_id][s_user_id]
                logger.info(f"[Room: {room_id}] Action: WS_DISCONNECTED | user_id={s_user_id}")

        # Also clean up SSE client if present
        if room_id in self.sse_clients:
            if s_user_id in self.sse_clients[room_id]:
                del self.sse_clients[room_id][s_user_id]
                logger.info(f"[Room: {room_id}] Action: SSE_DISCONNECTED | user_id={s_user_id}")

        # Remove from Redis participant list with Lock
        lock_key = f"room:{room_id}:lock"
        try:
            async with redis_client.lock(lock_key, timeout=5):
                participants = await self.get_participants(room_id)
                participants = [p for p in participants if str(p.get("user_id")) != s_user_id]
                await self.set_participants(room_id, participants)
                logger.info(f"[Room: {room_id}] [Users: {len(participants)}] Action: LEAVE | user_id={s_user_id}")
                
                # CRITICAL: Broadcast to remaining users
                await self.broadcast_to_room(room_id, {"type": "user_left", "from_user_id": s_user_id})
                await self.broadcast_to_room(room_id, {"type": "room_state", "participants": participants})
        except Exception as e:
            logger.error(f"Error during disconnect cleanup: {e}")

        # Check if room is now empty (both WS and SSE)
        ws_empty = room_id not in self.active_connections or not self.active_connections[room_id]
        sse_empty = room_id not in self.sse_clients or not self.sse_clients[room_id]
        if ws_empty and sse_empty:
            if room_id in self.active_connections:
                del self.active_connections[room_id]
            if room_id in self.sse_clients:
                del self.sse_clients[room_id]
            await redis_client.expire(f"room:{room_id}:participants", 3600)
            logger.info(f"[Room: {room_id}] Action: ROOM_EMPTY | Room is now empty and participants set to expire.")

    # ── SSE connections ───────────────────────────────────────────

    def register_sse_client(self, room_id: str, user_id: str) -> asyncio.Queue:
        """Register an SSE client and return its message queue."""
        s_user_id = str(user_id)
        if room_id not in self.sse_clients:
            self.sse_clients[room_id] = {}
        queue = asyncio.Queue(maxsize=100)
        self.sse_clients[room_id][s_user_id] = queue
        logger.info(f"[Room: {room_id}] Action: SSE_CONNECTED | user_id={s_user_id}")
        return queue

    def unregister_sse_client(self, room_id: str, user_id: str):
        """Remove an SSE client."""
        s_user_id = str(user_id)
        if room_id in self.sse_clients:
            if s_user_id in self.sse_clients[room_id]:
                del self.sse_clients[room_id][s_user_id]
                logger.info(f"[Room: {room_id}] Action: SSE_UNREGISTERED | user_id={s_user_id}")

    def is_connected(self, room_id: str, user_id: str) -> bool:
        """Check if a user is connected via either WS or SSE."""
        s = str(user_id)
        ws_ok = room_id in self.active_connections and s in self.active_connections[room_id]
        sse_ok = room_id in self.sse_clients and s in self.sse_clients[room_id]
        return ws_ok or sse_ok

    # ── Participant state (Redis) ─────────────────────────────────

    async def get_participants(self, room_id: str) -> List[dict]:
        try:
            data = await redis_client.get(f"room:{room_id}:participants")
            return json.loads(data) if data else []
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return []

    async def set_participants(self, room_id: str, participants: List[dict]):
        try:
            await redis_client.set(f"room:{room_id}:participants", json.dumps(participants))
        except Exception as e:
            logger.error(f"Redis set error: {e}")

    async def add_participant(self, room_id: str, user_id: str, user_info: dict):
        s_user_id = str(user_id)
        lock_key = f"room:{room_id}:lock"
        
        async with redis_client.lock(lock_key, timeout=5):
            participants = await self.get_participants(room_id)
            participants = [p for p in participants if str(p.get("user_id")) != s_user_id]
            new_participant = {
                "user_id": s_user_id,
                "first_name": user_info.get("first_name", "Anonymous"),
                "photo_url": user_info.get("photo_url", ""),
                "is_muted": user_info.get("is_muted", True),
                "is_speaking": False
            }
            participants.append(new_participant)
            await self.set_participants(room_id, participants)
            logger.info(f"[Room: {room_id}] [Users: {len(participants)}] Action: JOIN_SUCCESS | user_id={s_user_id}")
            return participants

    # ── Message delivery (unified WS + SSE) ───────────────────────

    async def _send_to_ws(self, user_id: str, room_id: str, message: dict) -> bool:
        """Try to send via WebSocket. Returns True if sent."""
        if room_id in self.active_connections:
            ws = self.active_connections[room_id].get(str(user_id))
            if ws:
                try:
                    await ws.send_text(json.dumps(message))
                    return True
                except Exception as e:
                    logger.error(f"WS send failed to {user_id}: {e}")
        return False

    async def _send_to_sse(self, user_id: str, room_id: str, message: dict) -> bool:
        """Try to enqueue for SSE. Returns True if enqueued."""
        if room_id in self.sse_clients:
            queue = self.sse_clients[room_id].get(str(user_id))
            if queue:
                try:
                    queue.put_nowait(message)
                    return True
                except asyncio.QueueFull:
                    logger.warning(f"SSE queue full for {user_id}, dropping message")
        return False

    async def send_to_user(self, room_id: str, target_user_id: str, message: dict):
        """Send a message to a specific user via whatever transport they use."""
        sent = await self._send_to_ws(target_user_id, room_id, message)
        if not sent:
            await self._send_to_sse(target_user_id, room_id, message)

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user: str = None):
        """Broadcast to all users in a room via their respective transports."""
        s_exclude = str(exclude_user) if exclude_user else None

        # WebSocket clients
        if room_id in self.active_connections:
            targets = list(self.active_connections[room_id].items())
            for target_id, websocket in targets:
                if target_id != s_exclude:
                    try:
                        await websocket.send_text(json.dumps(message))
                    except Exception as e:
                        logger.error(f"Broadcast WS failed to {target_id}: {e}")

        # SSE clients
        if room_id in self.sse_clients:
            targets = list(self.sse_clients[room_id].items())
            for target_id, queue in targets:
                if target_id != s_exclude:
                    try:
                        queue.put_nowait(message)
                    except asyncio.QueueFull:
                        logger.warning(f"Broadcast SSE queue full for {target_id}")

    async def end_room(self, room_id: str):
        message = {"type": "room_ended"}
        
        # Mark room as ended in Redis persistently for 24 hours
        try:
            await redis_client.set(f"room:{room_id}:state", "ended", ex=86400)
        except Exception as e:
            logger.error(f"Failed to set room ended state in Redis: {e}")

        # Broadcast to all before closing
        await self.broadcast_to_room(room_id, message)

        # Give a small buffer for message delivery
        await asyncio.sleep(0.5)

        # Close WebSocket clients
        if room_id in self.active_connections:
            for websocket in list(self.active_connections[room_id].values()):
                try:
                    await websocket.close(code=1000)
                except Exception:
                    pass
            del self.active_connections[room_id]

        # Notify SSE clients
        if room_id in self.sse_clients:
            del self.sse_clients[room_id]

        await redis_client.delete(f"room:{room_id}:participants")
        logger.info(f"[Room: {room_id}] Action: END_ROOM | Redis state cleared.")


manager = ConnectionManager()
