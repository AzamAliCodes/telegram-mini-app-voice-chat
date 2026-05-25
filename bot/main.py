import logging
import os
import asyncio
import sys
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters
from telegram.request import HTTPXRequest
from bot.handlers import dm_commands, group_commands
from bot.middleware import admin_check
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
    support_channel = os.getenv("SUPPORT_CHANNEL", "")
    welcome_text = (
        "🎙️ *Welcome to VCBot!* \n\n"
        "I help you host custom-branded **Voice Chat** rooms inside your Telegram groups using our Mini App.\n\n"
        "🚀 *Getting Started:*\n"
        "1. **Add me** to your group as an administrator.\n"
        "2. In your group, type `/vc start` to launch the room!\n\n"
        "💡 *Need help?* Type /help for a full command list."
    )
    keyboard = []
    if support_channel:
        keyboard.append([InlineKeyboardButton("Support", url=f"https://t.me/{support_channel}")])
    await update.message.reply_text(welcome_text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None)

async def run_bot():
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not found")
        return

    # Ultra-resilient request settings
    request = HTTPXRequest(connect_timeout=60, read_timeout=60, write_timeout=60, pool_timeout=60)
    
    application = (
        ApplicationBuilder()
        .token(token)
        .request(request)
        .get_updates_request(request) # Use the same high-timeout request for updates
        .build()
    )

    # Handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", dm_commands.help_command))
    application.add_handler(CommandHandler("vc", group_commands.vc_command))
    application.add_handler(CommandHandler("endvc", group_commands.end_vc))
    application.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_MEMBERS, admin_check.bot_added_to_group))

    async with application:
        await application.initialize()
        await application.start()
        logger.info("Bot is running...")
        await application.updater.start_polling()
        
        # Keep running until interrupted
        try:
            while True:
                await asyncio.sleep(3600)
        except (KeyboardInterrupt, SystemExit, asyncio.CancelledError):
            await application.stop()
            await application.shutdown()

def main():
    try:
        asyncio.run(run_bot())
    except Exception as e:
        logger.error(f"Critical failure: {e}")
        # Let the container restart naturally
        sys.exit(1)

if __name__ == "__main__":
    main()

if __name__ == "__main__":
    main()
