from fastapi import WebSocket
from typing import Dict, List
import json
from loguru import logger

from ..core.redis import redis_client

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        self.active_connections[room_id][user_id] = websocket
        logger.info(f"User {user_id} connected to room {room_id}")

    async def disconnect(self, room_id: str, user_id: str):
        if room_id in self.active_connections:
            if user_id in self.active_connections[room_id]:
                del self.active_connections[room_id][user_id]
                logger.info(f"User {user_id} disconnected from room {room_id}")

            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                await redis_client.delete(f"room:{room_id}:participants")
                await redis_client.delete(f"room:{room_id}:state")
                logger.info(f"Room {room_id} cleaned up from Redis")
                return

        participants = await self.get_participants(room_id)
        participants = [p for p in participants if p["user_id"] != user_id]
        await self.set_participants(room_id, participants)

    async def get_participants(self, room_id: str) -> List[dict]:
        data = await redis_client.get(f"room:{room_id}:participants")
        return json.loads(data) if data else []

    async def set_participants(self, room_id: str, participants: List[dict]):
        await redis_client.set(f"room:{room_id}:participants", json.dumps(participants))

    async def add_participant(self, room_id: str, user_id: str, user_info: dict):
        participants = await self.get_participants(room_id)
        participants = [p for p in participants if p["user_id"] != user_id]
        participants.append({
            "user_id": user_id,
            **user_info,
            "is_muted": True,
            "is_speaking": False
        })
        await self.set_participants(room_id, participants)
        return participants

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user: str = None):
        if room_id in self.active_connections:
            for user_id, websocket in list(self.active_connections[room_id].items()):
                if user_id != exclude_user:
                    try:
                        await websocket.send_text(json.dumps(message))
                    except Exception as e:
                        logger.error(f"Error broadcasting to user {user_id}: {e}")

    async def send_to_user(self, room_id: str, target_user_id: str, message: dict):
        if room_id in self.active_connections and target_user_id in self.active_connections[room_id]:
            try:
                await self.active_connections[room_id][target_user_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending to user {target_user_id}: {e}")

manager = ConnectionManager()
