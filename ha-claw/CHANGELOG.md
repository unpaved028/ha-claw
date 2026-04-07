# Changelog

## 0.8.5

### Fixed

- **Confirmation Overlays**: Fixed double-escaping for `respondConfirm` call.
- **Tool Management**: Standardized escaping for `toggleTool` and `showToolDetails` (replaced `\x27` with proper double-escaped quotes).
- **Backlog Actions**: Fixed escaping for all backlog status update and delete buttons.

---

## 0.8.4

### Fixed

- **Dashboard Actions**: Final stabilization of string escaping for interactive action buttons (Primary/Secondary).
- **Rollback UI**: Fixed string escaping for the rollback action button in the activity log.

---

## 0.8.3

### Fixed

- **Web UI Version Display**: Improved version display reliability on mobile devices (immediate load).
- **Dashboard Maps**: Corrected regex escaping for `[MAP]` parsing within template strings.
- **Input Handling**: Fixed variable reference `lastUserMessage`.

---

## 0.8.2

### Improved

- **Stability**: Reapplied core UX fixes and stabilized string escaping logic in the Web UI dashboard to ensure reliable button interactions.

---

## 0.8.1

### Fixed

- **Web UI Buttons**: Fixed syntax errors caused by flawed string escaping in Dashboard Buttons (`handleAction`, `respondConfirm`, `rollbackAction`).

---

## 0.8.0

### Added

- **Telegram Voice-to-Text**: Sprachnachrichten via Whisper/OpenRouter STT Handler + Audio-Transcription.
- **Streaming Responses (SSE)**: UI & Telegram Streaming Updates.
- **Multi-Entity Batching**: `ha_call_service` akzeptiert `entity_id` als Array.
- **Telegram Command-Menü**: `/help`, `/status`, `/rooms`.
- **Token-Kosten-Tracking**: Kumulativer Counter + Kostenberechnung (USD) in `/status`.

### Improved

- **Circuit Breaker für OpenRouter**: Schutz vor API-Fehlern mit Global State.

---

## 0.7.0

### Added

- **Smart Context Management**: Introduced a configurable `maxContextTokens` setting (default 4000) for the agentic loop. The assistant now uses `js-tiktoken` for precise token counting and a smart pruning algorithm to keep the conversation history within limits while maintaining essential context.
- **Learned Corrections Capping**: To maintain high performance, the learned "patterns" and corrections are now capped at the 100 most recent/relevant entries.
- **7-Day Action Log Retention**: Implemented a rolling data retention policy for the audit trail. Actions older than 7 days are automatically pruned, keeping the internal storage efficient and the dashboard responsive.

### Improved

- **Long-term Performance**: Significantly reduced potential latency and token overhead during extended chat sessions by preventing context window bloat.
- **Resource Management**: Better handling of internal JSON and JSONL stores through automatic cleanup cycles.

---

## 0.6.6

### Fixed

- **Web UI – Confirmation Modal**: Fixed transparent background in the safety gate confirmation modal. Added explicit theme variables `--bg-card` and `--border` to ensure correct rendering in Dark and Claw themes.

---

## 0.6.5

### Added

- **Script-Unterstützung**: Neue Tools `ha_get_script_config` und `ha_save_script_config` zum Lesen und Bearbeiten von Skripten hinzugefügt.
- **Automation-Editing**: Neues Tool `ha_save_automation_config` zum Bearbeiten bestehender Automationen hinzugefügt.

### Fixed

- **Automation-Konfiguration**: `ha_get_automation_config` nutzt nun die interne `id` aus den Entity-Attributen. Dies löst das Problem, dass UI-gepflegte Automationen oft nicht über ihren `entity_id` Suffix geladen werden konnten.

---

## 0.6.4

### Fixed

- **Fenstersensor-Erkennung**: `ha_search_entities` Tool erweitert um einen optionalen `device_class` Filter. Dies ermöglicht dem Bot, gezielt nach `window`, `door`, `motion` etc. zu suchen, was die Erkennung von Sensoren unabhängig von ihrem Namen massiv verbessert.

