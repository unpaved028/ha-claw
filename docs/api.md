# HTTP API

The Fastify server in [`src/web/server.ts`](../ha-claw/src/web/server.ts) serves both the
dashboard and its API. Everything below is reachable at the Ingress base path, which Home
Assistant supplies in the `X-Ingress-Path` request header.

- [Access and authentication](#access-and-authentication)
- [Health and UI](#health-and-ui)
- [Chat](#chat)
- [Server-sent events](#server-sent-events)
- [Confirmation gate](#confirmation-gate)
- [Settings, profile and tools](#settings-profile-and-tools)
- [Notifications](#notifications)
- [Scheduler](#scheduler)
- [Logs and actions](#logs-and-actions)
- [Tasks](#tasks)
- [System health](#system-health)
- [Maintenance](#maintenance)
- [Export](#export)
- [Store](#store)

## Access and authentication

There is **no authentication in the add-on itself**. Home Assistant Ingress authenticates the
user and proxies the request, so by the time it arrives the caller is already a logged-in
Home Assistant user.

The server binds to `0.0.0.0` in add-on mode and `127.0.0.1` in standalone mode. Port 3100
is not published in `config.yaml`, so it is only reachable from inside the Docker network.

In add-on mode the server also rejects the TCP peer unless it is `172.30.32.2` (Ingress),
loopback (the image `HEALTHCHECK`), or `172.30.32.0/23` (Supervisor watchdog). Everyone
else gets `403 { "error": "forbidden" }`. The check uses the socket address, not forwarded
headers. Standalone mode binds `127.0.0.1` and does not apply the allowlist.

## Health and UI

### `GET /health`

Liveness probe. The Supervisor `watchdog` and the image `HEALTHCHECK` both call this.

```json
{
  "status": "ok",
  "version": "1.4.0",
  "uptime": 87231,
  "startedAt": "2026-08-29T21:14:02.104Z",
  "mode": "addon",
  "memory": { "heapMB": 61 }
}
```

`mode` is `"addon"` or `"standalone"`.

### `GET /`

The dashboard, as a single inlined HTML document. Reads `x-ingress-path` to rewrite internal
links. See [architecture.md § Web UI build](architecture.md#web-ui-build) for why everything
is inlined.

## Chat

### `POST /api/chat`

Runs the agentic loop synchronously and returns the finished answer.

```jsonc
// request
{ "message": "is a window still open upstairs?" }
```

```jsonc
// 200
{
  "response": "The bathroom window on the upper floor is open.",
  "iterations": 3,
  "toolCalls": [{ "name": "ha_search_entities", "result": "..." }]
}
```

`400` when `message` is missing. If onboarding has not been completed, the request is routed
to the onboarding agent with its restricted tool set instead of the normal agent.

Dangerous tool calls block on the [confirmation gate](#confirmation-gate), which can hold the
request open for up to 60 seconds.

### `GET /api/chat/history`

The shared conversation (Web UI and Telegram write the same record). Query `offset` and
`limit` are optional. Omitting `offset` returns the **newest** page (default `limit` 30).
`limit` is clamped to 1–100. `hasMore` is true when older messages exist before this slice.

```jsonc
{
  "messages": [{ "role": "user", "content": "..." }],
  "total": 80,
  "offset": 50,
  "limit": 30,
  "hasMore": true
}
```

## Server-sent events

### `GET /api/chat/stream?message=...`

The path the dashboard actually uses. Same loop as `POST /api/chat`, but progress is streamed
instead of buffered.

```text
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Each event is `data: <json>\n\n`:

| `type` | Payload | Meaning |
| --- | --- | --- |
| `thinking` | `message`, `iteration` | A new loop iteration started. |
| `tool_call` | `toolName` | The model asked for a tool. |
| `tool_result` | `toolName` | The tool returned. |
| `text_chunk` | `chunk` | Token from the model's prose. Append in order. |
| `done` | `response`, `toolCalls` | Final answer; the stream ends. |
| `error` | `message` | The loop failed; the stream ends. |

`400` when `message` is missing. **`503`** with `{ "error": "..." }` when the OpenRouter
circuit breaker is open — the client should show the message rather than retrying
immediately.

Two behaviours differ from `POST /api/chat` and are worth knowing:

- The streaming endpoint does **not** check whether onboarding is complete. It always uses
  the normal agent. The dashboard calls `GET /api/onboarding` first and falls back to the
  synchronous endpoint when setup is still pending.
- Token usage is reported through `stream_options.include_usage`, so streamed responses do
  count towards the cost estimate. Before v0.9.2 they did not, which made the totals in
  `/status` systematically too low.

### `GET /api/status/circuit-breaker`

```json
{ "isOpen": false, "failures": 0, "remainingMs": 0 }
```

After repeated provider failures the breaker opens and LLM calls are refused for a cool-down
window instead of hammering the API. The scheduler also checks it before running jobs.

## Confirmation gate

Dangerous tool calls suspend the loop until the user answers. Pending confirmations are held
in a queue, so two simultaneous dangerous actions produce two dialogs rather than one
overwriting the other. Anything unanswered after **60 seconds** is auto-denied.

### `GET /api/confirm/pending`

```jsonc
{ "pending": false, "count": 0 }
// or
{ "pending": true, "count": 2, "id": "c1a3...", "toolName": "ha_call_service_dangerous", "args": { }, "preview": null }
```

Returns the oldest entry plus the queue length. The dashboard polls this. For
`ha_save_automation_config` / `ha_save_script_config`, `preview` is a
`{ kind: "config_write", title, yamlDiff, blastRadius, currentMissing }` object so the
dialog can show a YAML diff instead of the raw config JSON.

### `POST /api/confirm/:id`

```jsonc
{ "approved": true }
```

`{ "ok": true }`, or `{ "error": "No matching pending confirmation" }` if the ID already
timed out or was answered.

### `POST /api/cache/refresh`

Rebuilds the entity cache immediately instead of waiting for the 30-minute cycle. Returns
`{ "ok": true, "chars": 14203 }`. Use it after adding devices or renaming areas.

## Settings, profile and tools

### `GET /api/onboarding`

`{ "needed": true }` while setup is pending.

### `GET /api/settings`

One snapshot for the whole Settings page: `agent`, `profile`, `model`, `mode`, `tools`,
`uptime`, `memory`, `version`, `haAvailable`, `telegramConfigured`, `availableModels`,
`language` (resolved `en` or `de`), `languageOption` (`auto`, `en` or `de`),
`notifyEntity` (the configured `notify.*` id, or `null`).

### `PUT /api/profile`

Accepts a partial `Profile` and returns the merged result. This is how the Web UI stores bot
name, personality dimensions and per-tier model overrides.

### `PUT /api/tools/toggle`

```jsonc
{ "name": "ha_call_service_dangerous", "enabled": false }
```

Returns `{ name, enabled, tools }`, or `{ error }` for an unknown tool. Persisted to
`store/disabled-tools.json`.

### `GET /api/tools/details`

The full `ToolDefinition[]` exactly as sent to the model — names, descriptions and JSON
Schema parameters. Useful when debugging why the agent picked the wrong tool.

## Notifications

### `GET /api/notify-matrix`

The Settings notification matrix. Registered **before** `/api/:c`.

```jsonc
{
  "matrix": {
    "digest": { "telegram": true, "chat": false, "ha_notify": false, "persistent": false }
  },
  "notifyEntity": "notify.mobile_app_pixel",
  "telegramConfigured": true,
  "events": ["digest", "new_task"],
  "channels": ["telegram", "chat", "ha_notify", "persistent"]
}
```

`events` is the full list of row ids (including `health.<check>`). Missing cells on disk
are filled from defaults: Telegram on for digest, tasks, other scheduler jobs and the
bundled health regression; everything else off.

### `PUT /api/notify-matrix`

Body is either the matrix object or `{ "matrix": { … } }`. Unknown event ids are ignored;
unknown channels on a known event fall back to that event's default. Returns
`{ "matrix": { … } }`. `400 { "error": "invalid matrix" }` when the body is not an object.

Persisted to `store/notify-matrix.json`.

## Scheduler

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/scheduler` | `{ count, jobs }` |
| `PUT` | `/api/scheduler/toggle` | Body `{ id, enabled }` → the updated job, or `{ error: "Job not found" }` |
| `DELETE` | `/api/scheduler/:id` | `{ deleted: true }` or `{ error }` |

Accepted schedule strings are listed in [tools.md § Scheduler](tools.md#scheduler).

## Logs and actions

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/logs` | `{ entries, uptime, memory }` from the in-memory ring buffer |
| `DELETE` | `/api/logs` | `{ cleared: true }` |
| `GET` | `/api/actions` | `{ count, actions }` — the 100 most recent entries |
| `DELETE` | `/api/actions` | `{ cleared: true }` |
| `POST` | `/api/actions/rollback` | Body `{ id }`. Replays the recorded inverse service call, or restores a config snapshot when `rollback.domain` is `config` and `rollback.service` is `restore`. Lookup scans the whole `actions.jsonl` file, not only the last page of `GET /api/actions`. `400` for a malformed body, `404` when the action is missing or has no rollback payload. |

The log buffer is in memory and resets on restart. `store/actions.jsonl` is persistent and
pruned to a rolling 7-day window.

## Tasks

The backlog: improvement proposals with an approval workflow.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/backlog` | `{ count, tasks }` |
| `POST` | `/api/backlog` | Create. Body: `{ title, asIs, toBe, impact, priority?, category?, tags?, proposedBy?, sourceKey? }` |
| `PUT` | `/api/backlog/:id` | Partial update, `404` if unknown |
| `DELETE` | `/api/backlog/:id` | `{ deleted: true }` or `404` |
| `POST` | `/api/backlog/cleanup` | Removes duplicate analysis tasks, leftovers from checks that moved to system health, and leftover proposed snapshot/hardware-absence analysis tasks |
| `POST` | `/api/backlog/:id/preview` | Dry-run of the proposed solution. Stores `previewResult`. `404` if unknown, `400` if there is no solution. |

The status flow is `proposed → approved → solution_proposed → solution_approved → done`, with
`rejected` and `deferred` as terminal user decisions. Generation or execution that fails three
times marks the task `failed`; a human retry back to `approved` or `solution_approved` resets
`attemptCount`. Status changes trigger the event-driven backlog processor; an idle system
spends no tokens.

## System health

### `GET /api/system-health`

Returns the last completed report without waiting on Home Assistant. `health` is `null`
until the first check finishes (shortly after start, or after
`POST /api/system-health/refresh`). If no report exists yet, GET starts a background check.
`checking` is `true` while a refresh is in flight.

```jsonc
{
  "checking": false,
  "health": {
    "checkedAt": "2026-08-29T21:40:00.000Z",
    "severity": "warn",
    "totalEntities": 812,
    "haBase": "",
    "checks": [
      {
        "key": "low_battery",
        "label": "Batterie unter 20 %",
        "about": "Geräte, deren Batterie unter 20 % gemeldet wird.",
        "href": "/config/entities",
        "severity": "warn",
        "count": 3,
        "detail": "...",
        "entities": ["sensor.…"],
        "items": [{ "id": "dev:…", "label": "Fenster EG", "entities": ["sensor.…"], "href": "/config/devices/device/…" }],
        "hint": "...",
        "previous": { "severity": "ok", "count": 0, "checkedAt": "2026-08-28T21:40:00.000Z" },
        "worse": true,
        "note": "12 UI-Automationen/Skripte vollständig, 3 nur YAML (kein voller Scan)."
      }
    ]
  }
}
```

`severity` is `ok`, `warn` or `critical`, and the top-level value is the worst of the
individual checks. Cards are sorted critical → warn → ok. `count` counts **devices**, not
entities — a Zigbee window sensor that exposes battery, voltage, firmware and an identify
button is one row, not four. `haBase` is empty in the add-on (relative paths, open with
`target="_top"`) and the Home Assistant origin in standalone. `about` is always present.
`href` on a check or item is a Home Assistant frontend path. `previous` / `worse` appear
when the last different reading is known. `note` is a footnote (YAML coverage on
`broken_refs`). Check `key` values are listed in
[architecture.md § System health](architecture.md#proactive-analysis-vs-system-health).

### `POST /api/system-health/refresh`

Runs every check against live Home Assistant state, stores the report, and returns the same
shape as GET. Concurrent refreshes share one in-flight run. Returns `503` when Home Assistant
is unreachable.

Checks are never written to the backlog. A full run also happens shortly after start and
every hour (Telegram regressions). Thresholds are documented in
[architecture.md § System health](architecture.md#proactive-analysis-vs-system-health).

### `POST /api/system-health/orphans/remove`

Body `{ "itemIds": ["dev:…", "stem:…"] }`. Removes those devices / entity stems from the
Home Assistant registries. Same ids as the `orphans` card. `400` when `itemIds` is missing.
Kicks off a background health refresh.

## Maintenance

Status → Pflege. These are live reports, not backlog tasks.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/coverage` | Area-aware automation gaps (`motion_light`, `cover_sun`, `leak_notify`, `climate_window`, `climate_away`) from config refs, each with `suggestedBlueprint`, `action` `{ trigger, targets, mode, sketch }`, plus `uiScanned`, `yamlOnly`, optional `note` |
| `GET` | `/api/automation-quality` | UI-automation linter: `device_id_trigger`, `motion_mode_single`, `numeric_as_template` |
| `POST` | `/api/care/task` | Body `{ source: "coverage" \| "quality", key }`. Creates a `proposed` backlog task from that gap or quality issue. `200` `{ ok, created, existed, taskId }`. `404` if the key is gone. |
| `GET` | `/api/naming` | Friendly-name proposals (up to 80) |
| `POST` | `/api/naming/apply` | Body `{ items: [{ entityId, name }] }`. Writes the entity registry. |
| `GET` | `/api/energy` | Current power sensors (W) and energy totals (kWh) |
| `GET` | `/api/review` | Combined weekly-digest object including `text` |

`503` when Home Assistant is unreachable.

## Export

### `GET /api/export`

JSON dump of conversations, memory cards, tasks and the full action log. No API keys, no
add-on options, no profile. Registered **before** `/api/:c` so Fastify does not treat
`export` as a store collection.

```jsonc
{
  "exportedAt": "2026-09-01T01:00:00.000Z",
  "conversations": [],
  "memory": [],
  "tasks": [],
  "actions": []
}
```

The dashboard offers this as **Settings → Profile → Export data** (`ha-claw-export.json`).

## Store

Generic CRUD over three collections. `:c` must be `notes`, `conversations` or `memory` —
anything else returns `400 { "error": "invalid" }`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/:c` | All records in the collection |
| `POST` | `/api/:c` | Create a record from the request body |
| `DELETE` | `/api/:c/:id` | `{ deleted: true }` or `404` |
