# HA-Claw Architecture

## Overview

HA-Claw is a TypeScript (ESM) application running as a Home Assistant Add-on. It connects to Home Assistant via the Supervisor API, serves a Web UI via Ingress, and optionally runs a Telegram bot.

```
┌─────────────────────────────────────────────────────┐
│                   HA-Claw Add-on                    │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ Web UI   │  │ Telegram │  │ Scheduler /       │ │
│  │ (Ingress)│  │ Bot      │  │ Backlog Processor │ │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘ │
│       │              │                 │            │
│       └──────────────┼─────────────────┘            │
│                      │                              │
│              ┌───────▼────────┐                     │
│              │  Agentic Loop  │                     │
│              │  (max 10 iter) │                     │
│              └───────┬────────┘                     │
│                      │                              │
│         ┌────────────┼────────────┐                 │
│         │            │            │                 │
│   ┌─────▼─────┐ ┌───▼────┐ ┌────▼──────┐          │
│   │ Tool      │ │OpenRou-│ │ Storage   │          │
│   │ Registry  │ │ter API │ │ (JSON)    │          │
│   └─────┬─────┘ └────────┘ └───────────┘          │
│         │                                           │
│   ┌─────▼─────────────────────────┐                 │
│   │ HA Tools │ Builtins │ Skills  │                 │
│   └───────────────────────────────┘                 │
│                      │                              │
└──────────────────────┼──────────────────────────────┘
                       │
              ┌────────▼────────┐
              │ Home Assistant  │
              │ Supervisor API  │
              └─────────────────┘
```

## Directory Structure

```
ha-claw/
├── src/
│   ├── index.ts                 # Entry point, boot sequence
│   ├── core/
│   │   ├── agentic-loop.ts      # LLM loop with tool calling (max 10 iterations)
│   │   ├── config.ts            # Config loader (Supervisor + dev fallback)
│   │   ├── entity-cache.ts      # HA entity discovery, grouped by area
│   │   ├── ha-client.ts         # Home Assistant REST API client
│   │   ├── logger.ts            # Pino-based structured logger
│   │   ├── onboarding.ts        # First-run profile setup flow
│   │   ├── openrouter.ts        # OpenRouter API client (OpenAI-compatible)
│   │   ├── proactive-analysis.ts# Home analysis modules (energy, security, etc.)
│   │   ├── profile.ts           # User profile (name, personality, model overrides)
│   │   └── types.ts             # Shared TypeScript types
│   ├── storage/
│   │   ├── json-store.ts        # Generic JSON file store (notes, conversations)
│   │   ├── memory-cards.ts      # Long-term memory with hybrid retrieval
│   │   ├── backlog.ts           # Improvement task CRUD (individual JSON files)
│   │   ├── backlog-processor.ts # Automated task processing (approve → solve → execute)
│   │   ├── action-log.ts        # Persistent action/tool execution log
│   │   ├── learning.ts          # Self-improvement (corrections, patterns, errors)
│   │   └── scheduler.ts         # Recurring job scheduler
│   ├── tools/
│   │   ├── registry.ts          # Tool registration, complexity levels, enable/disable
│   │   ├── ha-tools.ts          # HA service calls, entity queries, verification
│   │   ├── builtins.ts          # Time, system info, store CRUD, analyze_home
│   │   └── ha-best-practices.ts # Best practices knowledge base (6 reference files)
│   ├── web/
│   │   ├── server.ts            # Fastify server, API routes, Ingress
│   │   └── dashboard.ts         # Embedded HTML/CSS/JS dashboard
│   └── telegram/
│       ├── bot.ts               # Grammy bot setup, message handling
│       ├── confirmation.ts      # Inline-keyboard safety gate
│       └── whitelist.ts         # User ID whitelist guard
├── agents/
│   ├── butler.md                # Main agent system prompt
│   ├── cie.md                   # CIE (Continuous Improvement Engine) prompt
│   ├── KI-Systemarchitekt.md    # System architect prompt
│   └── skills/
│       └── ha-best-practices/   # Reference files (6 markdown/yaml docs)
├── config.yaml                  # HA Add-on manifest
├── Dockerfile                   # Multi-stage Docker build (Node 22)
├── package.json                 # Dependencies (grammy, fastify)
└── tsconfig.json                # TypeScript config (ESM)
```

