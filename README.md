# 🎙️ VCBot — Telegram Mini App Voice & Text Chat

A Telegram Bot and Mini App (WebApp) suite for custom-branded voice chat rooms. Powered by **LiveKit SFU** and FastAPI.

> ⚠️ **Audio Only**: This project is focused strictly on voice chat and text messaging. No video/camera features are implemented.

---

## 🏗️ Architecture

The system is built as a monorepo containing three core services:

- **`bot/`**: Python Telegram Bot (`python-telegram-bot` v21). Handles starting/ending voice sessions and admin checks.
- **`backend/`**: FastAPI Management Server. Handles Anti-DDoS throttling, LiveKit token generation, and room state persistence.
- **`frontend/`**: React + Vite + TailwindCSS. A polished Telegram Mini App that provides the voice chat UI and HD audio via LiveKit.
- **`LiveKit SFU`**: The media engine that handles high-performance audio forwarding (replaces old WebRTC Mesh).

```
┌──────────┐      HTTPS         ┌──────────┐     HTTPS          ┌──────────┐
│  User A  │←──────────────────→│ FastAPI  │←──────────────────→│  User B  │
│  (Mini   │ (Token/Anti-DDoS)  │ (Backend)│ (Token/Anti-DDoS)  │  (Mini   │
│   App)   │                    └────┬─────┘                    │   App)   │
└──────────┘                         │                          └──────────┘
      │          WebRTC (UDP)   ┌────┴─────┐   WebRTC (UDP)           │
      └────────────────────────→│ LiveKit  │←─────────────────────────┘
                                │ (SFU)    │
                                └────┬─────┘
                                     │
                        ┌────────────┴────────────┐
                        │  MongoDB (Whitelist)    │
                        │  Redis (Rate Limiting)  │
                        └─────────────────────────┘
```

---

## 🚀 Key Features

- **Scalable HD Voice**: Powered by LiveKit SFU for unlimited participants and crystal-clear Opus audio.
- **No UDP Limit Performance**: Unlocked network throughput with optimized port multiplexing and expanded file descriptors. Zero software-level bottlenecks for high-concurrency voice traffic.
- **Advanced Anti-DDoS**: Multi-layer hardware and software protection (Nginx Rate Limiting + FastAPI Throttling + Azure/HF Real-IP resolution + Redis-backed IP tracking).
- **Premium UX**: Instant connection flow with high-speed Skeleton Loading and background token pre-fetching.
- **Modern UI**: Frosted glass cards, purple gradients, and real-time social avatars in chat and notifications.
- **Group Authorization**: Secure whitelist system to restrict bot usage to approved groups only.

---

## 🛠️ Developer & Whitelist Management

The bot is designed for private/client deployments. It will **automatically leave** any group that is not on the authorized whitelist.

### 1. Set Up Developers
Add your Telegram User ID(s) to the `OWNER_IDS` variable in your `.env` file (comma-separated). Users with these IDs are treated as the authorized developers of the bot.

### 2. Manage Whitelist
Authorized developers can manage groups via DM commands:
- `/add <group_id>` — Authorize a new group for the bot.
- `/del <group_id>` — Revoke a group's access.
- `/list` — See all currently authorized groups and their IDs.
- `/id` — Get ID of current chat, a replied-to user, or a username/link.
- `/sync` — Force refresh group names and metadata from Telegram API.

---

## 📦 Complete Tech Stack

### 🤖 Bot Layer
| Component | Technology | Notes |
|---|---|---|
| Bot Framework | `python-telegram-bot` v21 | Async/await throughout |
| Database | MongoDB Atlas | via `motor` async driver |

### ⚙️ Backend (Management Server)
| Component | Technology | Notes |
|---|---|---|
| Framework | FastAPI | High-performance ASGI framework |
| Security | `fastapi-limiter` | Redis-backed Anti-DDoS throttling |
| Media Engine | **LiveKit SFU** | Replaces old unscalable Mesh signaling |
| Cache | Redis (Upstash) | Real-time rate limiting & room state |

