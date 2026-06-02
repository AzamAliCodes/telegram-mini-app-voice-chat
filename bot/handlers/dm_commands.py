from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from ..utils.telegram_helpers import get_support_channel

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Get support channel from environment or use default
    support_channel = get_support_channel()
    
    help_text = (
        "🎙️ *Voice Chat Control Center*\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "👥 *Group Commands (Admins)*\n"
        "🔹 `/start_vc` — Start a new session\n"
        "🔹 `/end_vc` — End current session\n\n"
        "👥 *Group Commands (Users)*\n"
        "🔹 `/join_vc` — Join active session\n\n"
        "💬 *Bot Commands (All)*\n"
        "🔹 `/start` — Welcome message\n"
        "🔹 `/help` — Display this menu"
    )
    keyboard = []
    if support_channel:
        keyboard.append([InlineKeyboardButton("Support", url=f"https://t.me/{support_channel}")])
    
    await update.message.reply_text(
        help_text, 
        parse_mode="Markdown", 
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None
    )
