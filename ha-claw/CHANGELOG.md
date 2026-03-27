# Changelog

## 0.2.3

### Changed
- Miscellaneous improvements and fixes from latest development update.

## 0.2.2

### Improved
- **Butler Agent Prompt**: Stricter tool-use workflow – agent must search entities before acting, no guessing IDs
- Clearer rules for ambiguous commands (asks for clarification, e.g. which room)
- Dangerous actions now auto-approved when unambiguous (e.g. "Licht an")

### Added
- 🎙️ **Speech-to-Text** microphone button in Web UI (Browser Web Speech API, German)

## 0.2.1

### Added
- Model dropdown with 13 pre-configured OpenRouter models (free + paid)
- `openrouter/free` as default model (zero-cost free model router)
- `openrouter/auto`, `moonshotai/kimi-k2.5`, `xiaomi/mimo-v2-pro`, `anthropic/claude-opus-4.6` models

### Fixed
- Telegram user IDs now entered as comma-separated text (no more list validation errors)
- Docker build: TypeScript compiler now correctly installed in build stage
- Docker cache invalidation on Dockerfile changes

## 0.2.0

### Added
- **Agentic Loop** with 10-iteration hard limit and structured tool calling
- **OpenRouter integration** with multi-LLM support, retry logic, and exponential backoff
- **Home Assistant tools**: get entity state, search entities, call services, get config
- **Safety Gate**: 60s inline-keyboard confirmation for dangerous tool calls via Telegram
- **Built-in tools**: time, system info, JSON store CRUD
- **Web UI chat endpoint** (`/api/chat`) with embedded Ingress dashboard

### Changed
- Migrated from standalone Pi architecture to native HA Add-on
- Data storage moved to `/data/` (HA backup-compatible JSON store)

## 0.1.0

### Added
- Initial Add-on skeleton with Dockerfile and `config.yaml`
- Configuration loader with HA Supervisor + dev fallback
- Telegram bot with whitelist guard
- Ingress web server (Fastify)
- Agent system prompt (`butler.md`)
