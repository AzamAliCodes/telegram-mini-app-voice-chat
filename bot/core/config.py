import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_BOT_USERNAME: str = os.getenv("TELEGRAM_BOT_USERNAME", "")
    MINIAPP_URL: str = os.getenv("MINIAPP_URL", "")
    
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017/vcbot")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SUPPORT_CHANNEL: str = os.getenv("SUPPORT_CHANNEL", "")

    # Bot Owners/Developers
    @property
    def OWNER_IDS(self) -> list[int]:
        ids_str = os.getenv("OWNER_IDS", "")
        # Returns a list of unique integers, handling whitespace and non-digits
        return list(set(int(x.strip()) for x in ids_str.split(",") if x.strip().lstrip("-").isdigit()))

settings = Settings()
