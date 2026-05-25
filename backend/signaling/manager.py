from fastapi import WebSocket
from typing import Dict, List
import json
from loguru import logger

from ..core.redis import redis_client

class ConnectionManager:
    def __init__(self):
        # Memory-based active connections: {room_id: {user_id: WebSocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        
        # User IDs must be strings for consistent comparison
        s_user_id = str(user_id)
        self.active_connections[room_id][s_user_id] = websocket
        logger.info(f"User {s_user_id} WebSocket accepted in room {room_id}")

    async def disconnect(self, room_id: str, user_id: str):
        s_user_id = str(user_id)
        if room_id in self.active_connections:
            if s_user_id in self.active_connections[room_id]:
                del self.active_connections[room_id][s_user_id]
                logger.info(f"User {s_user_id} removed from memory in room {room_id}")

            # Only wipe Redis if the room is truly empty in the server's memory
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                await redis_client.delete(f"room:{room_id}:participants")
                await redis_client.delete(f"room:{room_id}:state")
                logger.info(f"Room {room_id} is empty. Redis state cleared.")
                return

        # Update Redis participant list for remaining users
        participants = await self.get_participants(room_id)
        participants = [p for p in participants if str(p.get("user_id")) != s_user_id]
        await self.set_participants(room_id, participants)
        logger.info(f"User {s_user_id} left. Remaining in room {room_id}: {len(participants)}")

    async def get_participants(self, room_id: str) -> List[dict]:
        data = await redis_client.get(f"room:{room_id}:participants")
        return json.loads(data) if data else []

    async def set_participants(self, room_id: str, participants: List[dict]):
        await redis_client.set(f"room:{room_id}:participants", json.dumps(participants))

    async def add_participant(self, room_id: str, user_id: str, user_info: dict):
        s_user_id = str(user_id)
        participants = await self.get_participants(room_id)
        
        # Remove old entry for this user if it exists (prevents duplicates)
        participants = [p for p in participants if str(p.get("user_id")) != s_user_id]
        
        new_participant = {
            "user_id": s_user_id,
            "first_name": user_info.get("first_name", "Anonymous"),
            "photo_url": user_info.get("photo_url", ""),
            "is_muted": True,
            "is_speaking": False
        }
        participants.append(new_participant)
        
        await self.set_participants(room_id, participants)
        logger.info(f"User {s_user_id} added to Redis. Total in room {room_id}: {len(participants)}")
        return participants

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user: str = None):
        if room_id in self.active_connections:
            s_exclude = str(exclude_user) if exclude_user else None
            for user_id, websocket in list(self.active_connections[room_id].items()):
                if user_id != s_exclude:
                    try:
                        await websocket.send_text(json.dumps(message))
                    except Exception as e:
                        logger.error(f"Failed broadcast to {user_id}: {e}")

    async def send_to_user(self, room_id: str, target_user_id: str, message: dict):
        s_target = str(target_user_id)
        if room_id in self.active_connections and s_target in self.active_connections[room_id]:
            try:
                await self.active_connections[room_id][s_target].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed send to {s_target}: {e}")

manager = ConnectionManager()
