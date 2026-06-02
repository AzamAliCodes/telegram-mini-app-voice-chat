from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from ..utils.telegram_helpers import get_support_channel, is_owner

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Get support channel from environment or use default
    support_channel = get_support_channel()
    user_id = update.effective_user.id
    
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
    
    # Show administrative commands only to authorized developers
    if is_owner(user_id):
        help_text += (
            "\n\n⚡ *Developer Commands*\n"
            "🔹 `/list` — View whitelisted groups\n"
            "🔹 `/add <id>` — Whitelist a group\n"
            "🔹 `/del <id>` — Revoke group access\n"
            "🔹 `/id` — Get ID (Reply, Chat, or Username)\n"
            "🔹 `/sync` — Refresh all group names"
        )

    keyboard = []
    if support_channel:
        keyboard.append([InlineKeyboardButton("Support", url=f"https://t.me/{support_channel}")])
    
    await update.message.reply_text(
        help_text, 
        parse_mode="Markdown", 
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None
    )
