# 🎙️ VCBot — Telegram Mini App Voice & Text Chat

A Telegram Bot and Mini App (WebApp) suite for custom-branded voice chat rooms. Powered by WebRTC and FastAPI.

> ⚠️ **Audio Only**: This project is focused strictly on voice chat and text messaging. No video/camera features are implemented.

---

## 🏗️ Architecture

The system is built as a monorepo containing three core services:

- **`bot/`**: Python Telegram Bot (`python-telegram-bot` v21). Handles starting/ending voice sessions and admin checks.
- **`backend/`**: FastAPI Signaling Server. Manages WebRTC signaling (offers, answers, ICE candidates), room state in **Redis**, and persistence in **MongoDB**.
- **`frontend/`**: React + Vite + TailwindCSS. A polished Telegram Mini App that provides the voice chat UI and WebRTC peer-to-peer audio connectivity.

```
┌──────────┐     WebSocket      ┌──────────┐     WebSocket     ┌──────────┐
│  User A  │ ←─────────────────→│ FastAPI  │←──────────────────→│  User B  │
│ (Mini    │     (signaling)    │ (Signaling│    (signaling)    │ (Mini    │
│  App)    │←══════════════════→│  Server) │←═════════════════→│  App)    │
└──────────┘  Peer-to-Peer      └────┬─────┘  Peer-to-Peer     └──────────┘
      │           Audio              │            Audio            │
      │                              │                             │
      │                    ┌─────────┴─────────┐                  │
      │                    │  MongoDB (groups,  │                  │
      │                    │  users)            │                  │
      │                    │  Redis (rooms,     │                  │
      │                    │  participants)     │                  │
      │                    └─────────┬─────────┘                  │
      │                              │                            │
      │                    ┌─────────┴─────────┐                  │
      └───────────────────→│  Python Bot       │←─────────────────┘
                           │  (polling)        │
                           └───────────────────┘
```
The server **never** touches audio data — only relays WebRTC signaling (offers, answers, ICE candidates).

---

## 🚀 Key Features

- **Custom Voice Rooms**: Native WebRTC audio inside a Telegram Mini App.
- **Free & Open for All**: No subscription or payment system — fully accessible.
- **Modern UI**: Frosted glass cards, purple gradients, and real-time speaking animations.
- **Scalable**: Redis-backed session management and containerized deployment.

---

## 📦 Complete Tech Stack

### 🤖 Bot Layer
| Component | Technology | Notes |
|---|---|---|
| Bot Framework | `python-telegram-bot` v21 | Async/await throughout |
| Language | Python 3.11+ | Optimized for performance |
| Database | MongoDB Atlas | via `motor` async driver |

### ⚙️ Backend (Signaling Server)
| Component | Technology | Notes |
|---|---|---|
| Framework | FastAPI | High-performance ASGI framework |
| WebSockets | FastAPI WebSockets | Real-time signaling relay |
| Cache | Redis (Upstash) | Real-time room state management |
| Testing | Pytest | Integrated signaling unit tests |

### 🎨 Frontend (Mini App)
| Component | Technology | Notes |
|---|---|---|
| Framework | React 19 + Vite | Fast builds & HMR |
| Voice Engine | Browser WebRTC | Audio-only mesh topology |
| Styling | TailwindCSS | Utility-first, responsive design |
| State | Zustand | Lightweight store for room state |
| TG SDK | `@twa-dev/sdk` | Native Telegram WebApp integration |

### 🌐 Infrastructure
| Component | Technology | Notes |
|---|---|---|
| Proxy | Nginx | SSL termination & WebSocket proxy |
| Container | Docker Compose | One-click service orchestration |

---

## 🤖 BotFather Setup