### 🎨 Frontend (Mini App)
| Component | Technology | Notes |
|---|---|---|
| Framework | React 19 + Vite | Fast builds & HMR |
| Voice Engine | `livekit-client` | HD Audio with Opus RED support |
| Styling | TailwindCSS | Utility-first, responsive design |
| TG SDK | `@twa-dev/sdk` | Native Telegram WebApp integration |

---

## 🏁 Getting Started

### 1. Prerequisites
- Python 3.11+ & Node.js 18+
- Docker & Docker Compose
- MongoDB Atlas & Upstash Redis
- **LiveKit Server** (Cloud or Self-hosted)
- Bot Token from [@BotFather](https://t.me/BotFather)

### 2. LiveKit Configuration
To handle voice traffic, you need a LiveKit instance:
- **Option A (Easiest):** Sign up for a free account at [LiveKit Cloud](https://cloud.livekit.io).
- **Option B (Self-hosted):** Run LiveKit Server via Docker (included in `docker-compose.yml`).

**What is `LIVEKIT_API_KEY`?**
It is a unique identifier (like a username) used by your Backend to securely communicate with the LiveKit media server. It is required to generate the "Join Tokens" that allow users to connect to a voice room.

**Where to get it?**
1. Go to [LiveKit Cloud Project Settings](https://cloud.livekit.io).
2. Create a new **API Key**.
3. You will receive a **Key** (`LIVEKIT_API_KEY`) and a **Secret** (`LIVEKIT_API_SECRET`).
4. Copy these into your `.env` file.

---

## 🌐 Deployment

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | [Netlify](https://app.netlify.com/) | Includes Anti-DDoS headers in `netlify.toml` |
| Bot/Backend | [Hugging Face Spaces](https://huggingface.co/spaces) | Docker SDK — Port 7860 mandatory |
| Media | [LiveKit Cloud](https://cloud.livekit.io) | Free tier handles ~50 concurrent users |
| MongoDB | [MongoDB Atlas](https://cloud.mongodb.com/) | **Essential** for whitelisting and persistence |
| Redis | [Upstash Redis](https://console.upstash.com/) | **Required** for Anti-DDoS protections |

---

## 🔐 Configuration & Environment Secrets

### 🛠️ Service-Specific Environment Mapping

#### 1. Backend & Bot (Hugging Face)
> **IMPORTANT:** Hugging Face requires Docker containers to listen on port **7860**. The provided `Dockerfile` is already optimized for this.

| Variable | Value / Source |
|---|---|
| `MONGODB_URI` | Your [MongoDB Atlas](https://cloud.mongodb.com/) connection string |
| `REDIS_URL` | **MUST** start with `rediss://` ([Upstash](https://console.upstash.com/) TLS) |
| `LIVEKIT_URL` | Your LiveKit Server URL (starts with `wss://`) |
| `LIVEKIT_API_KEY` | From [LiveKit Cloud](https://cloud.livekit.io) dashboard |
| `LIVEKIT_API_SECRET` | From [LiveKit Cloud](https://cloud.livekit.io) dashboard |
| `TELEGRAM_BOT_TOKEN` | Your Bot Token from [@BotFather](https://t.me/BotFather) |
| `OWNER_IDS` | Comma-separated Developer IDs ([@RoseBot](https://t.me/MissRose_bot)) |
| `BACKEND_URL` | Your [HF Space](https://huggingface.co/spaces) URL |
| `MINIAPP_URL` | Your public [Netlify](https://app.netlify.com/) URL |


#### 2. Frontend (Netlify)
| Variable | Value / Source |
|---|---|
| `VITE_BACKEND_URL` | Your HF Backend URL (starts with `https://`) |
| `VITE_LIVEKIT_URL` | Your LiveKit Server URL (starts with `wss://`) |

---

## 📜 License
All rights reserved. This project is a private codebase and is not licensed for public use, modification, or distribution. Use by unauthorized third parties is prohibited.
