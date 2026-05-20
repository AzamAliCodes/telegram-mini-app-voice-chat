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
    
    TURN_URL: str = os.getenv("TURN_URL", "stun:stun.l.google.com:19302")
    TURN_USERNAME: str = os.getenv("TURN_USERNAME", "")
    TURN_PASSWORD: str = os.getenv("TURN_PASSWORD", "")
    
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key")

settings = Settings()
