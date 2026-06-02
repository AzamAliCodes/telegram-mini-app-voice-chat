import os
from telegram import Update
from telegram.ext import ContextTypes

from ..core.config import settings

def get_support_channel() -> str:
    channel = os.getenv("SUPPORT_CHANNEL")
    if not channel or channel.lower() in ["none", "null", "undefined", ""]:
        return "tgvcgroup_bot"
    return channel.lstrip("@")

def is_owner(user_id: int) -> bool:
    """Checks if a user is a registered developer."""
    return user_id in settings.OWNER_IDS

async def is_admin(update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: int = None):
    chat_id = update.effective_chat.id
    user_id = user_id or update.effective_user.id

    try:
        member = await context.bot.get_chat_member(chat_id, user_id)
        return member.status in ["administrator", "creator"]
    except Exception as e:
        print(f"Error checking admin status: {e}")
        return False
