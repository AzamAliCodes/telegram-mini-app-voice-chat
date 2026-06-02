import logging
import os
import asyncio
import sys
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, constants
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters
from telegram.request import HTTPXRequest
from bot.handlers import dm_commands, group_commands, dev_commands
from bot.middleware import admin_check
from bot.utils.telegram_helpers import get_support_channel, is_owner
from bot.core.db import ping_db
from dotenv import load_dotenv

# Force load environment before anything else
load_dotenv()

# Enable logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    support_channel = get_support_channel()
    welcome_text = (
        "🎙️ *Welcome to Voice Chat Manager!*\n\n"
        "Host custom Voice Chat rooms in your groups using our integrated Mini App.\n\n"
        "🚀 *How to Start:*\n"
        "1. **Add me** to your group as Admin.\n"
        "2. Send `/start_vc` in the group to begin.\n\n"
        "💡 *Need Help?* Send `/help` for commands."
    )
    keyboard = []
    if support_channel:
        keyboard.append([InlineKeyboardButton("Support", url=f"https://t.me/{support_channel}")])
    
    # Logic for developers in DM
    if update.effective_chat.type == constants.ChatType.PRIVATE and is_owner(update.effective_user.id):
        welcome_text += "\n\n⚡ *Developer Mode Active*\nYou have access to sudo commands."

    await update.message.reply_text(welcome_text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None)

def run_bot():
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not found")
        return

    # Check for custom API URL (Cloudflare Bridge)
    custom_api_url = os.getenv("TELEGRAM_API_PROXY")

    logger.info("Initializing bot application...")
    # Resilient settings for cloud environments
    request = HTTPXRequest(connect_timeout=30, read_timeout=30, write_timeout=30, pool_timeout=30)
    
    builder = ApplicationBuilder().token(token).request(request).get_updates_request(request)
    
    if custom_api_url:
        logger.info(f"Using Telegram API Proxy: {custom_api_url}")
        builder = builder.base_url(f"{custom_api_url.rstrip('/')}/bot")

    application = builder.build()

    # Register Handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", dm_commands.help_command))
    application.add_handler(CommandHandler("start_vc", group_commands.start_vc_command))
    application.add_handler(CommandHandler("join_vc", group_commands.join_vc_command))
    application.add_handler(CommandHandler("end_vc", group_commands.end_vc_command))
    
    application.add_handler(CommandHandler("list", dev_commands.list_groups))
    application.add_handler(CommandHandler("add", dev_commands.add_group))
    application.add_handler(CommandHandler("del", dev_commands.del_group))
    application.add_handler(CommandHandler("id", dev_commands.get_id))
    application.add_handler(CommandHandler("sync", dev_commands.sync_groups))
    
    application.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_MEMBERS, admin_check.bot_added_to_group))

    # Prime Cache at Startup
    async def post_init(app):
        # Verify DB Connection
        if not await ping_db():
            logger.error("CRITICAL: MongoDB unreachable. Whitelist will be empty!")
        
        # Prime Whitelist Cache
        asyncio.create_task(dev_commands.init_dev_cache())

    application.post_init = post_init

    logger.info("Bot starting...")
    # run_polling handles its own event loop and signals correctly
    application.run_polling(drop_pending_updates=True)

def main():
    try:
        run_bot()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.error(f"Fatal exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
