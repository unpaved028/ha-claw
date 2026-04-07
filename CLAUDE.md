# CLAUDE.md – HA-Claw Projekt-Kontext

## Was ist HA-Claw?
Lokaler KI-Assistent als Home Assistant Add-on. Agentic Loop mit Tool Calling, Web UI (Ingress), Telegram Bot. Nutzt OpenRouter für LLM-Zugang.

## Aktuelle Version: 0.8.2

## Architektur (Kerndateien)

```
ha-claw/
├── agents/butler.md              # System-Prompt (Goldene Regeln, Tools, Entity-Cache-Injection)
├── config.yaml                   # HA Add-on Manifest (Version, Options, Schema)
├── package.json                  # Version, Dependencies (grammy, fastify)
├── src/
│   ├── index.ts                  # Startup (Tools registrieren, Cache bauen, Server starten)
│   ├── core/
│   │   ├── agentic-loop.ts       # Agentic Loop (max 10 Iterationen, Safety Gate, Tool Execution)
│   │   ├── config.ts             # Config laden (Supervisor Token, HA URL, OpenRouter Key)
│   │   ├── entity-cache.ts       # Entity-Cache: Floor→Area→Entities, Sensor-Awareness, Komprimierung
│   │   ├── ha-client.ts          # HA REST API Client (3-Tier Fallback: Registry→Template→ID-Parsing)
│   │   ├── openrouter.ts         # OpenRouter API (Retry, Backoff, Model Selection)
│   │   ├── profile.ts            # Bot/User Persönlichkeit
│   │   ├── proactive-analysis.ts # 8 Analyse-Module (Energie, Solar, Sicherheit, Klima, etc.)
│   │   └── logger.ts             # Pino Logger mit Secret Redaction
│   ├── tools/
│   │   ├── registry.ts           # Tool-Registry (Name, Schema, Handler, Dangerous-Flag, Complexity)
│   │   ├── ha-tools.ts           # 9 HA-Tools (get_state, search, call_service, list_areas, resolve_group, automation_config, etc.)
│   │   └── builtins.ts           # Built-in Tools (time, store, memory, backlog, scheduler, learning)
│   ├── storage/
│   │   ├── json-store.ts         # JSON-File Storage (atomic writes)
│   │   ├── memory-cards.ts       # Langzeitgedächtnis (TF-IDF Retrieval)
│   │   ├── learning.ts           # Corrections, Patterns, Errors, Prompt Patches
│   │   ├── action-log.ts         # JSONL Action Log mit Rollback
│   │   ├── scheduler.ts          # Cron Jobs + One-Shot Timer
│   │   ├── backlog.ts            # Verbesserungsvorschläge mit Approval-Workflow
│   │   └── backlog-processor.ts  # Event-driven Task-Ausführung (kein Polling)
│   ├── web/
│   │   ├── server.ts             # Fastify Server (Chat API, Settings, Safety Gate, Cache Refresh)
│   │   └── dashboard.ts          # Komplettes Web UI als HTML-String (2700+ Zeilen)
│   └── telegram/
│       ├── bot.ts                # Grammy Telegram Bot
│       └── confirmation.ts       # Telegram Safety Gate (Inline Keyboard)
├── CHANGELOG.md                  # Vollständige Versionshistorie
├── README.md                     # Feature-Übersicht, Installation, Konfiguration
└── DOCS.md                       # Deutsche Doku für HA Add-on UI
```

## Schlüsselkonzepte

### Entity-Cache (entity-cache.ts)
- Baut beim Start + alle 30min einen kompakten Text: `# Stockwerk` → `## Bereich` → Entities
- Nur steuerbare Domains + wichtige Sensoren (window, door, motion, smoke, moisture)
- Komprimierung: ≥3 gleiche Domain+State → eine Zeile
- Wird in `butler.md` via `{{ENTITY_CACHE}}` Placeholder injiziert

