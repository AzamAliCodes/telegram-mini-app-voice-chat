import os
import asyncio
from datetime import datetime
from telegram import Update, constants
from telegram.ext import ContextTypes
from ..core.config import settings
from ..core.db import allowed_groups_collection
from ..utils.telegram_helpers import is_owner
import logging

logger = logging.getLogger(__name__)

# In-memory cache for zero-latency authorization (ID -> Name)
_allowed_groups_cache = {}
_cache_initialized = False

async def init_dev_cache():
    """Primes the authorization cache from the database at startup."""
    global _cache_initialized
    try:
        groups = await allowed_groups_collection.find({}, {"_id": 1, "name": 1}).to_list(length=2000)
        for g in groups:
            _allowed_groups_cache[str(g["_id"])] = g.get("name", "Group")
        _cache_initialized = True
        logger.info(f"🚀 Auth Cache Primed: {len(_allowed_groups_cache)} groups loaded.")
    except Exception as e:
        logger.error(f"Failed to prime auth cache: {e}")

def is_group_authorized(chat_id: str) -> bool:
    """Ultra-fast synchronous authorization check (Sub-microsecond)."""
    return str(chat_id) in _allowed_groups_cache

async def handle_unauthorized_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Background task to notify and leave an unauthorized group."""
    chat_id = update.effective_chat.id
    async def notify_and_leave():
        try:
            await update.message.reply_text(
                f"🚫 *Unauthorized Group*\n\n"
                f"This group has not been approved for use with this bot. I will now leave the group.\n\n"
                f"Please contact the developer for access.\n\n"
                f"Group ID: `{chat_id}`", 
                parse_mode="Markdown"
            )
        except: pass
        try: await context.bot.leave_chat(chat_id)
        except: pass
    
    asyncio.create_task(notify_and_leave())

async def list_groups(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Instant list of authorized groups from memory cache."""
    if not is_owner(update.effective_user.id): return

    if not _allowed_groups_cache:
        await update.message.reply_text("📋 *Whitelist is Empty*", parse_mode="Markdown")
        return

    text = "📋 *Authorized Groups*\n━━━━━━━━━━━━━━━━━━━━\n\n"
    for gid, name in _allowed_groups_cache.items():
        text += f"🔹 `{gid}`\n   ┗ {name}\n\n"
    
    await update.message.reply_text(text, parse_mode="Markdown")

async def add_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ultra-fast group authorization (Instant confirmation)."""
    if not is_owner(update.effective_user.id): return

    if not context.args:
        await update.message.reply_text("💡 `/add <group_id_or_username>`", parse_mode="Markdown")
        return

    target = str(context.args[0])
    is_id = target.startswith("-") and target.lstrip("-").isdigit()

    # 1. INSTANT AUTHORIZATION
    if is_id:
        _allowed_groups_cache[target] = "Group"
        await update.message.reply_text(f"✅ *Authorized:* `{target}`\n\nAccess granted. Use `/sync` to refresh group details.", parse_mode="Markdown")
    else:
        # Resolve username to ID
        status_msg = await update.message.reply_text("⏳ *Resolving Username...*", parse_mode="Markdown")
        try:
            chat = await asyncio.wait_for(context.bot.get_chat(target), timeout=3.0)
            target = str(chat.id)
            _allowed_groups_cache[target] = chat.title or chat.full_name or "Group"
            await status_msg.edit_text(f"✅ *Authorized:* `{target}`\n\nUse `/sync` to update all group names.", parse_mode="Markdown")
        except:
            await status_msg.edit_text(f"❌ *Failed:* Could not resolve `{target}`. Use numeric ID.", parse_mode="Markdown")
            return

    # 2. BACKGROUND WORK
    async def persist_and_resolve():
        group_id = target
        group_name = _allowed_groups_cache.get(group_id, "Group")
        
        # Best effort background resolution (doesn't block user)
        if group_name == "Group":
            try:
                chat = await asyncio.wait_for(context.bot.get_chat(int(group_id)), timeout=3.0)
                group_name = chat.title or chat.full_name or "Group"
                _allowed_groups_cache[group_id] = group_name
            except: pass

        try:
            await allowed_groups_collection.update_one(
                {"_id": group_id},
                {"$set": {"name": group_name, "added_at": datetime.utcnow(), "added_by": update.effective_user.id}},
                upsert=True
            )
        except: pass
    
    asyncio.create_task(persist_and_resolve())

async def del_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ultra-fast group removal."""
    if not is_owner(update.effective_user.id): return

    if not context.args:
        await update.message.reply_text("💡 `/del <group_id>`", parse_mode="Markdown")
        return

    group_id = str(context.args[0])
    _allowed_groups_cache.pop(group_id, None)

    async def remove():
        try: await allowed_groups_collection.delete_one({"_id": group_id})
        except: pass
    
    asyncio.create_task(remove())
    await update.message.reply_text(f"🗑️ *Revoked:* `{group_id}`\n\nAccess removed.", parse_mode="Markdown")