---

## 0.6.3

### Fixed

- **Area/Floor Detection**: Gefixt für Home Assistant 2026.x. Das alte Jinja2 `namespace.data.update`-Pattern wurde durch ein modernes Array-Concat-Pattern ersetzt, um Template API 400 Fehler zu beheben. Die Logic wurde von einem 3-Tier auf ein robusteres 2-Tier Fallback-System (Template -> Entity-ID Parsing) vereinfacht.

---

## 0.6.2

### Changed

- **Backlog Processor – Event-Driven Architecture**: Replaced the 30-second `setInterval` polling with an event-driven model. Task processing now triggers only when a task transitions to `approved` or `solution_approved` status. Zero LLM calls and zero token cost when idle.
- **Startup Scan**: One-time scan on startup (10s delay) catches tasks that were approved before the add-on started.
- **Debounced Coalescing**: Rapid-fire status changes (e.g., user approves multiple tasks quickly) are coalesced into a single processing run via 2s debounce.
- **Backlog Event Hook**: `backlog.ts` now exposes `onProcessableStatusChange()` callback, decoupling the processor from the storage layer without circular imports.

---

## 0.6.1

### Fixed

- **Window/Door Sensor Identification**: Entity cache now shows each important sensor (window, door, motion, smoke, moisture) as an individual line with entity_id and type-icon (🪟🚪🏃🔥💧), instead of a compact unnamed list. The bot can now correctly identify, distinguish, and respond to sensor queries per room.

### Changed

- **Butler Prompt – Sensor Awareness (§3d)**: Added dedicated section explaining how binary sensors for windows, doors, and motion work. The bot now understands type-icons in the entity cache and knows these sensors are read-only.
- **Entity Cache Format**: Important sensors changed from `_Sensoren:_ Name (zu), Name (offen)` to individual lines like `- 🪟 Fenster Nord → \`binary_sensor.xyz\` (zu)`.

---

## 0.6.0

### Added

- **Sensor Awareness in Entity Cache**: Important `binary_sensor` device classes (window, door, motion, smoke, moisture, garage_door, presence) are now included in the entity cache per room. The bot can directly see which windows/doors are open in each area.
- **Typing Indicator**: Web UI now shows an animated "denkt nach..." indicator while the bot is processing, so users know the bot is working.
- **Web Safety Gate**: Dangerous tool calls (locks, alarms, automations, deletions) now show a confirmation modal in the Web UI before execution — matching the existing Telegram safety gate. Auto-denies after 60 seconds.
- **Area Filter for Entity Search**: `ha_search_entities` tool now supports an optional `area` parameter to filter results by room/area name (e.g., "find all sensors in Wohnzimmer").
- **Periodic Entity Cache Refresh**: Entity cache now auto-refreshes every 30 minutes instead of only at startup. Also added a manual `/api/cache/refresh` endpoint.

### Changed

- **Entity Cache Format**: Sensor section per area now shows compact sensor list (e.g., "Sensoren: Fenster Bad (zu), Tür Flur (offen)") instead of hiding all sensors.
- **Search Results**: `ha_search_entities` now includes `device_class` in results for better context.

---

## 0.5.2

### Fixed

- **Area/Floor Detection Reliability**: Replaced fragile Jinja2 template approach with direct HA Registry API calls (`/config/area_registry/list`, `/config/entity_registry/list`, `/config/device_registry/list`, `/config/floor_registry/list`). This fixes the issue where the bot could not see rooms, areas, or floors.
- **3-Tier Fallback**: Area and floor detection now tries three methods in order: 1) HA Registry API (most reliable), 2) Jinja2 Template (legacy fallback), 3) Entity-ID pattern parsing (infers rooms from naming conventions like `lgt_og_bad_1` → OG Bad).
- **Device-Inherited Areas**: Entities now correctly inherit their area from their device when no direct area is assigned, matching HA's native behavior.
- **Template API Timeout**: `renderTemplate()` now has a 10-second timeout to prevent hanging on unresponsive HA instances.

