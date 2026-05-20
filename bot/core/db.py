from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client = AsyncIOMotorClient(settings.MONGODB_URI)
db = client.get_default_database()

# Collections
groups_collection = db.groups
