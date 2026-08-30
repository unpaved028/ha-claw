# Architecture

HA-Claw is a TypeScript (ESM) application running as a Home Assistant add-on. It talks to
Home Assistant through the Supervisor API, serves a Web UI over Ingress, and optionally runs
a Telegram bot. Two runtime dependencies: `fastify` and `grammy`.

- [Runtime shape](#runtime-shape)
- [Repository layout](#repository-layout)
- [Web UI build](#web-ui-build)
- [Agentic loop](#agentic-loop)
- [Tool registry](#tool-registry)
- [Entity cache](#entity-cache)
- [Area and floor detection](#area-and-floor-detection)
- [Device control verification](#device-control-verification)
- [Backlog processor](#backlog-processor)
- [Proactive analysis vs system health](#proactive-analysis-vs-system-health)
- [Self-improvement](#self-improvement)
- [Storage](#storage)
- [Data flow](#data-flow)

## Runtime shape

```text
┌─────────────────────────────────────────────────────┐
│                   HA-Claw Add-on                    │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Web UI   │  │ Telegram │  │ Scheduler /       │  │
│  │ (Ingress)│  │ Bot      │  │ Backlog Processor │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │             │                 │             │
│       └─────────────┼─────────────────┘             │
│                     │                               │
│             ┌───────▼────────┐                      │
│             │  Agentic Loop  │                      │
│             │  (max 10 iter) │                      │
│             └───────┬────────┘                      │
│                     │                               │
│        ┌────────────┼────────────┐                  │
│        │            │            │                  │
│  ┌─────▼─────┐ ┌────▼───┐ ┌──────▼────┐             │
│  │ Tool      │ │OpenRou-│ │ Storage   │             │
│  │ Registry  │ │ter API │ │ (JSON)    │             │
│  └─────┬─────┘ └────────┘ └───────────┘             │
│        │                                            │
│  ┌─────▼─────────────────────────────┐              │
│  │ HA Tools │ Builtins │ Best Prac.  │              │
│  └───────────────────────────────────┘              │
│                     │                               │
└─────────────────────┼───────────────────────────────┘
                      │
             ┌────────▼────────┐
             │ Home Assistant  │
             │ Supervisor API  │
             └─────────────────┘
```

Three entry points feed one loop. The Web UI and the Telegram bot write to the same
conversation record, so a question asked in the sidebar can be followed up from the phone.

## Repository layout

```text
.
├── repository.yaml              # HA add-on repository manifest
├── README.md / README.de.md     # GitHub landing page
├── AGENTS.md                    # Instructions for AI coding agents
├── CONTRIBUTING.md · SECURITY.md · CODE_OF_CONDUCT.md · LICENSE
├── scripts/check-docs.mjs       # Markdown link checker, run by CI
├── docs/                        # This reference (English)
└── ha-claw/                     # ← the add-on
    ├── config.yaml              # Add-on manifest: version, options, schema
    ├── Dockerfile               # Two-stage build on node:22-alpine
    ├── DOCS.md / DOCS.de.md     # User manual, rendered by the HA add-on UI
    ├── CHANGELOG.md
    ├── icon.png · logo.png      # Add-on store assets
    ├── translations/{en,de}.yaml# Option labels for the HA config UI
    ├── scripts/
    │   └── bundle-dashboard.cjs # Generates src/web/dashboard.ts from src/web/ui/
    ├── agents/
    │   ├── main.md              # Main system prompt
    │   ├── onboarding.md        # Setup conversation prompt
    │   ├── cie.md               # Continuous Improvement Engine prompt
    │   ├── KI-Systemarchitekt.md
    │   └── skills/ha-best-practices/   # 6 reference files
    └── src/
        ├── index.ts             # Boot sequence
        ├── core/
        │   ├── agentic-loop.ts  # LLM loop with tool calling
        │   ├── config.ts        # Config loader (Supervisor + dev fallback)
        │   ├── context-manager.ts # Token estimation and history pruning
        │   ├── entity-cache.ts  # Entity discovery, grouped by floor and area
        │   ├── ha-client.ts     # Home Assistant REST client
        │   ├── logger.ts        # Pino logger with secret redaction
        │   ├── models.ts        # Canonical list of selectable models
        │   ├── onboarding.ts    # LLM-driven onboarding
        │   ├── openrouter.ts    # OpenRouter client, retry, circuit breaker
        │   ├── proactive-analysis.ts # 7 analysis modules → backlog
        │   ├── profile.ts       # Bot/user profile and personality
        │   ├── system-health.ts # Live standing-condition checks
        │   ├── backup-health.ts # Backup age and offsite detection
        │   └── types.ts
        ├── storage/
        │   ├── json-store.ts    # Generic JSON store, atomic writes
        │   ├── conversation.ts  # Shared Web + Telegram history
        │   ├── memory-cards.ts  # Long-term memory, keyword retrieval
        │   ├── backlog.ts       # Task CRUD, one file per task
        │   ├── backlog-processor.ts # Event-driven task pipeline
        │   ├── action-log.ts    # JSONL action log with rollback payloads
        │   ├── learning.ts      # Corrections, patches, patterns, errors
        │   ├── usage-tracker.ts # Token counts and cost estimate
        │   └── scheduler.ts     # Recurring jobs and one-shot timers
        ├── tools/
        │   ├── registry.ts      # Registration, complexity, enable/disable
        │   ├── ha-tools.ts      # HA tools + the safety policy
        │   ├── builtins.ts      # Store, memory, backlog, scheduler, learning
        │   ├── ha-best-practices.ts
        │   └── tool-cache.ts    # Short-lived result cache
        ├── web/
        │   ├── server.ts        # Fastify routes, SSE, web safety gate
        │   ├── dashboard.ts     # GENERATED — do not edit
        │   └── ui/              # dashboard.html · style.css · client.js
        └── telegram/
            ├── bot.ts           # Grammy setup, commands, message handling
            ├── confirmation.ts  # Inline-keyboard safety gate
            ├── notifications.ts # Proactive push, fast-track buttons
            ├── voice.ts         # Whisper transcription
            └── whitelist.ts     # User ID guard middleware
```

## Web UI build

`src/web/dashboard.ts` is **generated**, not written by hand, and it is committed on purpose.

Home Assistant Ingress serves the add-on under a rotating `/api/hassio_ingress/<token>/`
prefix. The browser cannot resolve relative `<link>` or `<script src>` paths under it, so the
entire UI has to arrive inlined in a single HTML response.
[`scripts/bundle-dashboard.cjs`](../ha-claw/scripts/bundle-dashboard.cjs) assembles
`src/web/ui/{dashboard.html,style.css,client.js}` into that file.

```bash
npm run bundle          # regenerate
npm run verify:bundle   # fail if the artefact drifted from its sources
npm run build           # runs bundle first via the prebuild hook
```

Because `prebuild` fires before `tsc`, the Docker image can never ship a stale dashboard, and
CI runs `verify:bundle` on every push.

One historical detail worth preserving: the bundler used to emit a TypeScript template
literal, escaping `` ` ``, `\` and `${` by hand in three ordered `String.replace` steps. Every
new special character in the frontend broke the build — that is the entire cause of the
0.8.1 → 0.8.5 bug series. Each line now goes through `JSON.stringify` and is reassembled at
runtime, which removes the failure class rather than fixing its instances.

## Agentic loop

[`src/core/agentic-loop.ts`](../ha-claw/src/core/agentic-loop.ts). Sends messages to
OpenRouter, parses tool calls, executes them, feeds results back. Hard limit of **10
iterations**.

Before the first call it assembles the system prompt from `agents/main.md` plus:

| Placeholder | Filled with |
| --- | --- |
| `{{TOOL_LIST}}` | Generated from the registry at runtime, with `(erfordert Bestätigung)` appended to dangerous tools |
| `{{ENTITY_CACHE}}` | The pruned entity cache for this request |

`{{TOOL_LIST}}` is generated rather than maintained by hand because the hand-written list in
`main.md` had drifted to the point of omitting 11 registered tools — the model did not know
its own capabilities. If `{{ENTITY_CACHE}}` is missing from a prompt, the cache is appended
instead of silently dropped.

Appended after the prompt body, per request: personality profile, active scheduler summary,
relevant memory cards, matching corrections, active prompt patches, usage patterns and recent
error context.

A `toolFilter` parameter restricts which tools an agent may use — onboarding runs with three.
A `ConfirmationFn` handles the safety gate, with implementations for Telegram, the Web UI, and
auto-approve for scheduled jobs.

## Tool registry

[`src/tools/registry.ts`](../ha-claw/src/tools/registry.ts). Each tool carries a name,
description, JSON Schema parameters, handler, `dangerous` flag and `complexity` tier. Disabled
tools are persisted to `store/disabled-tools.json` and are not sent to the model at all.

Full catalogue: [tools.md](tools.md). Tier semantics: [configuration.md](configuration.md#model-tiers).

## Entity cache

[`src/core/entity-cache.ts`](../ha-claw/src/core/entity-cache.ts). Built at startup and
refreshed every 30 minutes, or on demand via `POST /api/cache/refresh`.

It renders a compact text block, `# Floor` → `## Area` → entities, containing controllable
domains plus the sensor classes that answer real questions: `window`, `door`, `motion`,
`smoke`, `moisture`. Those get one line each with their type icon and entity ID, because a
collapsed list of "3 sensors" cannot answer *which* window is open.

Entities of the same domain sharing a state are compressed once there are three or more
(`3× light (all off)`), which keeps a large installation inside the prompt budget.

## Area and floor detection

[`src/core/ha-client.ts`](../ha-claw/src/core/ha-client.ts) tries three methods in order and
logs which one succeeded:

1. **Registry API** — `POST /config/area_registry/list`, `entity_registry/list`,
   `device_registry/list`, `floor_registry/list`. Most reliable.
2. **Jinja2 templates** — `areas()`, `area_entities()`, `floors()`, with a 10-second timeout
   so an unresponsive instance cannot hang startup.
3. **Entity ID parsing** — infers rooms from naming conventions
   (`lgt_og_bad_1` → upper floor, bathroom).

Entities inherit their device's area when they have none assigned, matching Home Assistant's
own behaviour.

## Device control verification

`ha_call_service` does not assume success:

1. Capture entity state.
2. Execute the service call.
3. Wait — 1.5 s generally, 3 s for `climate`.
4. Read the state again.
5. Return `confirmed`, `failed` or `timeout`.

A failure returns an `IMPORTANT_WARNING` marker that pushes the model to report the failure
rather than paper over it. For `climate.set_temperature` the check reads the `temperature`
attribute, not the entity state, because the state stays `heat` either way.

## Backlog processor

[`src/storage/backlog-processor.ts`](../ha-claw/src/storage/backlog-processor.ts). **Event
driven** since v0.6.2 — a status change schedules a debounced run, so an idle system spends
no tokens and generates no polling traffic.

```text
proposed ──▶ approved ──▶ solution_proposed ──▶ solution_approved ──▶ done
                │                                       │
             rejected                               (on failure,
             deferred                            back to solution_approved)
```

The agent generates a concrete solution for approved tasks, the user reviews it, and only then
does the agent execute it. One startup scan catches tasks approved while the add-on was down.
Rapid status changes are coalesced through a 2-second debounce.

## Proactive analysis vs system health

Two deliberately separate paths, because the two kinds of finding have different lifecycles.

### Proactive analysis → tasks

[`src/core/proactive-analysis.ts`](../ha-claw/src/core/proactive-analysis.ts) produces
**improvement proposals** — things that can be built once and are then done. Seven modules:

| Module | Looks for |
| --- | --- |
| Energy | Lights on in daylight, heating in summer, climate running with a window open, thermostats above 23 °C |
| Solar | Exporting to the grid, PV without a battery sensor, battery full while still exporting |
| Security | No presence detection, windows or doors open while away, locks unlocked at night, no alarm panel, no smoke detectors, no leak sensors |
| Covers | No storm protection with a wind sensor present, no dusk/dawn automation, no summer shading, everything closed in daylight |
| Climate | Humidity above 65 % (mould risk), more than 5 °C spread between rooms |
| Naming | Entities without a friendly name, inconsistent light naming, labels unused |
| Automations | Disabled automations, automations that never fired, motion sensors without a light automation, lights on at 3 a.m., standby power waste, no notification automation, no vacation mode |

At most **three new tasks per run**, and that cap is applied *after* deduplication so known
findings cannot starve new ones.

Deduplication keys on a stable `sourceKey`, not the title. Every finding title embeds a live
count ("59 devices unreachable", an hour later "47 devices unreachable"), so comparing titles
treated each fluctuation as a new finding and created a task per run. The key collapses digit
runs. A known finding refreshes its existing task while it is still `proposed`; approved,
rejected and deferred tasks are left alone.

### System health → live checks

[`src/core/system-health.ts`](../ha-claw/src/core/system-health.ts) evaluates **standing
conditions**. These never reach "done" — in many installations a handful of devices are
permanently unreachable — so they are computed on demand and never written to the backlog.

| Check | Measures | Warn | Critical |
| --- | --- | --- | --- |
| `unavailable` | Devices with entities in `unavailable` | ≥ 3 devices | ≥ 15 devices |
| `stale_sensors` | Sensors unchanged for more than 48 h | ≥ 5 devices | ≥ 25 devices |
| `low_battery` | Battery level below 20 % | ≥ 1 device | ≥ 8 devices |
| `backup` | Age of the newest backup containing Home Assistant | ≥ 7 days, or local-only storage | ≥ 14 days, or no backup at all |
| `storage` | Free space on the HA data partition | Flash < 128 GB: under 5 GB free. SSD: under 10 % free. Drive lifetime ≥ 90 % | Flash: under 3 GB. SSD: under 5 %. Lifetime ≥ 95 % |

Counts are **devices**, not entities. A Zigbee window sensor exposing battery, voltage,
firmware and an identify button is one row, not twelve.

Backup detection ([`backup-health.ts`](../ha-claw/src/core/backup-health.ts)) accepts several
offsite paths and requires only one: the official Backup integration's agents (Home Assistant
Cloud, Google Drive, OneDrive, Synology, WebDAV, NAS mounts), the Supervisor's own list, the
*Home Assistant Google Drive Backup* add-on, or *Samba Backup*. Unused alternatives are not
nagged about. Local-only storage stays a warning even when fresh, because an SD card does not
survive the hardware it lives in.

`findHealthRegressions()` compares against `store/system-health.json` and pushes to Telegram
only when a check's severity escalated or its count at least doubled since the last message.
A permanently broken installation therefore does not generate hourly notifications, while a
genuine new outage still gets through. Recovery is recorded silently.

## Self-improvement

[`src/storage/learning.ts`](../ha-claw/src/storage/learning.ts), four subsystems, all injected
into the system prompt per request:

| Subsystem | Behaviour |
| --- | --- |
| **Corrections** | User corrections are stored and re-injected when relevant. Capped at 100. |
| **Prompt patches** | Explicit rules that permanently modify agent behaviour. |
| **Usage patterns** | Recurring actions, so habits can be detected and offered as automations. |
| **Error tracking** | Past tool failures, so the model retries differently instead of identically. |

## Storage

Plain JSON and JSONL under `<dataPath>/store/`, included in Home Assistant backups
automatically. The full path table is in
[configuration.md § Data paths](configuration.md#data-paths).

`json-store.ts` writes atomically through a temp file and rename. Two modules
(`learning.ts`, `scheduler.ts`) still write directly, and all monolithic JSON files are
read-modify-write without a lock — concurrent Web and Telegram requests can overwrite each
other. Serialising writes is a [roadmap item](roadmap.md#v100--trust-and-hardening).

## Data flow

```text
User message (Web UI or Telegram)
    │
    ▼
Agentic loop
    │
    ├─ System prompt
    │    main.md + {{TOOL_LIST}} + {{ENTITY_CACHE}}
    │    + personality + memory cards + corrections + patches + patterns + errors
    │
    ├─ LLM call (OpenRouter) ──▶ tool call
    │                              │
    │                              ▼
    │                        Tool registry
    │                              │
    │                    ┌─────────┼─────────┐
    │                    │         │         │
    │              HA tools   Builtins   Best practices
    │                    │         │         │
    │                    ▼         ▼         ▼
    │            Supervisor API  Storage  Reference files
    │                    │         │
    │                    └────┬────┘
    │                         │
    │                  Tool result  ──▶ (dangerous? → confirmation gate)
    │                         │
    ▼                         ▼
LLM call with results ──▶ final response
    │
    ▼
User (Web UI or Telegram)
```
