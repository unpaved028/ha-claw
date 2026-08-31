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
- [Safe config writes](#safe-config-writes)
- [Maintenance layer](#maintenance-layer)
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
    ├── Dockerfile               # Two-stage build, node:22-alpine pinned by digest
    ├── apparmor.txt             # Custom AppArmor profile (slug ha-claw)
    ├── DOCS.md / DOCS.de.md     # User manual, rendered by the HA add-on UI
    ├── CHANGELOG.md
    ├── icon.png · logo.png      # Add-on store assets
    ├── translations/{en,de}.yaml# Option labels for the HA config UI
    ├── scripts/
    │   ├── bundle-dashboard.cjs # Generates src/web/dashboard.ts from src/web/ui/
    │   ├── entrypoint.sh        # chown /data, drop to user node
    │   └── run-tests.mjs
    ├── agents/
    │   ├── main.md              # Main system prompt
    │   ├── onboarding.md        # Setup conversation prompt
    │   ├── cie.md               # Continuous Improvement Engine prompt
    │   ├── KI-Systemarchitekt.md
    │   └── skills/ha-best-practices/   # 7 reference files (incl. blueprints.md)
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
        │   ├── system-health.ts # Standing-condition checks (cached)
        │   ├── health-signals.ts # Broken refs, traces, failed entries
        │   ├── health-links.ts  # HA frontend paths for Ingress deep links
        │   ├── backup-health.ts # Backup age and offsite detection
        │   ├── yaml-text.ts     # JSON → YAML-ish text + unified diff
        │   ├── config-change.ts # Validate, blast radius, snapshot write
        │   ├── coverage-report.ts
        │   ├── naming-hygiene.ts
        │   ├── energy-attribution.ts
        │   ├── orphan-cleanup.ts
        │   ├── home-review.ts   # Weekly digest + seed job
        │   └── types.ts
        ├── storage/
        │   ├── atomic-write.ts  # Per-path lock + unique temp-and-rename
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
        │   ├── safety-policy.ts # Pure allowlist (table-tested)
        │   ├── validate-args.ts # JSON Schema subset before the handler
        │   ├── ha-tools.ts      # HA tools + live cover/scene lookup
        │   ├── builtins.ts      # Store, memory, backlog, scheduler, learning
        │   ├── ha-best-practices.ts
        │   └── tool-cache.ts    # Short-lived result cache
        ├── web/
        │   ├── server.ts        # Fastify routes, SSE, web safety gate
        │   ├── ingress-allow.ts # Add-on source-IP allowlist
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
auto-approve for scheduled jobs. Config writes attach a YAML diff and blast-radius list to
that callback. `AgentConfig.dryRun` makes write tools return `{ preview, wouldCall, args }`
instead of running — that is how task preview works. Each tool execution is capped at
**15 seconds**; a hang returns an error to the model instead of stalling the loop.

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
             rejected                               (on failure: retry,
             deferred                                then failed after 3)
```

The agent generates a concrete solution for approved tasks, the user reviews it, and only then
does the agent execute it. A failed generation or execution increments `attemptCount` and is
retried after 30 seconds; after `MAX_TASK_ATTEMPTS` (3) the task is marked `failed` instead of
retrying forever. The Web UI offers **Erneut versuchen**, which resets the counter. One startup
scan catches tasks approved while the add-on was down. Rapid status changes are coalesced
through a 2-second debounce.

**Preview** (`POST /api/backlog/:id/preview`) runs the proposed solution with `dryRun: true`
and stores `previewResult` on the task. Write tools do not execute.

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
permanently unreachable — so they are never written to the backlog. A full check runs
shortly after start, every hour (for Telegram regressions), and when the user clicks
Refresh. `GET /api/system-health` returns the last report so the Status screen does not
wait on Home Assistant.

| Check | Measures | Warn | Critical |
| --- | --- | --- | --- |
| `unavailable` | Devices with entities in `unavailable` for less than 30 days. Restored-only entities are on `restored` instead. | ≥ 3 devices | ≥ 15 devices |
| `orphans` | Devices whose entities have been `unavailable` for 30 days or more | ≥ 1 device | ≥ 8 devices |
| `stale_sensors` | Periodic sensors (`temperature`, `humidity`, `atmospheric_pressure`, air-quality classes) with no `last_updated` in 48 h. Binary sensors and event-driven classes are ignored — a closed window is not a fault. Allowlist: `PERIODIC_SENSOR_CLASSES` in [`system-health.ts`](../ha-claw/src/core/system-health.ts). | ≥ 5 devices | ≥ 25 devices |
| `low_battery` | Battery level below 20 % | ≥ 1 device | ≥ 8 devices |
| `broken_refs` | Automations, scripts and scenes that name an `entity_id` or `device_id` Home Assistant no longer has. YAML-only automations are scanned for `entity_id` attributes only — the config API does not serve them. The card notes how many UI configs were opened versus YAML-only. | ≥ 1 | ≥ 8 |
| `failed_automations` | Automations **and scripts** whose latest trace recorded an error, or whose own state is `unavailable` | ≥ 1 | ≥ 5 |
| `pending_updates` | `update.*` entities in state `on` | ≥ 1 | ≥ 8, or any Core / OS / Supervisor update |
| `failed_integrations` | Config entries in `setup_error`, `setup_retry`, `migration_error` or `failed_unload`. Overlaps Home Assistant Repairs; this card is the count. | ≥ 1 | ≥ 3 |
| `radio_quiet` | `*_last_seen` older than 48 h, or `*_linkquality` / `*_lqi` ≤ 20. Skips entities already `unavailable`. | ≥ 3 devices | ≥ 10 devices |
| `stopped_addons` | Add-ons with `boot: auto` that are not `started` / `startup`, plus any add-on in `error`. Skipped when the Supervisor list is unavailable (standalone). | ≥ 1 | ≥ 3 |
| `recorder` | `recorder/info`: not recording, thread down, backlog, or a pending migration. Skipped when the command is missing. | backlog ≥ 1 000, or migration in progress | not recording / thread down, or backlog ≥ 10 000 |
| `restored` | Entities with `attributes.restored === true` that are not already 30-day orphans. After a restore they can look fine and never appear as `unavailable`. | ≥ 1 device | ≥ 15 devices |
| `backup` | Age of the newest backup containing Home Assistant | ≥ 7 days, or local-only storage | ≥ 14 days, or no backup at all |
| `storage` | Free space on the HA data partition | Flash < 128 GB: under 5 GB free. SSD: under 10 % free. Drive lifetime ≥ 90 % | Flash: under 3 GB. SSD: under 5 %. Lifetime ≥ 95 % |

The Status screen sorts cards critical → warn → ok. Each check carries an `about` text, an
optional `previous` reading (last different count/severity) and `worse`, plus Home Assistant
frontend paths (`href` on the card and on items). Ingress opens those with `target="_top"`.

`broken_refs`, `failed_automations`, `failed_integrations` and the
script traces share one websocket session (`getRegistrySnapshot` in
[`ha-client.ts`](../ha-claw/src/core/ha-client.ts)): entity and device registries, config
entries, and recent automation **and script** traces. UI automation/script configs are then
fetched with a concurrency of 6. A command that the instance does not offer comes back empty
— the card shows ok, not an error. `stopped_addons` uses Supervisor `GET /addons`;
`recorder` uses the `recorder/info` websocket command.

Counts are **devices**, not entities. A Zigbee window sensor exposing battery, voltage,
firmware and an identify button is one row, not twelve.

Backup detection ([`backup-health.ts`](../ha-claw/src/core/backup-health.ts)) accepts several
offsite paths and requires only one: the official Backup integration's agents (Home Assistant
Cloud, Google Drive, OneDrive, Synology, WebDAV, NAS mounts), the Supervisor's own list, the
*Home Assistant Google Drive Backup* add-on, or *Samba Backup*. Unused alternatives are not
nagged about. Local-only storage stays a warning even when fresh, because an SD card does not
survive the hardware it lives in.

`store/system-health.json` holds last-seen values (so the UI can show "was 1") and separate
notify fields. `store/system-health-report.json` holds the last full report the UI serves.
`findHealthRegressions()` pushes to Telegram only when a check's severity
escalated or its count at least doubled since the last message. `storage` and `recorder`
skip the doubling rule — those counts shrink as the problem grows. A permanently broken
installation therefore does not generate hourly notifications, while a genuine new outage
still gets through. Recovery is recorded silently.

The `orphans` card offers one-click remove (`POST /api/system-health/orphans/remove`).
Ids are the same `dev:…` / `stem:…` keys the card already lists.

## Safe config writes

[`src/core/config-change.ts`](../ha-claw/src/core/config-change.ts) is the write path for
`ha_save_automation_config` and `ha_save_script_config`.

1. Structural validation (required trigger/action or sequence, known keys, valid `mode`).
   Invalid configs return to the model and never reach the confirmation gate.
2. YAML-ish diff of current vs proposed (`yaml-text.ts` — no extra YAML library).
3. Blast radius: other UI automations, scripts and scenes that mention the same entities.
4. After a successful POST, the previous config is stored on the action-log rollback
   payload (`domain: config`, `service: restore`). Status → Actions shows **Zurücksetzen**.

Home Assistant `check_config` is **not** used. That call checks YAML files on disk, not a
pending UI automation. A 400 from the HA REST write is treated as failure and no snapshot
is recorded.

## Maintenance layer

Status → **Pflege** is one report, not three backlog tasks.

| Surface | Module | API |
| --- | --- | --- |
| Coverage gaps (motion+lights, covers+sun, leak+notify), area-aware | `coverage-report.ts` | `GET /api/coverage` |
| Friendly-name proposals, bulk apply | `naming-hygiene.ts` | `GET /api/naming`, `POST /api/naming/apply` |
| Live power / energy sensors | `energy-attribution.ts` | `GET /api/energy` |
| Combined digest | `home-review.ts` | `GET /api/review`, tool `home_review` |

A scheduler job named **Wochenbericht** (`kind: digest`, `weekly sun 10:00`) is seeded on
startup if missing. Digest jobs send the report; they do not run the agentic loop.

When proposing a motion-light, sun-cover or leak-notify automation, `ha_best_practices`
topic `blueprints` is the first stop. Coverage rows already carry `suggestedBlueprint`.

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

[`atomic-write.ts`](../ha-claw/src/storage/atomic-write.ts) is the shared helper: one lock
per path, a unique temp file, then rename. `json-store.ts`, `learning.ts`, `scheduler.ts`,
`profile.ts`, the disabled-tools list and the health snapshot all go through it. Concurrent
`upsert` on the same record is serialised so the second writer reads the first writer's
result.

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
