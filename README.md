<div align="center">

<img src="logo.png" alt="HA-Claw" width="140">

# HA-Claw

**A conversational AI agent for Home Assistant — as an add-on, not a cloud service.**

Talk to your home in plain language through the Home Assistant sidebar or Telegram.
HA-Claw understands your floors, areas and entities, calls Home Assistant services on
your behalf, verifies that the action actually took effect, and asks before it touches
anything that could lock you out or set off an alarm.

[![CI](https://github.com/unpaved028/ha-claw/actions/workflows/ci.yml/badge.svg)](https://github.com/unpaved028/ha-claw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Add-on version](https://img.shields.io/badge/add--on-v1.0.0-0aa8d2.svg)](ha-claw/CHANGELOG.md)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5.svg?logo=home-assistant&logoColor=white)](https://www.home-assistant.io/)

[Installation](#installation) · [Documentation](docs/README.md) · [Roadmap](docs/roadmap.md) · [Deutsch](README.de.md)

</div>

---

## What it does

Most voice and chat integrations map a sentence onto a single pre-defined intent. HA-Claw
runs an **agentic loop** instead: the language model can search your entities, read an
automation's configuration, call a service, check the resulting state and then decide what
to do next — up to ten steps per request. That is the difference between "turn on the
kitchen light" and *"the living room feels cold, is a window open somewhere?"*

| | |
| --- | --- |
| **Speaks your home's language** | Floor → area → entity hierarchy, group resolution, `device_class`-aware sensor lookup. It knows which window is open, not just that a `binary_sensor` is `on`. |
| **Acts, then verifies** | Every service call captures the entity state before and after. If the device did not react, the agent says so instead of claiming success. |
| **Asks before it does damage** | Locks, alarms, scripts, buttons, garage doors and automation edits go through a confirmation gate — inline keyboard in Telegram, modal in the Web UI. |
| **Two front ends, one conversation** | The sidebar dashboard and the Telegram bot read and write the same chat history. |
| **Watches the boring things** | Unreachable devices, sensors that stopped updating, batteries below 20 %, backup age and free disk space — surfaced as live checks, not as a task list that never empties. |
| **Suggests improvements** | A periodic analysis looks for energy waste, security gaps, missing cover automations and naming inconsistencies, and proposes them as reviewable tasks. |
| **Learns** | Corrections, recurring patterns and past tool failures are fed back into the system prompt. |

Full capability breakdown: **[docs/README.md](docs/README.md)**

## Before you install

HA-Claw is a bring-your-own-key project. Three things are worth knowing up front:

- **It is not local inference.** Your messages, the entity cache and the tool results are
  sent to an LLM provider through [OpenRouter](https://openrouter.ai). *Actions* run
  locally against your Home Assistant; the *reasoning* does not. If model-side data
  processing is unacceptable to you, this add-on is the wrong tool.
- **It costs money per message.** With the default `anthropic/claude-haiku-4.5` a normal
  request is a fraction of a cent, but proactive analysis and the task processor also spend
  tokens. Cumulative usage and an estimated USD total are shown under Status.
- **It can control your home.** The safety gate covers the dangerous domains, but an LLM
  agent with service-call access is a category of risk you should accept deliberately. Read
  [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md) first.

## Installation

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Funpaved028%2Fha-claw)

1. In Home Assistant go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories** and add:

   ```text
   https://github.com/unpaved028/ha-claw
   ```

2. Install **HA-Claw** from the store listing that appears.
3. Open the **Configuration** tab and paste your OpenRouter API key into `openrouter_api_key`.
4. *(Optional)* Add `telegram_bot_token` and `telegram_allowed_user_ids` to enable the bot.
5. Start the add-on. HA-Claw appears in the sidebar and greets you with a short onboarding
   conversation.

Requires Home Assistant OS or Supervised on `aarch64` or `amd64`. The image is built on your
machine on first install, which takes a few minutes on a Raspberry Pi.

Step-by-step instructions, including how to create the Telegram bot and find your user ID:
**[ha-claw/DOCS.md](ha-claw/DOCS.md)** ([Deutsch](ha-claw/DOCS.de.md)).

## Configuration

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `openrouter_api_key` | yes | — | API key from [openrouter.ai](https://openrouter.ai) |
| `openrouter_default_model` | no | `anthropic/claude-haiku-4.5` | Model used when no per-tier override is set |
| `openai_api_key` | no | — | Separate OpenAI key, only for Telegram voice transcription (Whisper) |
| `telegram_bot_token` | no | — | Bot token from [@BotFather](https://t.me/BotFather) |
| `telegram_allowed_user_ids` | conditional | — | Comma-separated user IDs; required once a bot token is set |
| `log_level` | no | `info` | `debug`, `info`, `warn`, `error` |

Model tiers, environment variables and data paths: **[docs/configuration.md](docs/configuration.md)**

## Documentation

| Document | For |
| --- | --- |
| [ha-claw/DOCS.md](ha-claw/DOCS.md) · [DE](ha-claw/DOCS.de.md) | **Users** — setup, day-to-day usage, system health, troubleshooting |
| [docs/configuration.md](docs/configuration.md) | Every option, env var, model tier and data path |
| [docs/tools.md](docs/tools.md) | The 47 tools the agent can call |
| [docs/api.md](docs/api.md) | HTTP + SSE API served over Ingress |
| [docs/architecture.md](docs/architecture.md) | How the pieces fit together |
| [docs/security.md](docs/security.md) | Safety gate, threat model, data flow |
| [docs/development.md](docs/development.md) | Local setup, dashboard build pipeline, conventions |
| [docs/releasing.md](docs/releasing.md) | Version bump and release checklist |
| [docs/roadmap.md](docs/roadmap.md) | Where this is going and why |
| [ha-claw/CHANGELOG.md](ha-claw/CHANGELOG.md) | Version history |

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) — it
covers the local dev loop, the one file you must never edit by hand
(`src/web/dashboard.ts`, it is generated), and the checks CI runs on every push.

If you are an AI coding agent working in this repository, read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) © Rene Jung

HA-Claw is a community project. It is not affiliated with, endorsed by, or supported by the
Home Assistant project, Nabu Casa, OpenRouter, Anthropic, OpenAI, Google or Telegram.
