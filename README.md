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
┌──────────┐     WebSocket      ┌──────────┐     WebSocket      ┌──────────┐
│  User A  │←──────────────────→│ FastAPI  │←──────────────────→│  User B  │
│  (Mini   │     (signaling)    │(Signaling│    (signaling)     │  (Mini   │
│   App)   │←══════════════════→│  Server) │←══════════════════→│   App)   │
└──────────┘  Peer-to-Peer      └────┬─────┘  Peer-to-Peer      └──────────┘
      │           Audio              │            Audio            │
      │                              │                             │
      │                    ┌─────────┴─────────┐                   │
      │                    │  MongoDB (groups, │                   │
      │                    │  users)           │                   │
      │                    │  Redis (rooms,    │                   │
      │                    │  participants)    │                   │
      │                    └─────────┬─────────┘                   │
      │                              │                             │
      │                    ┌─────────┴─────────┐                   │
      └───────────────────→│  Python Bot       │←──────────────────┘
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
| Frontend | [Netlify](https://app.netlify.com/) / [Vercel](https://vercel.com/dashboard) | Static SPA — connect your repo, auto-deploys |
| Bot | [Hugging Face Spaces](https://huggingface.co/spaces) | Docker SDK — Port 7860 mandatory |
| Backend | [Hugging Face Spaces](https://huggingface.co/spaces) | Docker SDK — Port 7860 mandatory |
| MongoDB | [MongoDB Atlas](https://cloud.mongodb.com/) | Free tier (512 MB) — Allow IP `0.0.0.0/0` |
| Redis | [Upstash Redis](https://console.upstash.com/) | Free tier (100 MB) — Use `rediss://` for TLS |
| TURN | [Metered.live](https://dashboard.metered.ca/) | Standard WebRTC relay |

---

## 🔐 Configuration & Environment Secrets

### 🛠️ Service-Specific Environment Mapping

#### 1. Backend & Bot (Hugging Face Spaces - Docker)
> **IMPORTANT:** Hugging Face requires Docker containers to listen on port **7860**. The provided `Dockerfile` is already optimized for this.

| Variable | Value / Source |
|---|---|
| `MONGODB_URI` | Your [MongoDB Atlas](https://cloud.mongodb.com/) connection string |
| `REDIS_URL` | **MUST** start with `rediss://` ([Upstash](https://console.upstash.com/) TLS) |
| `TELEGRAM_BOT_TOKEN` | Your Bot Token from [@BotFather](https://t.me/BotFather) |
| `TURN_URL` | e.g., `turn:sub.metered.live:443` ([Metered.live](https://dashboard.metered.ca/)) |
| `TURN_USERNAME` | Your TURN provider username |
| `TURN_PASSWORD` | Your TURN provider password |
| `BACKEND_URL` | Your [HF Space](https://huggingface.co/spaces) URL |
| `MINIAPP_URL` | Your public [Netlify](https://app.netlify.com/) / [Vercel](https://vercel.com/dashboard) URL |

#### 2. Frontend (Netlify - Static Site)
| Variable | Value / Source |
|---|---|
| `VITE_BACKEND_URL` | Your HF Backend URL (starts with `https://`) |
| `VITE_WS_URL` | Your HF Backend URL (starts with `wss://`) |

---

### 🛡️ Bypassing Cloud Firewalls (Cloudflare Proxy)

If you are hosting the Bot on a free service like Hugging Face Spaces, your connection to `api.telegram.org` might be blocked.

You can bypass this by creating a [Cloudflare Worker](https://workers.cloudflare.com/) to act as a proxy:

1. Sign up for a free [Cloudflare](https://dash.cloudflare.com/) account.
2. Go to **Workers & Pages** $\rightarrow$ **Create application** $\rightarrow$ **Create Worker** (use the default "Hello World" template).
3. Name your worker (e.g., `tg-proxy`) and click **Deploy**.
4. Once deployed, click **Edit Code**, delete the existing template code, and paste this:
   ```javascript
   export default {
     async fetch(request) {
       const url = new URL(request.url);
       url.host = 'api.telegram.org';
       return fetch(new Request(url, request));
     },
   };
   ```
5. Click **Deploy** (top right) to save the changes.
6. Copy your new Worker URL (e.g., `https://tg-proxy.yourname.workers.dev`).
7. In your hosting provider's Secrets (e.g., [Hugging Face Settings](https://huggingface.co/settings/secrets)), add a new secret:
   * **Key:** `TELEGRAM_API_PROXY`
   * **Value:** Your Worker URL.

Restart your server, and the bot will connect successfully!

---

## 🔍 Inspecting & Debugging (TMA)

Telegram Mini Apps can be difficult to debug on mobile. Use these methods to access the console and network logs:

### 1. Telegram Desktop (easiest)
- Go to **Settings** > **Advanced** > **Experimental settings**.
- Enable **WebView inspection**.
- Open the Mini App, right-click, and select **Inspect**.

### 2. Android (Chrome Remote Debugging)
- Enable **USB Debugging** in your phone's Developer Options.
- In Telegram: **Settings** > scroll to bottom > **Long-press** version twice > **Enable WebView Debug**.
- Connect phone to PC, open Chrome, and go to `chrome://inspect/#devices`.

### 3. iOS (Safari Web Inspector)
- Enable **Web Inspector**: iPhone Settings > **Safari** > **Advanced**.
- In Telegram: Tap **Settings** 10 times > Enable **Allow Web View Inspection**.
- Connect to a Mac and use **Safari** > **Develop** menu.

### 4. On-Device Console (Eruda)
For a built-in console on your phone, add this to your `index.html` during development:
```html
<script src="//cdn.jsdelivr.net/npm/eruda"></script>
<script>eruda.init();</script>
```

---

### Shared Environment Variables (.env — root reference)

| Variable | Description | Source |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | API Token for your bot | [@BotFather](https://t.me/BotFather) |
| `SUPPORT_CHANNEL` | Support channel username (without @) | Telegram |
| `MINIAPP_URL` | The public URL of your React app | [Netlify](https://www.netlify.com/) / [Vercel](https://vercel.com/) |
| `MONGODB_URI` | Connection string for MongoDB | [MongoDB Atlas](https://www.mongodb.com/atlas/database) |
| `REDIS_URL` | Connection string for Redis | [Upstash Redis](https://upstash.com/) |
| `TURN_URL` | TURN server URL for WebRTC | [Metered.live](https://www.metered.ca/) |
| `TURN_USERNAME` | TURN server username | [Metered.live](https://www.metered.ca/) |
| `TURN_PASSWORD` | TURN server password | [Metered.live](https://www.metered.ca/) |
| `BACKEND_URL` | Public URL of your FastAPI server | [Hugging Face Space URL](https://huggingface.co/spaces) |
| `ENVIRONMENT` | `production` | Manual |
| `SECRET_KEY` | "Master Key" for security | Random string |

---

## 📜 License
All rights reserved. This project is a private codebase and is not licensed for public use, modification, or distribution. Use by unauthorized third parties is prohibited.
