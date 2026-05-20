from telegram import Update
from telegram.ext import ContextTypes

async def bot_added_to_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Called when the bot is added to a new group.
    """
    for member in update.message.new_chat_members:
        if member.id == context.bot.id:
            welcome_msg = (
                "🎙️ *VCBot has joined the group!*\n\n"
                "To start using custom Voice Chats, please:\n"
                "1. **Make me an Administrator** (I need rights to read members).\n\n"
                "Once setup is complete, use `/vc start` to launch the room!"
            )
            await update.message.reply_text(welcome_msg, parse_mode="Markdown")

async def check_bot_admin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """
    Checks if the bot itself is an admin in the group.
    """
    chat_id = update.effective_chat.id
    try:
        bot_member = await context.bot.get_chat_member(chat_id, context.bot.id)
        if bot_member.status not in ["administrator", "creator"]:
            await update.message.reply_text(
                "❌ *Permission Error*\n\nPlease promote me to **Administrator** so I can manage voice chat sessions.",
                parse_mode="Markdown"
            )
            return False
        return True
    except Exception:
        return False
