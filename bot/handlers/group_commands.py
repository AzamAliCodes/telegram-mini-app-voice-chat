from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ContextTypes
from ..core.db import groups_collection
from ..utils.telegram_helpers import is_admin
from ..middleware.admin_check import check_bot_admin
from datetime import datetime
import time
import os

async def vc_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)

    if not await check_bot_admin(update, context):
        return

    if not context.args or context.args[0] != "start":
        await show_join_button(update, context)
        return

    if not await is_admin(update, context):
        await update.message.reply_text("Only admins can start a voice chat.")
        return

    room_id = f"vc_{abs(int(chat_id))}_{int(time.time())}"
    miniapp_url = os.getenv("MINIAPP_URL", "https://your-domain.com")
    join_url = f"{miniapp_url}?room={room_id}"

    await groups_collection.update_one(
        {"_id": chat_id},
        {
            "$set": {
                "active_session": {
                    "room_id": room_id,
                    "started_at": datetime.utcnow(),
                    "started_by": update.effective_user.id
                }
            }
        }
    )

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            text="🎙️ Join Voice Chat",
            url=join_url
        )
    ]])

    await update.message.reply_text(
        f"🎙️ *Voice Chat Started!*\n\nClick the button below to join.",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )

async def show_join_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)

    if not await check_bot_admin(update, context):
        return

    group = await groups_collection.find_one({"_id": chat_id})

    if not group or not group.get("active_session"):
        await update.message.reply_text("There is no active voice chat session. Use `/vc start` to start one.")
        return

    room_id = group["active_session"]["room_id"]
    miniapp_url = os.getenv("MINIAPP_URL", "https://your-domain.com")
    join_url = f"{miniapp_url}?room={room_id}"

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            text="🎙️ Join Voice Chat",
            url=join_url
        )
    ]])

    await update.message.reply_text("An active voice chat is running!", reply_markup=keyboard)

async def end_vc(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)

    if not await check_bot_admin(update, context):
        return

    if not await is_admin(update, context):
        await update.message.reply_text("Only admins can end the voice chat.")
        return

    await groups_collection.update_one(
        {"_id": chat_id},
        {"$unset": {"active_session": ""}}
    )

    await update.message.reply_text("🔴 Voice Chat ended.")
