# Changelog

## 0.4.0

### Added
- **HA Best Practices Skill**: New `ha_best_practices` tool provides the bot with reference knowledge for automations, helpers, templates, device control, and safe refactoring. Reference files are bundled in `agents/skills/ha-best-practices/`.
- **Backlog Automation**: Approved backlog tasks are now automatically processed by the AI:
  - `approved` → AI generates a concrete solution → `solution_proposed`
  - User reviews and approves → `solution_approved`
  - AI executes the solution → `done`
  - New task fields: `solution`, `solutionApprovedAt`, `executionResult`
  - Background processor polls every 30 seconds for tasks needing processing
- **Tool Complexity Levels**: Each tool now has a complexity rating (1-3 stars). Settings UI allows mapping different LLM models to each complexity level:
  - Level 1 (simple): get_state, search, basic service calls
  - Level 2 (moderate): dangerous calls, home analysis
  - Level 3 (complex): reserved for future advanced tools
- **New Models**: Added Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5, Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3.1 Flash Lite, GPT-5.4, GPT-5.4-mini
- **Dynamic Version Display**: Version number in chat footer and health API is now read from `package.json` at startup instead of being hardcoded

### Fixed
- **Model Dropdown Duplication**: Settings page no longer duplicates model entries on each visit (dropdown is now cleared before populating)
- **Telegram Model Override**: Telegram bot now uses the user's model selection from profile (previously always used the config default)
- **Log/Actions Scrolling**: System Logs and Actions tabs are now scrollable when content overflows
- **Device Control Verification**: Improved action verification:
  - Wait time increased (1.5s general, 3s for climate)
  - Climate `set_temperature` now checks the `temperature` attribute instead of entity state
  - Failed verifications return `IMPORTANT_WARNING` that forces the bot to honestly report failures
- **Hardcoded Version**: Removed hardcoded version strings from server.ts and dashboard.ts

### Changed
- **Model List Updated**: Removed outdated models (Claude 3.5 Sonnet, Gemini 2.0 Flash, GPT-4o). Only latest versions of each model family are shown.
- **config.yaml Schema**: Add-on model selection now matches the web UI model list
- **Butler Prompt**: Added rules for honest verification feedback and best practices consultation

---

## 0.3.0

### Added
- **Interactive Tool Vault**: Tools can now be toggled on/off from the Settings UI. Disabled state is persisted to disk and survives restarts.
- **Scheduler / Cron Jobs**: Recurring jobs with schedule formats: `every 5m`, `daily 07:00`, `weekdays 08:00`, `weekends 09:00`. Full CRUD via tools and Settings UI. Jobs execute through the agentic loop.
- **Action Feedback Loop**: `ha_call_service` now verifies state changes — captures pre-state, executes, waits 1s, checks post-state, and returns verification result (confirmed/failed/timeout).
- **Proactive Analysis** (`analyze_home`): Periodic environment scan with 8 analysis modules:
  - **Energy**: Lights on during daytime, heating in summer, windows open + climate, high thermostat settings, standby power waste
  - **Solar**: Grid export surplus, missing battery, battery full + exporting
  - **Security**: Missing presence detection, open windows/doors at absence, unlocked locks at night, missing smoke detectors, missing water leak sensors
  - **Covers/Raffstores**: Storm protection (wind sensor), dusk/dawn automation, seasonal solar shading (summer only), all-closed-daytime warning
  - **Climate**: Humidity/mold risk (>65%), temperature differentials between rooms (>5°C)
  - **Maintenance**: Unavailable entities, stale sensors (48h+), low battery (<20%)
  - **Naming**: Missing friendly names, inconsistent ID patterns, missing labels
  - **Automations**: Disabled automations, never-fired automations, missing motion-light, night mode (lights at 3am), missing notifications, vacation mode
  - Results limited to **top 3 most impactful** findings per run, deduplicated against full backlog (incl. rejected/deferred)
- **Self-Improvement System** with 4 subsystems:
  - **Corrections**: Learns from user corrections ("Nein, nicht das Licht"), auto-injected into future prompts
  - **Prompt Patches**: Dynamic rules that modify agent behavior permanently
  - **Usage Patterns**: Tracks recurring actions, detects habits (e.g. "user always turns off kitchen at 22:00")
  - **Error Tracking**: Records tool failures, builds error context for smarter retries
  - All learning context auto-injected into system prompt per request
- **Backlog Deferred Status**: Tasks can now be deferred (yellow badge) in addition to approved/rejected/done. Filter buttons for deferred/rejected in UI.
- **Entity Cache by Area**: Entities now grouped by HA area/room instead of domain — dramatically improves bot conversations by giving spatial context.
- **Model Recommendations**: Settings UI shows recommendation hints for each LLM model.
- **Response Sanitizer**: Strips raw tool-call syntax that weaker LLMs sometimes leak into responses (OLCALL, tool_code blocks, XML tags, [TOOL_CALLS]).
- **Butler Prompt Overhaul**: Naming convention guide (LGT, OG, DG, WZ, etc.), area-based entity lookup, self-improvement instructions, all new tools documented.

### Fixed
- **Model Selection**: The model dropdown in Settings now works — previously it was empty because the frontend fetched a non-existent `/api/models` endpoint.
- **Model Override Persistence**: Selecting a model now saves the override to the server profile (not just browser localStorage).
- **Misleading Security Label**: Replaced "Alle Daten bleiben lokal" with accurate description.
- **SVG Icons**: Replaced emoji icons with clean SVG stroke icons matching the mic button style.
- **JS Parse Error**: Fixed `\x27` escaping in template literals that broke all buttons/navigation.

### Changed
- **Updated Model List**: Available models now include Gemini 2.5 Flash, Claude Sonnet 4, GPT-4.1-mini, and the user-configured default model is always shown first.
- **Security Card**: Renamed "Lokale Ausführung" to "Ausführung" with updated icon to reflect the cloud/local hybrid architecture.

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
