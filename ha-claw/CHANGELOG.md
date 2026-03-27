# Changelog

## 0.2.7 (Release)

### Fixed
- **Web UI Stability**: Fixed a critical JavaScript parse error (lookbehind regex) that caused the dashboard to freeze and become non-responsive.
- **Escaping Fixes**: Corrected backslash-escaping in `dashboard.ts` template literals for both Markdown parsing and `onclick` event handlers.
- **CSS Formatting**: Fixed a typo in `.modal-body` padding that affected layout.

## 0.2.6

### Added
- **Action Log Persistence**: System actions and tool executions are now permanently stored in `actions.jsonl` and survive restarts.
- **Rollback Support**: Added "Undo" capability for Home Assistant service calls. The system automatically calculates and records the inverse operation for easy rollback from the UI.

### Changed
- **Dashboard Restructure**: Materially improved UI navigation by nesting the **Aktionen** log as a sub-tab within the **Logs** page, providing a cleaner and more focused main navbar.

## 0.2.5

### Added
- **Persistence**: Chat history is now saved and loaded automatically in the Web UI and Telegram.
- **Persistent AI Context**: The agent now remembers the last 20 messages, allowing for mult-turn conversations.

## 0.2.4

### Fixed
- **Web UI**: Chat labels (Bot & User) are now dynamic and follow the names set in your profile.

## 0.2.3

### Added
- Create profile system (bot name, user name, personality) with JSON storage
- Build onboarding flow for first-time setup in chat
- Add profile/personality section to Settings page
- Inject personality into butler system prompt dynamically
- Build memory card system (CRUD, TTL, versioning, tags)
- Build hybrid retrieval (keyword + relevance scoring) for memory cards
- Registering memory tools for agent
- Integrate memory retrieval into agentic loop (auto-inject relevant cards)

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
