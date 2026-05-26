from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from ..core.db import groups_collection
from ..utils.telegram_helpers import is_admin
from ..middleware.admin_check import check_bot_admin
from datetime import datetime
import os
import httpx
from loguru import logger
import asyncio

async def vc_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    user_id = update.effective_user.id
    
    # Fire and forget deletion of user command
    try: asyncio.create_task(update.message.delete())
    except: pass

    if not context.args or context.args[0] != "start":
        await show_join_button(update, context)
        return

    # Instant Local Setup
    room_id = str(abs(int(chat_id)))
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "tgvcgroup_bot")
    miniapp_link = f"https://t.me/{bot_username}/app?startapp={room_id}"
    keyboard = InlineKeyboardMarkup([[InlineKeyboardButton(text="🎙️ Join Voice Chat", url=miniapp_link)]])

    async def run_vc_start_flow():
        try:
            # 1. SEND & PIN (Sequenced for zero-gap)
            sent_msg = await context.bot.send_message(
                chat_id=chat_id,
                text=f"🎙️ *Voice Chat Started!*\n\nClick the button below to join.",
                reply_markup=keyboard,
                parse_mode="Markdown"
            )
            await context.bot.pin_chat_message(chat_id=chat_id, message_id=sent_msg.message_id, disable_notification=True)
            
            # 2. BACKGROUND VALIDATION
            is_bot_admin = await check_bot_admin_silent(chat_id, context)
            is_user_admin = await is_admin_silent(chat_id, user_id, context)

            if not is_bot_admin or not is_user_admin:
                await sent_msg.delete()
                err = "Only admins can start a voice chat." if not is_user_admin else "Please promote me to Admin."
                await context.bot.send_message(chat_id=chat_id, text=f"❌ {err}")
                return

            # 3. PERSISTENCE
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
            async def update_db():
                await groups_collection.update_one(
                    {"_id": chat_id},
                    {"$set": {"active_session": {"room_id": room_id, "msg_id": sent_msg.message_id, "started_at": datetime.utcnow(), "started_by": user_id}}},
                    upsert=True
                )
            async def notify_backend():
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(f"{backend_url}/api/room/{room_id}/start", timeout=5.0)
                except: pass
            
            await asyncio.gather(update_db(), notify_backend())
        except Exception as e:
            logger.error(f"Error in start flow: {e}")

    # FIRE AND FORGET - COMPLETELY INSTANT HANDLER RETURN
    asyncio.create_task(run_vc_start_flow())

async def is_admin_silent(chat_id, user_id, context):
    try:
        member = await context.bot.get_chat_member(chat_id, user_id)
        return member.status in ["administrator", "creator"]
    except: return False

async def check_bot_admin_silent(chat_id, context):
    try:
        bot_member = await context.bot.get_chat_member(chat_id, context.bot.id)
        return bot_member.status in ["administrator", "creator"]
    except: return False

async def show_join_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    # This one needs a DB check to know what to show, but we still use context.bot.send_message
    group = await groups_collection.find_one({"_id": chat_id})
    if not group or not group.get("active_session"):
        await context.bot.send_message(chat_id=chat_id, text="There is no active voice chat session. Use `/vc start` to start one.")
        return
    room_id = group["active_session"]["room_id"]
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "tgvcgroup_bot")
    miniapp_link = f"https://t.me/{bot_username}/app?startapp={room_id}"
    keyboard = InlineKeyboardMarkup([[InlineKeyboardButton(text="🎙️ Join Voice Chat", url=miniapp_link)]])
    await context.bot.send_message(chat_id=chat_id, text="An active voice chat is running!", reply_markup=keyboard)

async def end_vc(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    user_id = update.effective_user.id
    
    # Fire and forget deletion of user command
    try: asyncio.create_task(update.message.delete())
    except: pass

    async def run_vc_end_flow():
        try:
            # 1. DB LOOKUP (The only blocker for UI cleanup)
            group = await groups_collection.find_one({"_id": chat_id})
            msg_id = group.get("active_session", {}).get("msg_id") if group else None

            # 2. INSTANT UI CLEANUP (Parallel)
            tasks = [context.bot.send_message(chat_id=chat_id, text="🔴 Voice Chat ended.")]
            if msg_id:
                tasks.append(context.bot.unpin_chat_message(chat_id=chat_id, message_id=msg_id))
                tasks.append(context.bot.delete_message(chat_id=chat_id, message_id=msg_id))
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            status_msg = results[0] if not isinstance(results[0], Exception) else None

            # 3. BACKGROUND VALIDATION & CLEANUP
            if not await is_admin_silent(chat_id, user_id, context):
                if status_msg: await status_msg.edit_text("❌ Only admins can end the voice chat.")
                return

            room_id = str(abs(int(chat_id)))
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
            async def update_db(): await groups_collection.update_one({"_id": chat_id}, {"$unset": {"active_session": ""}})
            async def notify_backend():
                try:
                    async with httpx.AsyncClient() as client:
                        await client.delete(f"{backend_url}/api/room/{room_id}", timeout=5.0)
                except: pass
            
            await asyncio.gather(update_db(), notify_backend())
        except Exception as e:
            logger.error(f"Error in end flow: {e}")

    # FIRE AND FORGET - COMPLETELY INSTANT HANDLER RETURN
    asyncio.create_task(run_vc_end_flow())