### Area/Floor Detection (ha-client.ts) – 3-Tier Fallback
1. **HA Registry API** (POST `/config/area_registry/list`, `entity_registry/list`, `device_registry/list`)
2. **Jinja2 Templates** (`areas()`, `area_entities()`, `floors()`)
3. **Entity-ID Parsing** (Regex: `domain.prefix_floor_room_number` → `OG Bad`)

### Safety Gate
- **Telegram**: Inline-Keyboard Bestätigung (confirmation.ts)
- **Web UI**: Polling-basiertes Confirm-Modal (server.ts + dashboard.ts)
- Dangerous Tools: `ha_call_service_dangerous`, `store_delete`, `memory_forget`, `backlog_delete`, `schedule_delete`

### Agentic Loop (agentic-loop.ts)
- Max 10 Iterationen, injiziert Memory Cards + Corrections + Patterns + Errors
- `ConfirmationFn` Interface für Safety Gate (Telegram/Web/Auto-Approve)

## Konventionen
- **Sprache**: Code + Commits auf Englisch, UI + Bot-Prompt + Docs auf Deutsch
- **TypeScript**: Strict Mode, `npm run check` = `tsc --noEmit`
- **Commits**: Konventionelle Messages, `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- **Versionierung**: Gleichzeitig in `package.json` + `config.yaml` bumpen
- **Docs**: CHANGELOG.md, README.md, DOCS.md alle in `ha-claw/` (neben config.yaml, NICHT im Repo-Root!)
- **Default Model**: `anthropic/claude-haiku-4.5`

## Release-Historie (diese Session)

| Version | Datum | Änderungen |
|---------|-------|------------|
| 0.5.1 | 2026-04-01 | Floor-Hierarchie, 3 neue Tools (ha_list_areas, ha_resolve_group, ha_get_automation_config), Entity-Komprimierung, Version-Fix Mobile |
| 0.5.2 | 2026-04-01 | 3-Tier Fallback für Area/Floor (Registry→Template→ID-Parsing), Template-Timeout |
| 0.6.0 | 2026-04-01 | Sensoren im Cache, Typing-Indikator, Web Safety Gate, Area-Filter Suche, Auto-Refresh Cache |
| 0.6.1 | 2026-04-02 | Fenster/Tür-Sensor Identifikation Fix, Butler-Prompt Sensor-Awareness |
| 0.6.2 | 2026-04-02 | Backlog Processor: Event-driven statt 30s-Polling, zero Token cost when idle |
| 0.6.3 | 2026-04-03 | HA Area/Floor Mapping Fix für HA 2026.x (2-Tier Template/ID-Parsing Fallback) |
| 0.6.4 | 2026-04-03 | Search tool extended with device_class filter for better sensor detection |
| 0.6.5 | 2026-04-03 | Automation/Script editing support, native HA ID logic for automation loading |
| 0.6.6 | 2026-04-03 | Fixed Web UI transparent confirmation modal background |
| 0.7.0 | 2026-04-03 | **v0.7.0 – Token-Effizienz & Performance**: System-Prompt-Größe begrenzen (maxContextTokens), Context-Aware Pruning, Daten-Retention (Corrections max 100, Action-Log 7d) |
| 0.7.1 | 2026-04-03 | **Proaktiver Butler-Modus**: Periodische Systemanalyse, Push-Nachrichten bei High-Priority Tasks, Inline-Keyboard für Fast-Track Ausführung / Ignorieren via Telegram. |
| 0.7.2 | 2026-04-06 | **v0.7.2 – UX & Batching**: Telegram Befehle (`/rooms`, `/status`, `/help`), LLM Usage Tracker mit Kostenberechnung, Multi-Entity Tool Batching (`ha_call_service`, `ha_get_state`), `ha_call_service_dangerous` Tool. |
| 0.8.0 | 2026-04-07 | **v0.8.0 – Nutzererlebnis & Zuverlässigkeit**: Telegram Voice-to-Text via Whisper/STT, Streaming Responses (SSE), Circuit Breaker für API-Stabilität, Web UI Lade-Optimierung. |
| 0.8.1 | 2026-04-07 | Bugfix: Fixed syntax errors breaking interactive buttons in the web dashboard. |
| 0.8.2 | 2026-04-07 | Reapplied core UX fixes and stabilized string escaping logic. |

## Nächste Schritte (Roadmap)

### v0.7.x – Token-Effizienz & Butler-Modus ✅
- [x] **System-Prompt-Größe begrenzen**: `maxContextTokens` (4K default), smart pruning logic
- [x] **Daten-Retention**: Corrections max 100, Action-Log 7-Tage-Fenster
- [x] **Proaktiver Butler-Modus**: Periodische 60-Minuten-Analyse und proaktive Telegram-Nachrichten.
- [x] **Fast-Track Approve**: Inline-Buttons zum direkten Ausführen von Warnungen.

### v0.8.0 – Nutzererlebnis & Zuverlässigkeit ✅

#### Pflicht (High Impact)
- [x] **Telegram Voice-to-Text**: Sprachnachrichten via Whisper/OpenRouter STT → „Hey, mach Licht im Bad an" statt Tippen. Grammy `message:voice` Handler + Audio-Transcription. ✅
- [x] **Streaming Responses (SSE)**: Web UI zeigt sofort „🔍 Suche...", „⚡ Schalte...", „✅ Fertig!" statt 15s Ladebalken. Telegram: `sendChatAction('typing')` + Zwischen-Updates. Erfordert SSE-Endpoint in `server.ts` + Callback-Hooks in `agentic-loop.ts`. ✅
- [x] **Multi-Entity Batching**: `ha_call_service` akzeptiert `entity_id` als Array. ✅
- [x] **Telegram Command-Menü**: `/help`, `/status`, `/rooms`. ✅

#### Soll (Medium Impact)
- [x] **Circuit Breaker für OpenRouter**: Nach 3 Fehlern → 60s Pause, Half-Open Probe. Globaler State über Requests hinweg statt isolierter Retry-Loops. Scheduler prüft LLM-Verfügbarkeit vor Job-Ausführung.
- [x] **Token-Kosten-Tracking**: Kumulativer Counter + Kostenberechnung (USD) in `/status`. ✅
- [ ] **Retry-bei-Fehler**: Telegram: Inline-Button „🔄 Nochmal versuchen" bei Fehlern. Web: Retry-Button an Fehlernachrichten. Statt erneut tippen.

#### Kann (Low Priority, nur wenn nötig)
- [ ] **Web UI Refactoring**: Dashboard HTML-String nur ablösen wenn Streaming (SSE) es erfordert – kein Selbstzweck-Refactoring.
- [ ] **Daten-Export Tool**: Conversations, Memory, Backlog als JSON exportieren
- [ ] **Tool-Timeouts**: 15s pro Tool-Ausführung

### v0.9.0 – Optimierung & Erweiterung
- [ ] **Chat-History Paginierung**: Letzte 30 Nachrichten laden, „Mehr laden"-Button
- [ ] **HA State Caching**: Kurzzeit-Cache (5s TTL) zwischen Tool-Calls im selben Loop
- [ ] **Memory Card Vector Search**: TF-IDF durch Embedding-basierte Suche ersetzen (skaliert besser ab 1000+ Cards)

### v1.0.0 – Qualität & Hardening
- [ ] **Tests einführen**: vitest, Storage + Agentic Loop + Config
- [ ] **Dockerfile-Hardening**: HEALTHCHECK, non-root User, Alpine-Version pinnen
- [ ] **Bild/Vision-Support**: OpenRouter Vision-Modelle & `ha_get_camera_image` Kamera-Integration (Zählerstände ablesen, Haustür prüfen)

## Bekannte Probleme
- Dashboard ist ein 2700-Zeilen HTML-String in TypeScript (schwer wartbar, Refactoring nur wenn Streaming es erfordert)
- ~~Kein Linting (eslint) oder Formatting (prettier) konfiguriert~~ → gelöst (ESLint v9 flat config + Prettier, `npm run lint` / `npm run format:fix`)
- Memory Card Suche ist O(n) Linear-Scan (→ Vector Search in v0.9.0)
- ~~Backlog Processor pollt alle 30s~~ → gelöst in v0.6.2 (event-driven)
