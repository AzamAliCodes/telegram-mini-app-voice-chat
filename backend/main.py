from contextlib import asynccontextmanager
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from .api import rooms
from loguru import logger
import os
from livekit import api

@asynccontextmanager
async def lifespan(app: FastAPI):
    from .core.redis import redis_client
    # Initialize Rate Limiter using existing Redis for Anti-DDoS
    await FastAPILimiter.init(redis_client)
    yield
    await FastAPILimiter.close()

app = FastAPI(title="VCBot Signaling Server", lifespan=lifespan)

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
    return response

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ANTI-DDOS PROTECTED ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/health")
async def health():
    return {"status": "ok"}

# Limit token generation to 2 requests per minute per IP to stop DDOS/Bots
@app.post("/api/livekit/token", dependencies=[Depends(RateLimiter(times=2, seconds=60))])
async def get_livekit_token(request: Request):
    try:
        body = await request.json()
        room_id = body.get("room_id")
        user_id = body.get("user_id", "anon")
        user_name = body.get("user_name", "Anonymous")
        metadata = body.get("metadata", "")

        logger.info(f"[Room: {room_id}] Action: TOKEN_REQUEST | user_id={user_id} name='{user_name}' metadata='{metadata[:100]}...'")

        from .core.redis import redis_client
        room_state = await redis_client.get(f"room:{room_id}:state")
        
        if room_state == "ended":
            logger.warning(f"[Room: {room_id}] Action: TOKEN_REJECTED | reason='room_ended' user_id={user_id}")
            return {"status": "error", "message": "room_ended"}
        elif not room_state:
            logger.warning(f"[Room: {room_id}] Action: TOKEN_REJECTED | reason='room_not_started' user_id={user_id}")
            return {"status": "error", "message": "room_not_started"}

        api_key = os.environ.get("LIVEKIT_API_KEY", "devkey")
        api_secret = os.environ.get("LIVEKIT_API_SECRET", "secret")

        token = api.AccessToken(api_key, api_secret) \
            .with_identity(str(user_id)) \
            .with_name(user_name) \
            .with_metadata(metadata) \
            .with_grants(api.VideoGrants(
                room_join=True,
                room=room_id,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True
            ))
        
        logger.info(f"[Room: {room_id}] Action: TOKEN_GRANTED | user_id={user_id}")
        return {"status": "ok", "token": token.to_jwt()}
    except Exception as e:
        logger.error(f"Token error: {e}")
        return {"status": "error", "message": "internal_error"}

app.include_router(rooms.router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "ok", "msg": "VCBot Backend Running"}
