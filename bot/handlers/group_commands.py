from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from ..core.db import groups_collection
from ..utils.telegram_helpers import is_admin
from ..middleware.admin_check import check_bot_admin
from datetime import datetime
import os
import httpx
from loguru import logger

async def vc_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)

    # Delete the user's command message
    try:
        await update.message.delete()
    except Exception:
        pass

    if not await check_bot_admin(update, context):
        return

    if not context.args or context.args[0] != "start":
        await show_join_button(update, context)
        return

    if not await is_admin(update, context):
        await context.bot.send_message(chat_id=chat_id, text="Only admins can start a voice chat.")
        return

    # Room ID is simply the group chat ID (absolute value)
    # This way there's one voice chat room per group, naturally
    room_id = str(abs(int(chat_id)))

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
        },
        upsert=True
    )

    # web_app buttons are NOT supported in group chats (only private chats).
    # Use a t.me direct link with startapp param to open the Mini App natively in Telegram.
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "tgvcgroup_bot")
    
    # startapp param passes the room_id (group chat ID) to the Mini App
    # The Mini App reads it via Telegram.WebApp.initDataUnsafe.start_param
    miniapp_link = f"https://t.me/{bot_username}/app?startapp={room_id}"

    # Notify backend to clear 'ended' state and mark as active
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{backend_url}/api/room/{room_id}/start", timeout=5.0)
    except Exception as e:
        logger.error(f"Failed to notify backend of room start: {e}")

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            text="🎙️ Join Voice Chat",
            url=miniapp_link
        )
    ]])

    sent_msg = await context.bot.send_message(
        chat_id=chat_id,
        text=f"🎙️ *Voice Chat Started!*\n\nClick the button below to join.",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )

    # Pin the message and store its ID for later deletion
    try:
        await context.bot.pin_chat_message(chat_id=chat_id, message_id=sent_msg.message_id, disable_notification=True)
        await groups_collection.update_one(
            {"_id": chat_id},
            {"$set": {"active_session.msg_id": sent_msg.message_id}}
        )
    except Exception as e:
        logger.warning(f"Failed to pin message: {e}")

async def show_join_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)

    if not await check_bot_admin(update, context):
        return

    group = await groups_collection.find_one({"_id": chat_id})

    if not group or not group.get("active_session"):
        await update.message.reply_text("There is no active voice chat session. Use `/vc start` to start one.")
        return

    room_id = group["active_session"]["room_id"]
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "tgvcgroup_bot")
    miniapp_link = f"https://t.me/{bot_username}/app?startapp={room_id}"

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            text="🎙️ Join Voice Chat",
            url=miniapp_link
        )
    ]])

    await context.bot.send_message(chat_id=chat_id, text="An active voice chat is running!", reply_markup=keyboard)

async def end_vc(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)

    # Delete the user's command message
    try:
        await update.message.delete()
    except Exception:
        pass

    if not await check_bot_admin(update, context):
        return

    if not await is_admin(update, context):
        await context.bot.send_message(chat_id=chat_id, text="Only admins can end the voice chat.")
        return

    room_id = str(abs(int(chat_id)))

    # Get the session info before deleting it to find the message ID
    group = await groups_collection.find_one({"_id": chat_id})
    msg_id = group.get("active_session", {}).get("msg_id")

    await groups_collection.update_one(
        {"_id": chat_id},
        {"$unset": {"active_session": ""}}
    )

    # Delete the Join VC message and unpin if possible
    if msg_id:
        try:
            await context.bot.unpin_chat_message(chat_id=chat_id, message_id=msg_id)
            await context.bot.delete_message(chat_id=chat_id, message_id=msg_id)
        except Exception as e:
            logger.warning(f"Failed to delete/unpin message: {e}")

    # Notify backend to forcefully clear Redis and close WebSockets
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(f"{backend_url}/api/room/{room_id}", timeout=5.0)
    except Exception as e:
        logger.error(f"Failed to clear room on backend: {e}")

    await context.bot.send_message(chat_id=chat_id, text="🔴 Voice Chat ended.")
