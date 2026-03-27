# HA-Claw 🤖

Local AI-powered Smart Home Assistant – runs as a Home Assistant Add-on.

## Features

- 🧠 **Agentic AI Loop** – LLM with tool calling via OpenRouter (multi-model, max 10 iterations)
- 🏠 **Home Assistant Integration** – Read states, search entities, control devices with action verification
- 📊 **Proactive Analysis** – Periodic environment scans: energy waste, security gaps, cover/raffstore management, humidity/mold risk, maintenance issues. Top 3 findings written to backlog.
- 🔄 **Self-Improving** – Learns from corrections, tracks usage patterns, detects errors, applies dynamic prompt patches
- ⏰ **Scheduler** – Recurring cron jobs (`every 5m`, `daily 07:00`, `weekdays 08:00`) that execute through the AI agent
- 🧰 **Interactive Tool Vault** – 25+ tools, toggleable on/off from the Settings UI
- 💬 **Telegram Bot** – Optional, with whitelist security + inline confirmation for dangerous actions
- 🖥️ **Web Chat UI** – Embedded in HA sidebar via Ingress, with speech-to-text
- 🔐 **Security** – Reject-first whitelist, secret redaction in logs, safety gate for dangerous actions. Actions run locally, LLM calls go to cloud API.
- 💾 **Persistent Memory** – Memory cards, chat history, learning data, backlog – all backed up by HA automatically
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
│   ├── index.ts             # Boot: config → storage → tools → web → telegram → scheduler
│   ├── core/
│   │   ├── config.ts        # Reads /data/options.json or dev-options.json
│   │   ├── logger.ts        # JSON logs with secret redaction
│   │   ├── types.ts         # Shared types (ChatMessage, ToolCall, etc.)
│   │   ├── openrouter.ts    # OpenRouter API client (retry, timeout)
│   │   ├── agentic-loop.ts  # Core loop with learning context injection
│   │   ├── ha-client.ts     # HA REST API + Template API + Area mapping
│   │   ├── entity-cache.ts  # Area-based entity grouping for agent context
│   │   ├── profile.ts       # Bot name, user name, personality
│   │   └── proactive-analysis.ts  # 8-module HA environment scanner
│   ├── tools/
│   │   ├── registry.ts      # Tool registry with enable/disable + danger flags
│   │   ├── builtins.ts      # 25+ tools: time, memory, schedule, backlog, learning
│   │   └── ha-tools.ts      # HA tools with action feedback verification
│   ├── storage/
│   │   ├── json-store.ts    # File-per-record JSON storage
│   │   ├── memory-cards.ts  # Memory card system (CRUD, TTL, hybrid search)
│   │   ├── backlog.ts       # Improvement backlog (proposed/approved/deferred/rejected/done)
│   │   ├── action-log.ts    # Action log with rollback support
│   │   ├── scheduler.ts     # Cron-like job scheduler (30s tick)
│   │   └── learning.ts      # Self-improvement: corrections, patches, patterns, errors
│   ├── telegram/
│   │   ├── bot.ts           # Grammy bot → agentic loop
│   │   ├── whitelist.ts     # User-ID gate (reject-first)
│   │   └── confirmation.ts  # Inline keyboard safety gate
│   └── web/
│       ├── server.ts        # Ingress Fastify server + API endpoints
│       └── dashboard.ts     # SPA dashboard with SVG icons
└── agents/
    └── butler.md            # Butler agent prompt with area-based entity cache
```

## Phases

- [x] **Phase 0** – Foundation (Add-on, Config, Storage, Web, Telegram)
- [x] **Phase 1** – Agentic Loop (OpenRouter, Tools, Safety Gate)
- [x] **Phase 2** – HA Integration (States, Services, Search)
- [x] **Phase 3** – Web Dashboard (SPA, Tool Vault, Backlog, Scheduler, Settings)
- [x] **Phase 4** – Intelligence (Self-Improvement, Proactive Analysis, Action Feedback)
- [ ] **Phase 5** – Polish & Publish (Multi-arch build, documentation, community)
