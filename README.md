# ![HA-Claw Logo](logo.png)
# HA-Claw 🤖

Local AI-powered Smart Home Assistant – runs as a Home Assistant Add-on.

## Features

- 🧠 **Agentic AI Loop** – LLM with tool calling via OpenRouter (multi-model)
- 🏠 **Home Assistant Integration** – Read states, search entities, control devices
- 💬 **Telegram Bot** – Optional, with whitelist security + inline confirmation for dangerous actions
- 🖥️ **Web Chat UI** – Embedded in HA sidebar via Ingress
- 🔐 **Security** – Reject-first whitelist, secret redaction in logs, 60s safety timeout
- 💾 **JSON Store** – Notes, conversations, memory – backed up by HA automatically
- ⚡ **Lightweight** – No database, no native deps, runs on HA Green (ARM64)

## Install on Home Assistant

1. Go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add: `https://github.com/unpaved028/ha-claw`
3. Find **HA-Claw** → click **Install**
4. Go to **Configuration** tab:
   - Enter your **OpenRouter API key** (get one at [openrouter.ai](https://openrouter.ai))
   - *(Optional)* Enter Telegram bot token + allowed user IDs
5. **Start** the add-on → it appears as **HA-Claw** in your sidebar

## Local Development

```bash
cd ha-claw/

# Install dependencies
npm install

# Configure (copy & edit with your API key)
cp dev-options.json.example dev-options.json
# Edit dev-options.json → add your OpenRouter API key

# Run in dev mode (hot-reload)
npm run dev
# → Web UI: http://127.0.0.1:3100
```

> **Note:** HA tools won't work locally unless you set `HA_API_URL` and `SUPERVISOR_TOKEN` env vars pointing to your HA instance.

## Architecture

```
ha-claw/                     # Add-on directory
├── config.yaml              # HA Add-on manifest
├── Dockerfile               # Multi-stage ARM64/AMD64 build
├── src/
│   ├── index.ts             # Boot: config → storage → tools → web → telegram
│   ├── core/
│   │   ├── config.ts        # Reads /data/options.json or dev-options.json
│   │   ├── logger.ts        # JSON logs with secret redaction
│   │   ├── types.ts         # Shared types (ChatMessage, ToolCall, etc.)
│   │   ├── openrouter.ts    # OpenRouter API client (retry, timeout)
│   │   ├── agentic-loop.ts  # Core loop: LLM → Tools → LLM (max 10 iterations)
│   │   └── ha-client.ts     # HA REST API client (SUPERVISOR_TOKEN)
│   ├── tools/
│   │   ├── registry.ts      # Tool registry with danger flags
│   │   ├── builtins.ts      # Built-in: time, system info, store CRUD
│   │   └── ha-tools.ts      # HA: get state, search, call service
│   ├── storage/
│   │   └── json-store.ts    # File-per-record JSON storage
│   ├── telegram/
│   │   ├── bot.ts           # Grammy bot → agentic loop
│   │   ├── whitelist.ts     # User-ID gate (reject-first)
│   │   └── confirmation.ts  # Inline keyboard safety gate
│   └── web/
│       └── server.ts        # Ingress Fastify server + chat API
└── agents/
    └── butler.md            # Butler agent prompt
```

## Phases

- [x] **Phase 0** – Foundation (Add-on, Config, Storage, Web, Telegram)
- [x] **Phase 1** – Agentic Loop (OpenRouter, Tools, Safety Gate)
- [x] **Phase 2** – HA Integration (States, Services, Search)
- [ ] **Phase 3** – Web Dashboard (SPA, Log Viewer, Agent Editor)
- [ ] **Phase 4** – Polish & Publish (Multi-arch build, CHANGELOG)
