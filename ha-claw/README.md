# HA-Claw

**An add-on that maintains and improves your Home Assistant installation, rather than one
that only operates your lights.**

It watches the things nobody tracks: devices that went offline, sensors that stopped
reporting, batteries running down, a backup that has not run in two weeks. It looks for
improvements — energy waste, security gaps, missing automations — and proposes them for
your approval instead of acting on its own.

Chat, in the sidebar or Telegram, is how you ask follow-up questions. It knows your floors,
areas and entities, can call services and check that they took effect, and asks before it
touches anything that could lock you out or set off an alarm.

## Highlights

- **System health at a glance.** Unreachable devices, stale sensors, low batteries, backup age
  and free disk space — with a notification only when something gets _worse_.
- **Improvement proposals.** Seven analysis modules look for energy waste, security gaps,
  missing cover automations and naming drift.
- **Asks before it does damage.** Locks, alarms, scripts, buttons, garage doors and automation
  edits require your confirmation every time.
- **Multi-step reasoning.** Up to ten search-act-verify steps per request, so it can answer
  "the living room feels cold, is a window open somewhere?" and not just "turn on the light".
- **Acts, then checks.** Every service call compares the entity state before and after. If the
  device did not react, it says so.
- **One conversation, two surfaces.** The sidebar dashboard and the Telegram bot share the
  same chat history.
- **Automations and scripts.** Reads them, explains them in plain language, and — with your
  approval — writes them, guided by a built-in Home Assistant best-practice knowledge base.
- **Reminders and schedules.** "Remind me in 30 minutes to take the bins out" or a weekly
  home analysis every Monday at 08:00.
- **Learns.** Corrections, recurring habits and past failures are fed back into its behaviour.

## Before you install

- **It is not local inference.** Your messages, the entity list and the tool results are sent
  to an LLM provider through [OpenRouter](https://openrouter.ai). Actions run locally on your
  Home Assistant; the reasoning does not.
- **It costs money per message.** You bring your own API key. With the default model a normal
  request is a fraction of a cent. Usage and an estimated total are shown under Status.
- **It can control your home.** The confirmation gate covers the dangerous domains, but this
  is a risk worth accepting deliberately rather than by default.

## Setup

1. Set `openrouter_api_key` in the Configuration tab. Get one at
   [openrouter.ai](https://openrouter.ai).
2. Optionally add `telegram_bot_token` and `telegram_allowed_user_ids`.
3. Start the add-on and open **HA-Claw** from the sidebar.
4. Answer a few questions in the setup conversation — what to call the bot, what to call you,
   and how it should talk to you.

Full instructions, day-to-day usage, system health explanations and troubleshooting are in the
**Documentation** tab — [DOCS.md](DOCS.md), or [auf Deutsch](DOCS.de.md).

## Configuration

| Option                      | Required    | Description                                                      |
| --------------------------- | ----------- | ---------------------------------------------------------------- |
| `openrouter_api_key`        | yes         | API key from [openrouter.ai](https://openrouter.ai)              |
| `openrouter_default_model`  | no          | Default `anthropic/claude-haiku-4.5`                             |
| `openai_api_key`            | no          | Separate OpenAI key, only for Telegram voice transcription       |
| `telegram_bot_token`        | no          | Token from [@BotFather](https://t.me/BotFather)                  |
| `telegram_allowed_user_ids` | conditional | Comma-separated user IDs; required with a bot token              |
| `log_level`                 | no          | `debug`, `info`, `warn`, `error`                                 |
| `language`                  | no          | `auto` (HA locale), `en`, or `de`                                |
| `notify_entity`             | no          | Full `notify.*` id; HA Notify column in Settings → Notifications |

## Security

- **Ingress only.** No port is published. The Web UI is reachable through Home Assistant,
  which authenticates you first.
- **Whitelist only.** The Telegram bot ignores anyone not in `telegram_allowed_user_ids`, and
  a confirmation can only be answered by the person who triggered it.
- **Domain allowlist.** Only everyday domains act without asking. Locks, alarms, scripts and
  buttons always require confirmation — as do covers with `device_class` `garage`, `gate` or
  `door`, and scenes that include a lock or alarm.
- **Secret redaction.** API keys and tokens are masked in logs.
- **Full audit trail.** Every service call is logged with a one-click rollback.

Details and known limitations: [docs/security.md](../docs/security.md).

## Supported architectures

`aarch64` (HA Green, Raspberry Pi 4) and `amd64`. The image is built on your machine at
install time.

## Links

[Repository](https://github.com/unpaved028/ha-claw) ·
[Documentation](../docs/README.md) ·
[Roadmap](../docs/roadmap.md) ·
[Changelog](CHANGELOG.md) ·
[Report an issue](https://github.com/unpaved028/ha-claw/issues)

MIT licensed. A community project, not affiliated with Home Assistant or Nabu Casa.