### Changed

- **Improved Logging**: Area and floor detection now logs which method succeeded and how many results were found, making debugging much easier.

---

## 0.5.1

### Added

- **Floor → Area → Entity Hierarchy**: Entity cache now organizes devices by floor (Stockwerk) → area (Bereich) → entities, giving the bot full spatial awareness of the home structure.
- **`ha_list_areas` Tool**: Lists all areas/rooms with their floor assignments and entity counts. Supports optional floor filter.
- **`ha_resolve_group` Tool**: Resolves `group.*` entities to their individual members with current states, so the bot can understand and work with HA groups.
- **`ha_get_automation_config` Tool**: Reads full automation configuration (triggers, conditions, actions), so the bot can explain and analyze automations in plain language.
- **Entity Cache Compression**: Same-domain entities with identical state (≥3) are compressed into a single line (e.g., "3× light (alle off)") to save LLM tokens.

### Fixed

- **Version Display on Mobile**: Version number now appears immediately on page load instead of only after navigating to the Settings tab. Previously showed "v..." until the user opened Settings.
- **Bot Room/Floor Awareness**: The bot now understands the spatial hierarchy (floors, areas) and can answer questions like "What devices are in room X?" or "Show me all rooms on the upper floor" directly from its entity cache.
- **Group and Automation Understanding**: The bot can now resolve group memberships and read automation configurations instead of only seeing entity states.

### Changed

- **Butler Prompt**: Added rules for floor hierarchy understanding, group resolution, and automation inspection. Documented three new tools.
- **Default Model**: `anthropic/claude-haiku-4.5` set as default model in config.yaml.

---

## 0.5.0

### Added

- **Conversational Onboarding**: Replaced the rigid 7-step form with a natural LLM-powered conversation. The bot now intelligently extracts names from natural language (e.g., "Jarvis wäre cool" → Name = Jarvis), collects personality preferences conversationally, and introduces its features after setup.
- **Feature Introduction**: After onboarding, the bot presents its capabilities (device control, scheduling, analysis, memory, learning) and emphasizes that it improves with use.
- **Weekly Analysis Suggestion**: During onboarding, the bot offers to set up a weekly automated home analysis via `schedule_create`.
- **One-Shot Timers & Reminders** (`schedule_once`): New tool for fire-once jobs — "Erinnere mich in 30min an den Müll" or "Schalte in 10min das Licht aus". Supports relative delays (`5m`, `2h`, `1h30m`) and absolute times (`14:30`).
- **Weekly Schedule Format**: New `weekly <day> HH:MM` format for the scheduler (e.g., `weekly mon 08:00`).
- **Proactive Telegram Notifications**: Scheduler job results are now automatically sent via Telegram. Enables reminders, analysis reports, and delayed actions to reach the user proactively.
- **Daily Greeting**: First message of the day receives a context-aware greeting hint, making the bot feel more alive and personal.
- **Tool Filtering**: Agentic loop now supports a `toolFilter` parameter to restrict available tools per agent (used during onboarding to limit to setup-relevant tools only).

### Changed

- **Onboarding Architecture**: Onboarding now routes through the agentic loop with a dedicated system prompt (`agents/onboarding.md`) instead of a deterministic state machine. No more literal input-as-name bugs.
- **Profile Extended**: Added `telegramChatId` (for proactive notifications) and `lastInteractionDate` (for daily greeting) fields.
- **Scheduler Extended**: `ScheduledJob` now has a `oneshot` flag. One-shot jobs auto-disable after execution. New schedule parsers for `once +Xm`, `once HH:MM`, and `weekly <day> HH:MM`.
- **Butler Prompt Updated**: Added `schedule_once` tool documentation and timer/reminder examples.

---

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
