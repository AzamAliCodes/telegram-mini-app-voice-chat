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

---

## 🌐 Deployment

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | Netlify / Vercel | Static SPA — connect your repo, auto-deploys |
| Bot | Hugging Face Spaces | Docker SDK — Runs 24/7 for free |
| Backend | Hugging Face Spaces | Docker SDK — Same container as Bot |
| MongoDB | MongoDB Atlas | Free tier (512 MB) — Allow IP `0.0.0.0/0` |
| Redis | Upstash Redis | Free tier (100 MB) — Always on |

---

## 🔐 Configuration & Environment Secrets

Managing secrets securely is critical for production. **NEVER commit your `.env` file to version control.**

### 🛠️ Service-Specific Environment Mapping

When deploying, add these variables to the respective hosting platforms:

#### 1. Backend & Bot (Hugging Face Spaces - Docker)
| Variable | Value / Source |
|---|---|
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `REDIS_URL` | Your Upstash Redis connection string |
| `TELEGRAM_BOT_TOKEN` | Your Bot Token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | Your bot's username (without @) |
| `MINIAPP_URL` | Your public Netlify URL (e.g., `https://site.netlify.app`) |
| `BACKEND_URL` | Your HF Direct URL (e.g., `https://user-space.hf.space`) |
| `TELEGRAM_API_PROXY` | *(Optional)* Cloudflare Worker URL to bypass API blocks |
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | A long random string for security |

#### 2. Frontend (Netlify - Static Site)
| Variable | Value / Source |
|---|---|
| `VITE_BACKEND_URL` | Your HF Backend URL (starts with `https://`) |
| `VITE_WS_URL` | Your HF Backend URL (starts with `wss://`) |

---

### 🛡️ Bypassing Cloud Firewalls (Cloudflare Proxy)

If you are hosting the Bot on a free service like Hugging Face Spaces, your connection to `api.telegram.org` might be blocked, resulting in a `ConnectError` or timeout in your logs.

You can bypass this for free by creating a Cloudflare Worker to act as a proxy:

1. Sign up for a free [Cloudflare](https://dash.cloudflare.com/) account.
2. Go to **Workers & Pages** in the left sidebar.
3. Click **Create application** and then select **Start with Hello World!**.
4. Name your worker (e.g., `tg-proxy`) and click the blue **Deploy** button.
5. Once deployed, click the **Edit Code** button.
6. Delete the existing code and replace it with this exact script:
   ```javascript
   export default {
     async fetch(request) {
       const url = new URL(request.url);
       url.host = 'api.telegram.org';
       return fetch(new Request(url, request));
     },
   };
   ```
7. Click **Deploy** in the top right corner.
8. Copy your new Worker URL (e.g., `https://tg-proxy.yourname.workers.dev`). Note: A `404` error when visiting this link directly is normal!
9. In your hosting provider's Secrets (e.g., Hugging Face Settings), add a new secret:
   * **Key:** `TELEGRAM_API_PROXY`
   * **Value:** Your Worker URL (without a trailing slash).

Restart your server, and the bot will connect successfully!

---

### Shared Environment Variables (.env — root reference)

| Variable | Description | Source |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | API Token for your bot | @BotFather |
| `SUPPORT_CHANNEL` | Support channel username (without @) | Telegram |
| `MINIAPP_URL` | The public URL of your React app | Netlify URL |
| `MONGODB_URI` | Connection string for MongoDB | MongoDB Atlas |
| `REDIS_URL` | Connection string for Redis | Upstash Redis |
| `TURN_URL` | TURN server URL for WebRTC | Metered.ca / Twilio |
| `TURN_USERNAME` | TURN server username | Metered.ca / Twilio |
| `TURN_PASSWORD` | TURN server password | Metered.ca / Twilio |
| `BACKEND_URL` | Public URL of your FastAPI server | HF Direct URL |
| `ENVIRONMENT` | `production` | Manual |
| `SECRET_KEY` | "Master Key" for security | Random string |

---

## 📜 License
All rights reserved. This project is a private codebase and is not licensed for public use, modification, or distribution. Use by unauthorized third parties is prohibited.
