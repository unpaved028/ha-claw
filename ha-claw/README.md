# HA-Claw

Local AI-powered Smart Home Assistant for Home Assistant with Telegram & Web UI.

## Features

- **AI Agent with Tool Calling** — Agentic loop with up to 10 iterations, calling HA services, querying entities, and managing data
- **Web UI (Ingress)** — Embedded dashboard accessible via HA sidebar with chat, settings, backlog, logs, and tool management
- **Telegram Bot** — Full chat interface with inline-keyboard safety gate for dangerous actions
- **Web Safety Gate** — Confirmation modal for dangerous actions (locks, alarms, automations) in the Web UI
- **Home Assistant Integration** — Entity discovery, service calls with verification, Floor → Area → Entity spatial hierarchy, group resolution, automation inspection
- **Sensor Awareness** — Window, door, motion, smoke, and moisture sensors displayed per room with type-icons (🪟🚪🏃🔥💧) and entity IDs for precise identification
- **HA Best Practices** — Built-in knowledge base for automations, templates, helpers, device control, and safe refactoring
- **Backlog Automation** — AI proposes, generates, and executes improvement tasks through an approval workflow
- **Tool Complexity Levels** — Map different LLM models to tool complexity (1-3) for cost optimization
- **Self-Improvement** — Learns from corrections, tracks usage patterns, records errors for smarter retries
- **Proactive Analysis** — Scans your home for energy waste, security gaps, maintenance issues, and automation opportunities
- **Conversational Onboarding** — Natural LLM-powered setup instead of rigid forms, with feature introduction and weekly analysis suggestion
- **Scheduler** — Recurring jobs (`every 5m`, `daily 07:00`, `weekdays 08:00`, `weekly mon 08:00`) executed through the agentic loop
- **One-Shot Timers & Reminders** — "Remind me in 30min to take out the trash" or "Turn off the basement light in 10min"
- **Proactive Notifications** — Scheduler results sent via Telegram automatically (reminders, analysis reports, etc.)
- **Daily Greeting** — Context-aware greeting on first interaction of the day
- **Memory System** — Long-term memory cards with hybrid keyword/relevance retrieval
- **Speech-to-Text** — Browser-based voice input in Web UI (German)
- **Multi-LLM Support** — OpenRouter integration with model selection per complexity level

## Supported Models

| Model                                  | Strength                    | Recommended Level |
| -------------------------------------- | --------------------------- | ----------------- |
| `anthropic/claude-opus-4.6`            | Top-tier reasoning          | Level 3 (complex) |
| `anthropic/claude-sonnet-4.6`          | Balanced, very capable      | Level 2-3         |
| `anthropic/claude-haiku-4.5`           | Fast & affordable           | Level 1 (simple)  |
| `google/gemini-3.1-pro-preview`        | Powerful, top-tier          | Level 2-3         |
| `google/gemini-3-flash-preview`        | Fast, good value            | Level 1-2         |
| `google/gemini-3.1-flash-lite-preview` | Ultra-fast, very affordable | Level 1           |
| `openai/gpt-5.4`                       | Powerful                    | Level 2-3         |
| `openai/gpt-5.4-mini`                  | Affordable                  | Level 1           |
| `deepseek/deepseek-chat`               | Open-source alternative     | Level 1           |

Meta-models `openrouter/free` and `openrouter/auto` are also available.

## Installation

1. Add the repository to Home Assistant Add-on Store
2. Install the **HA-Claw** add-on
3. Set your `openrouter_api_key` in the add-on configuration
4. (Optional) Configure Telegram bot token and allowed user IDs
5. Start the add-on and open the Web UI from the sidebar

## Configuration

| Option                      | Required | Description                                                      |
| --------------------------- | -------- | ---------------------------------------------------------------- |
| `openrouter_api_key`        | Yes      | Your OpenRouter API key ([openrouter.ai](https://openrouter.ai)) |
| `openrouter_default_model`  | No       | Default LLM model (default: `anthropic/claude-haiku-4.5`)        |
| `telegram_bot_token`        | No       | Telegram Bot Token (from @BotFather)                             |
| `telegram_allowed_user_ids` | No\*     | Comma-separated Telegram User IDs (\*required if bot is active)  |
| `log_level`                 | No       | `debug`, `info`, `warn`, `error` (default: `info`)               |

## Security

- **Whitelist-Only**: Only configured Telegram User IDs can interact with the bot
- **Safety Gate**: Dangerous actions require explicit confirmation via Telegram inline buttons
- **Secret Redaction**: API keys and tokens are masked in logs
- **No Open Ports**: Web UI runs exclusively through HA Ingress (no external access)
- **Cloud LLM**: Chat messages are sent to the configured LLM provider. All actions (device control, storage) execute locally on your Home Assistant.

## Architecture

See [Architecture.md](Architecture.md) for the full system architecture and component overview.

## Supported Architectures

- `aarch64` (HA Green, Raspberry Pi 4)
- `amd64`

## License

See repository for license details.
