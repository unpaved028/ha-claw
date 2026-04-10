---
trigger: always_on
glob:
description: HA-Claw Projekt-Kontext für alle AI Agents
---

# HA-Claw – Projekt-Kontext

## Was ist HA-Claw?
Lokaler KI-Assistent als Home Assistant Add-on. Agentic Loop mit Tool Calling, Web UI (Ingress), Telegram Bot. Nutzt OpenRouter für LLM-Zugang.

## Architektur (Kurzfassung)

```
ha-claw/
├── agents/butler.md              # System-Prompt (Goldene Regeln, Tools, Entity-Cache)
├── config.yaml                   # HA Add-on Manifest (Version!)
├── package.json                  # Version! (muss mit config.yaml übereinstimmen)
├── src/
│   ├── index.ts                  # Startup
│   ├── core/                     # Agentic Loop, Config, HA-Client, Entity-Cache, OpenRouter
│   ├── tools/                    # Tool-Registry, HA-Tools, Built-in Tools
│   ├── storage/                  # JSON-Store, Memory, Scheduler, Backlog, Action-Log
│   ├── web/
│   │   ├── server.ts             # Fastify Server (Chat API, SSE Streaming, Settings)
│   │   ├── dashboard.ts          # ⚠️ AUTO-GENERIERT – nicht manuell editieren!
│   │   └── ui/                   # ← HIER editieren!
│   │       ├── dashboard.html    # HTML-Grundgerüst mit Platzhaltern
│   │       ├── style.css         # Alle CSS-Themes und Styles
│   │       └── client.js         # Frontend-JavaScript (Chat, Tools, SSE, Maps)
│   └── telegram/                 # Grammy Bot + Safety Gate
├── CHANGELOG.md                  # Versionshistorie
└── Dockerfile                    # Multi-Stage Build (node:22-alpine)
```

## Dashboard Build-Pipeline (WICHTIG!)
- **Quellcode**: `src/web/ui/` enthält die editierbaren Dateien (HTML, CSS, JS)
- **Bundling**: `.agents/workflows/bundle-dashboard.js` generiert `src/web/dashboard.ts`
- **REGEL**: NIEMALS `dashboard.ts` direkt editieren – Änderungen gehen beim nächsten Bundle verloren!
- **Workflow**: Das Bundle-Script wird automatisch vor jedem Release via `/publish` ausgeführt
- **Warum Inlining?**: HA Ingress mappt URLs dynamisch (`/api/hassio_ingress/<token>/`). Externe CSS/JS-Links brechen. Daher wird alles inline in einen HTML-String gebündelt.

## Konventionen
- **Sprache**: Code + Commits auf Englisch, UI + Bot-Prompt + Docs auf Deutsch
- **TypeScript**: Strict Mode, ESM (`"type": "module"`), `npm run check` = `tsc --noEmit`
- **Commits**: Konventionelle Messages, `Co-Authored-By`-Trailer
- **Versionierung**: Gleichzeitig in `package.json` + `config.yaml` + `CLAUDE.md` bumpen
- **Docs**: CHANGELOG.md, README.md, DOCS.md alle in `ha-claw/` (neben config.yaml)
- **Release**: Workflow `/publish` nutzen (siehe `.agents/workflows/publish.md`)

## Vollständige Dokumentation
Für Details zu Entity-Cache, Safety Gate, Agentic Loop, Release-Historie und Roadmap: siehe `CLAUDE.md` im Repo-Root.
