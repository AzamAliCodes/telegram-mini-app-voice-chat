from telegram import Update
from telegram.ext import ContextTypes
from ..handlers.dev_commands import is_group_authorized
import asyncio

async def bot_added_to_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Called when the bot is added to a new group.
    """
    chat_id = update.effective_chat.id
    
    # Immediate authorization check
    if not is_group_authorized(str(chat_id)):
        async def notify_and_leave():
            welcome_msg = (
                "🚫 *Unauthorized Group*\n\n"
                "This group has not been approved for use with this bot. I will now leave the group.\n\n"
                "Please contact the developer to authorize this Group ID.\n\n"
                f"Group ID: `{chat_id}`"
            )
            try: await update.message.reply_text(welcome_msg, parse_mode="Markdown")
            except: pass
            try: await context.bot.leave_chat(chat_id)
            except: pass
        
        asyncio.create_task(notify_and_leave())
        return

    for member in update.message.new_chat_members:
        if member.id == context.bot.id:
            welcome_msg = (
                "🎙️ *Voice Chat Manager Active!*\n\n"
                "To host custom Voice Chats in this group, please:\n"
                "**Grant me Admin rights (Required to manage sessions).**\n\n"
                "Once setup, use `/start_vc` to launch the room!"
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