Copy and paste these commands into [@BotFather](https://t.me/BotFather) to set up your bot's command list:

```
start - Welcome message
help - Show all available commands
vc - Join or start a voice chat (group)
endvc - End the active voice chat (group)
```

---

## 🏁 Getting Started

### 1. Prerequisites
- Python 3.11+ & Node.js 18+
- Docker & Docker Compose
- MongoDB Atlas & Upstash Redis (or local instances)
- Bot Token from [@BotFather](https://t.me/BotFather)

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 3. Running with Docker (Recommended)
```bash
docker compose up --build
```
This starts the bot, backend, frontend, MongoDB, Redis, and an Nginx reverse proxy.

### 4. Manual Local Development

**Prerequisites**: Make sure MongoDB and Redis are running locally (or set `MONGODB_URI`/`REDIS_URL` in `.env` to remote instances).

**From repo root, set up your environment and run each service:**

### 🐍 Python Setup (Backend & Bot)
It is highly recommended to use a virtual environment to manage dependencies:

```bash
# 1. Create a virtual environment
python -m venv venv

# 2. Activate it
# On Windows:
.\venv\Scripts\activate
# On Unix or macOS:
source venv/bin/activate

# 3. Install dependencies for both services
pip install -r backend/requirements.txt
pip install -r bot/requirements.txt
```

### 🚀 Running Services
Run each command in a separate terminal (ensure the virtual environment is activated in each):

#### Backend (Signaling Server)
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

#### Bot
```bash
python -m bot.main
```

#### Frontend (Mini App)
```bash
cd frontend
npm install
echo "VITE_BACKEND_URL=http://localhost:8000" > .env
npm run dev
```

---

## 🔌 API Documentation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/api/ice-config` | Fetch STUN/TURN server details |
| `GET` | `/api/room/{id}/participants` | Get active participant list |
| `POST` | `/api/room/{id}/participants/notify` | Notify user via bot |
| `WS` | `/ws/{room_id}/{user_id}` | WebSocket signaling relay |

### Test Commands (curl)

```bash
# Health check
curl http://localhost:8000/health

# ICE/STUN config
curl http://localhost:8000/api/ice-config

# Get participants (empty room)
curl http://localhost:8000/api/room/test123/participants
```

### Test WebSocket (wscat)

```bash
# Install
npm install -g wscat

# Terminal 1 — User A
wscat -c "ws://localhost:8000/ws/room1/user_a"
# after connected, paste: {"type":"join","user_info":{"first_name":"Alice"}}

# Terminal 2 — User B
wscat -c "ws://localhost:8000/ws/room1/user_b"
# after connected, paste: {"type":"join","user_info":{"first_name":"Bob"}}

# Send chat message (from either terminal)
# {"type":"chat_message","text":"Hello!","sender_name":"Alice"}
```

---

## 🎨 Design System
The Mini App follows the "Purple Mauve" aesthetic:
- **Background**: 3-stop diagonal gradient (`#5B6BC0`, `#4A3080`, `#8B5A7A`).
- **Cards**: Frosted glass (`backdrop-blur-xl`) with white semi-transparent backgrounds.
- **Typography**: Native Telegram system font stack.

---

---

## 🌐 Deployment

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | Vercel / Netlify / Cloudflare Pages | Static SPA — connect your repo, auto-deploys |
| Bot | Railway / Render | Python worker — use **UptimeRobot** (https://uptimerobot.com) to ping every 5 min and keep it alive |
| Backend | Railway / Render | FastAPI web service — same, UptimeRobot to prevent sleeping |
| MongoDB | MongoDB Atlas | Free tier (512 MB) |
| Redis (room state) | Upstash Redis | Free tier (100 MB) |
| Cron / Keep-alive | Upstash Cron or UptimeRobot | Ping `/health` every 5 min to prevent Render sleep |

> **Keep-alive note**: Render free tier sleeps after 15 min of inactivity. Railway does not sleep (but has a $5 monthly credit cap). If using Render, ping the `/health` endpoint every 5 min using **Upstash Cron** or **UptimeRobot**.

---

## 🔐 Configuration & Environment Secrets

Managing secrets securely is critical for production. **NEVER commit your `.env` file to version control.**

### Shared Environment Variables (.env — root)

| Variable | Description | Source |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | API Token for your bot | @BotFather |
| `SUPPORT_CHANNEL` | Support channel username (without @) for /start button | Telegram |
| `MINIAPP_URL` | The public URL of your React app | Netlify/Vercel URL |
| `MONGODB_URI` | Connection string for MongoDB | MongoDB Atlas |
| `REDIS_URL` | Connection string for Redis (room state) | Upstash Redis Dashboard |
| `TURN_URL` | TURN server URL for WebRTC | Metered.ca / Twilio |
| `TURN_USERNAME` | TURN server username | Metered.ca / Twilio |
| `TURN_PASSWORD` | TURN server password | Metered.ca / Twilio |
| `BACKEND_URL` | Public URL of your FastAPI server | Render URL |
| `ENVIRONMENT` | `development` or `production` (Safety Switch) | Manual |
| `SECRET_KEY` | "Master Key" for signing session data | `openssl rand -hex 32` |

### Frontend Environment Variables (frontend/.env)

| Variable | Description | Example |
|---|---|---|
| `VITE_BACKEND_URL` | HTTP URL of the backend | `https://your-backend.onrender.com` |
| `VITE_WS_URL` | WebSocket URL of the backend | `wss://your-backend.onrender.com` |

---

## 📜 License
All rights reserved. This project is a private codebase and is not licensed for public use, modification, or distribution. Use by unauthorized third parties is prohibited.