## Key Components

### Agentic Loop (`core/agentic-loop.ts`)
The core LLM interaction loop. Sends messages to the configured LLM via OpenRouter, parses tool call responses, executes tools, and feeds results back. Hard limit of 10 iterations prevents runaway loops. Automatically injects entity cache, memory cards, and learning context into the system prompt.

### Tool Registry (`tools/registry.ts`)
Central registry for all tools. Each tool has:
- **Name & description** for LLM function calling
- **Parameters** (JSON Schema)
- **Handler** function
- **Dangerous flag** — triggers confirmation flow
- **Complexity level** (1-3) — maps to different LLM models for cost optimization
- **Enable/disable** state — persisted to disk

### Tool Complexity Levels
Each tool is assigned a complexity rating:
- **Level 1** (simple): State queries, entity search, basic service calls
- **Level 2** (moderate): Dangerous service calls, home analysis
- **Level 3** (complex): Reserved for future advanced multi-step tools

Users can map different LLM models to each level in Settings, e.g. Haiku for Level 1, Sonnet for Level 2, Opus for Level 3.

### HA Best Practices (`tools/ha-best-practices.ts`)
Loads 6 reference files from `agents/skills/ha-best-practices/`:
- `automation-patterns.md` — Trigger/condition/action patterns
- `device-control.md` — Safe device control practices
- `helper-selection.md` — Input helper selection guide
- `safe-refactoring.md` — Refactoring without breaking automations
- `template-guidelines.md` — Jinja2 template best practices
- `examples.yaml` — Concrete YAML examples

The `ha_best_practices` tool searches by topic or keyword and returns relevant sections.

### Backlog Processor (`storage/backlog-processor.ts`)
Automated task processing pipeline:
1. Polls every 30 seconds for tasks needing work
2. `approved` tasks → AI generates a concrete solution → `solution_proposed`
3. User reviews and approves → `solution_approved`
4. AI executes the solution using available tools → `done`
5. On failure, reverts to `solution_approved` for retry

### Device Control Verification (`tools/ha-tools.ts`)
When `ha_call_service` is called:
1. Captures entity state before the call
2. Executes the service call
3. Waits (1.5s general, 3s for climate)
4. Checks entity state after the call
5. Returns verification result (confirmed/failed/timeout)
6. If verification fails, returns `IMPORTANT_WARNING` forcing the bot to honestly report the failure

### Self-Improvement (`storage/learning.ts`)
Four learning subsystems:
- **Corrections**: Learns from user corrections, auto-injected into future prompts
- **Prompt Patches**: Dynamic rules that modify agent behavior permanently
- **Usage Patterns**: Tracks recurring actions, detects habits
- **Error Tracking**: Records tool failures for smarter retries

### Storage
All data stored as JSON files in `/data/store/`:
- `notes/` — User notes
- `conversations/` — Chat history
- `memory/` — Long-term memory cards
- `backlog/` — Improvement tasks (individual files)
- `actions.jsonl` — Action/tool execution log
- `learning.json` — Self-improvement data
- `scheduler.json` — Recurring job definitions

All storage is automatically included in HA backups.

## Data Flow

```
User Message (Web/Telegram)
    │
    ▼
Agentic Loop
    │
    ├─ System Prompt (butler.md + personality + entity cache + memory + learning)
    │
    ├─ LLM Call (OpenRouter) ──► Tool Call Response
    │                                │
    │                                ▼
    │                          Tool Registry
    │                                │
    │                    ┌───────────┼───────────┐
    │                    │           │           │
    │               HA Tools    Builtins    Best Practices
    │                    │           │           │
    │                    ▼           ▼           ▼
    │              HA Supervisor   Storage    Reference Files
    │                    │           │
    │                    └───────────┘
    │                         │
    │                    Tool Result
    │                         │
    ▼                         ▼
LLM Call (with tool results) ──► Final Response
    │
    ▼
User (Web/Telegram)
```
