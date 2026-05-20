from telegram import Update
from telegram.ext import ContextTypes

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    help_text = (
        "🎙️ *VCBot Help*\n\n"
        "*Commands:*\n"
        "/start - Welcome message\n"
        "/help - Show this help\n"
        "/vc - Join active voice chat (group)\n"
        "/vc start - (Admin only) Start voice chat\n"
        "/endvc - (Admin only) End voice chat"
    )
    await update.message.reply_text(help_text, parse_mode="Markdown")