async def get_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Versatile ID fetching with specific labels (User vs Group)."""
    if not is_owner(update.effective_user.id): return

    # 1. Check for Reply
    if update.message.reply_to_message:
        target = update.message.reply_to_message
        if target.forward_from:
            await update.message.reply_text(f"👤 *Forwarded User ID:* `{target.forward_from.id}`\n🏷️ *Name:* {target.forward_from.full_name}", parse_mode="Markdown")
        elif target.forward_from_chat:
            await update.message.reply_text(f"📢 *Forwarded Chat ID:* `{target.forward_from_chat.id}`\n🏷️ *Title:* {target.forward_from_chat.title}", parse_mode="Markdown")
        else:
            await update.message.reply_text(f"👤 *User ID:* `{target.from_user.id}`\n🏷️ *Name:* {target.from_user.full_name}", parse_mode="Markdown")
        return

    # 2. Check for Username/Link in Args or Entities
    target_str = None
    if context.args: target_str = context.args[0]
    elif update.message.entities:
        for ent in update.message.entities:
            if ent.type == "mention": target_str = update.message.text[ent.offset:ent.offset+ent.length]
            elif ent.type == "url": target_str = update.message.text[ent.offset:ent.offset+ent.length]

    if target_str:
        clean_target = target_str.replace("https://t.me/", "").replace("t.me/", "").lstrip("@")
        status_msg = await update.message.reply_text(f"⏳ *Analyzing* `{target_str}`...", parse_mode="Markdown")
        try:
            chat = await context.bot.get_chat(clean_target)
            
            # 30-Year Expert Strategy: Type-specific formatting
            if chat.type == constants.ChatType.PRIVATE:
                msg = f"👤 *User ID:* `{chat.id}`\n🏷️ *Name:* {chat.first_name} {chat.last_name or ''}"
            else:
                label = "Channel" if chat.type == constants.ChatType.CHANNEL else "Group"
                msg = f"📍 *{label} ID:* `{chat.id}`\n🏷️ *Title:* {chat.title}"
                
            await status_msg.edit_text(msg, parse_mode="Markdown")
        except:
            await status_msg.edit_text(f"❌ *Error:* Could not resolve `{target_str}`.")
        return

    # 3. Default: Current Context
    chat = update.effective_chat
    if chat.type == constants.ChatType.PRIVATE:
        await update.message.reply_text(f"👤 *User ID:* `{chat.id}`\n🏷️ *Name:* {chat.first_name}", parse_mode="Markdown")
    else:
        label = "Channel" if chat.type == constants.ChatType.CHANNEL else "Group"
        await update.message.reply_text(f"📍 *{label} ID:* `{chat.id}`\n🏷️ *Title:* {chat.title}", parse_mode="Markdown")

async def sync_groups(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Refreshes all group names with real-time 'X of Y' progress."""
    if not is_owner(update.effective_user.id): return

    groups_to_sync = list(_allowed_groups_cache.keys())
    total = len(groups_to_sync)
    
    if total == 0:
        await update.message.reply_text("📋 *Whitelist is Empty*", parse_mode="Markdown")
        return

    status_msg = await update.message.reply_text(f"⏳ *Syncing:* 0 of {total} groups...", parse_mode="Markdown")
    
    count = 0
    failures = []
    
    for i, gid in enumerate(groups_to_sync, 1):
        try:
            # 1. Update status message
            try: await status_msg.edit_text(f"⏳ *Syncing:* {i} of {total} groups...", parse_mode="Markdown")
            except: pass

            # 2. Fetch from Telegram
            target_id = int(gid)
            chat = await context.bot.get_chat(chat_id=target_id)
            new_name = chat.title or chat.full_name or "Group"
            
            # 3. Update Cache & DB
            _allowed_groups_cache[gid] = new_name
            await allowed_groups_collection.update_one({"_id": gid}, {"$set": {"name": new_name}})
            count += 1
            
            # Small throttle to avoid hitting API limits
            await asyncio.sleep(0.4)
        except Exception as e:
            err_msg = str(e).split(':')[-1].strip()
            failures.append(f"`{gid}`: {err_msg}")
            logger.error(f"Sync failed for {gid}: {e}")

    # Build final report
    report = f"✅ *Sync Complete*\n━━━━━━━━━━━━━━━━━━━━\n\n"
    report += f"🔄 *Updated:* {count} of {total} groups\n"
    
    if failures:
        report += f"\n⚠️ *Failures ({len(failures)}):*\n"
        report += "\n".join(failures[:5])
        if len(failures) > 5: report += "\n...and more."
    
    await status_msg.edit_text(report, parse_mode="Markdown")
