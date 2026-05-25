from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings
import logging

logger = logging.getLogger(__name__)

# Configure client with more robust timeout and SSL settings
client = AsyncIOMotorClient(
    settings.MONGODB_URI,
    serverSelectionTimeoutMS=15000,
    connectTimeoutMS=15000,
    socketTimeoutMS=15000,
    retryWrites=True,
    retryReads=True
)

db = client.get_default_database()

# Collections
groups_collection = db.groups

async def ping_db():
    try:
        await client.admin.command('ping')
        logger.info("MongoDB connection successful")
        return True
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        return False
