# Configuration

Complete reference for every setting HA-Claw reads. For a guided walkthrough aimed at end
users, see [`ha-claw/DOCS.md`](../ha-claw/DOCS.md).

- [Add-on options](#add-on-options)
- [Where configuration comes from](#where-configuration-comes-from)
- [Environment variables](#environment-variables)
- [Runtime settings in the Web UI](#runtime-settings-in-the-web-ui)
- [Model tiers](#model-tiers)
- [Available models](#available-models)
- [Data paths](#data-paths)
- [Option translations](#option-translations)

## Add-on options

Defined in [`ha-claw/config.yaml`](../ha-claw/config.yaml), validated by the Supervisor
against the `schema` block, and read by
[`src/core/config.ts`](../ha-claw/src/core/config.ts).

| Option | Schema | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `openrouter_api_key` | `str` | **yes** | `''` | API key from [openrouter.ai](https://openrouter.ai). Startup fails with a clear error if empty. |
| `openrouter_default_model` | `list(...)` | no | `anthropic/claude-haiku-4.5` | Model used when no tier override applies. |
| `openai_api_key` | `str?` | no | `''` | Separate OpenAI key. **Only** used for Whisper transcription of Telegram voice messages — it does not route through OpenRouter. |
| `telegram_bot_token` | `str?` | no | `''` | Token from [@BotFather](https://t.me/BotFather). The bot only starts when this is non-empty. |
| `telegram_allowed_user_ids` | `str?` | conditional | `''` | Comma-separated numeric user IDs. **Required** once a bot token is set; startup fails otherwise. |
| `log_level` | `list(debug\|info\|warn\|error)` | no | `info` | Pino log level. `debug` includes full tool arguments and results. |

`telegram_allowed_user_ids` accepts a comma-separated string (`"123,456"`), a YAML list, or
a single number; all three are normalised to a numeric array.

### Add-on manifest facts

| Key | Value | Consequence |
| --- | --- | --- |
| `ingress` | `true` | The Web UI is only reachable through Home Assistant, which handles authentication. No port is published. |
| `ingress_port` | `3100` | Non-default; declared explicitly in `config.yaml`. |
| `homeassistant_api` | `true` | Access to the Core REST API via the Supervisor proxy. |
| `hassio_api` | `true` | Access to Supervisor endpoints. |
| `hassio_role` | `backup` | Needed for `GET /backups/info`, which drives the backup health check. |
| `map` | `share:rw` | Read/write access to `/share`. |
| `arch` | `aarch64`, `amd64` | No `image:` key, so the Supervisor builds the Dockerfile locally on install. |

## Where configuration comes from

[`src/core/config.ts`](../ha-claw/src/core/config.ts) resolves configuration in this order:

1. **`/data/options.json`** — written by the Supervisor. Its presence is what makes
   `isAddon` true.
2. **`ha-claw/dev-options.json`** — same shape, for local development. Gitignored; copy
   [`dev-options.json.example`](../ha-claw/dev-options.json.example) to start.
3. **Environment variables** — the fallback when neither file exists, used in CI.

`isAddon` decides more than the config source:

| | Add-on mode | Standalone mode |
| --- | --- | --- |
| Trigger | `/data/options.json` exists | it does not |
| `dataPath` | `/data` | `./data` (relative to the working directory) |
| `haApiUrl` | `http://supervisor/core/api` | `HA_API_URL`, empty by default |
| Auth | `SUPERVISOR_TOKEN` | long-lived access token via `HA_API_URL` setup |
| Web server binds to | `0.0.0.0` | `127.0.0.1` |
| Backup health check | runs | reports `n/a`, severity `ok` |

Without a working Home Assistant connection the Web UI, storage, scheduler and LLM calls
still work — only the `ha_*` tools fail.

## Environment variables

| Variable | When it is read | Default |
| --- | --- | --- |
| `SUPERVISOR_TOKEN` | always; injected by the Supervisor | `null` |
| `INGRESS_PORT` | always | `3100` |
| `HA_API_URL` | standalone mode only | `''` |
| `OPENROUTER_API_KEY` | fallback only | `''` |
| `OPENROUTER_DEFAULT_MODEL` | fallback only | `DEFAULT_MODEL` from `src/core/models.ts` |
| `OPENAI_API_KEY` | fallback only | `''` |
| `TELEGRAM_BOT_TOKEN` | fallback only | `''` |
| `TELEGRAM_ALLOWED_USER_IDS` | fallback only | `''` |
| `LOG_LEVEL` | fallback only | `info` |

"Fallback only" means the variable is ignored when `/data/options.json` or
`dev-options.json` exists.

> Historic note: `HA_CLAW_DATA` was read by three modules until v0.9.2 and caused data to
> land in two separate trees in development. It no longer exists — everything resolves
> through `appConfig.dataPath`.

## Runtime settings in the Web UI

These live in `store/profile.json` rather than in `config.yaml`, because they change often
and a `config.yaml` edit restarts the add-on. Reach them through **Settings** in the sidebar
dashboard.

| Section | What it controls |
| --- | --- |
| **Profile** | Bot name, your name, and the personality dimensions (directness, formality, humour, verbosity) that get injected into the system prompt. |
| **Model Forge** | The default model plus one model per complexity tier. |
| **Tool Vault** | Enable/disable individual tools. Persisted to `store/disabled-tools.json`, so it survives restarts. A disabled tool is not offered to the model at all. |

Changes take effect on the next message; no restart needed.

## Model tiers

Every tool carries a complexity level of 1, 2 or 3 (see [tools.md](tools.md)). You can map a
different model to each tier — cheap model for state queries, expensive model for writing
automation YAML.

Routing works by **escalation**, not by prediction, because which tools a request needs is
only known after the model has picked them:

1. The first LLM call of a loop uses the **tier 1** model.
2. Once a tier 2 or tier 3 tool has actually executed, the remaining iterations of that loop
   use that tier's model to reason about the result.
3. A model set explicitly as `modelOverride` on the agent always wins.
4. An unconfigured tier falls back to `openrouter_default_model`.

Only three tools are tier 3 (`ha_save_automation_config`, `ha_save_script_config`) or
tier 2 (`ha_call_service_dangerous`, `analyze_home`); everything else is tier 1. In practice
most conversations never leave the cheap model.

## Available models

The canonical list is [`src/core/models.ts`](../ha-claw/src/core/models.ts). It is duplicated
into the `config.yaml` schema because YAML cannot import from TypeScript — a CI job compares
the two and fails on divergence.

| Model | Strength | Suggested tier |
| --- | --- | --- |
| `anthropic/claude-haiku-4.5` | Fast, cheap, reliable tool calling | 1 (default) |
| `anthropic/claude-sonnet-5` | Everyday automation reasoning | 2–3 |
| `anthropic/claude-opus-5` | Heavy reasoning | 3 |
| `google/gemini-3.7-flash` | Strong value, good at agentic loops | 1–2 |
| `google/gemini-3.5-flash-lite` | Cheapest Google option | 1 |
| `openai/gpt-5.6-luna` | Cheap OpenAI option | 1 |
| `openai/gpt-5.6-sol` | OpenAI coding / agentic | 2–3 |
| `deepseek/deepseek-v4-flash` | Very cheap, large context | 1 |
| `x-ai/grok-4.6` | Strong reasoning | 2–3 |
| `openrouter/auto` | OpenRouter picks a model per request | — |
| `openrouter/free` | Routes to free models; quality and tool support vary | — |

Weaker models sometimes leak raw tool-call syntax into their prose. A response sanitiser
strips the known variants, but if the agent behaves erratically, the model is the first
thing to change.

## Data paths

Everything is JSON or JSONL under `<dataPath>/store/`. In the add-on that is
`/data/store/`, which the Supervisor includes in Home Assistant backups automatically.

| Path | Contents | Written by |
| --- | --- | --- |
| `store/profile.json` | Bot/user names, personality, model overrides, Telegram chat ID | `core/profile.ts` |
| `store/notes/` | User notes | `storage/json-store.ts` |
| `store/conversations/` | Chat history — Web UI and Telegram share the `web` record | `storage/conversation.ts` |
| `store/memory/`, `store/memory-cards/` | Long-term memory cards with version history | `storage/memory-cards.ts` |
| `store/backlog/` | Improvement tasks, one file per task | `storage/backlog.ts` |
| `store/learning/` | Corrections, prompt patches, usage patterns, error history | `storage/learning.ts` |
| `store/scheduler.json` | Recurring jobs and one-shot timers | `storage/scheduler.ts` |
| `store/usage/` | Cumulative token counts and cost estimate | `storage/usage-tracker.ts` |
| `store/actions.jsonl` | Append-only action log with rollback payloads, pruned after 7 days | `storage/action-log.ts` |
| `store/disabled-tools.json` | Tools switched off in the Tool Vault | `tools/registry.ts` |
| `store/system-health.json` | Last-seen count/severity per health check (UI trend) and last-notified values (Telegram regressions) | `core/system-health.ts` |
| `store/system-health-report.json` | Last full health report served to the Status screen | `core/system-health.ts` |

Monolithic JSON files are written through [`atomic-write.ts`](../ha-claw/src/storage/atomic-write.ts)
(per-path lock, unique temp name, rename). `HA_CLAW_DATA_PATH` overrides `dataPath` in
standalone mode so the test suite can use a temp directory.

## Option translations

Option labels and descriptions in the Home Assistant configuration UI come from
[`ha-claw/translations/`](../ha-claw/translations/):

- [`en.yaml`](../ha-claw/translations/en.yaml)
- [`de.yaml`](../ha-claw/translations/de.yaml)

Each key under `configuration:` must match a key in the `schema:` block of `config.yaml`.
Adding an option without adding it to both translation files leaves users staring at a raw
snake_case key.
