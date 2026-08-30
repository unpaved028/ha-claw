<div align="center">

<img src="logo.png" alt="HA-Claw" width="140">

# HA-Claw

**Ein KI-Agent für Home Assistant zum Reden — als Add-on, nicht als Cloud-Dienst.**

Sprich mit deinem Zuhause in normaler Sprache, über die Home-Assistant-Seitenleiste oder
Telegram. HA-Claw kennt deine Stockwerke, Bereiche und Entities, ruft in deinem Namen
Home-Assistant-Dienste auf, prüft nach, ob die Aktion wirklich gewirkt hat, und fragt nach,
bevor es etwas anfasst, das dich aussperren oder einen Alarm auslösen könnte.

[![CI](https://github.com/unpaved028/ha-claw/actions/workflows/ci.yml/badge.svg)](https://github.com/unpaved028/ha-claw/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Add-on-Version](https://img.shields.io/badge/add--on-v0.9.7-0aa8d2.svg)](ha-claw/CHANGELOG.md)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5.svg?logo=home-assistant&logoColor=white)](https://www.home-assistant.io/)

[Installation](#installation) · [Handbuch](ha-claw/DOCS.de.md) · [Roadmap](docs/roadmap.md) · [English](README.md)

</div>

> **Hinweis zur Sprache:** Diese Seite ist die deutsche Fassung von [README.md](README.md).
> Das vollständige Benutzerhandbuch gibt es auf Deutsch unter
> [ha-claw/DOCS.de.md](ha-claw/DOCS.de.md). Die technische Referenz unter [`docs/`](docs/README.md)
> wird nur auf Englisch gepflegt.

---

## Was es macht

Die meisten Sprach- und Chat-Integrationen bilden einen Satz auf genau eine vordefinierte
Absicht ab. HA-Claw fährt stattdessen eine **agentische Schleife**: Das Sprachmodell kann
deine Entities durchsuchen, die Konfiguration einer Automation lesen, einen Dienst aufrufen,
den daraus entstandenen Zustand prüfen und dann entscheiden, was als Nächstes zu tun ist —
bis zu zehn Schritte pro Anfrage. Das ist der Unterschied zwischen „schalte das Küchenlicht
an" und *„im Wohnzimmer ist es kalt, steht irgendwo ein Fenster offen?"*

| | |
| --- | --- |
| **Kennt die Struktur deines Zuhauses** | Stockwerk → Bereich → Entity, Auflösung von Gruppen, Sensorsuche über `device_class`. Der Agent weiß, *welches* Fenster offen ist, nicht nur dass irgendein `binary_sensor` auf `on` steht. |
| **Handelt und prüft nach** | Jeder Dienstaufruf erfasst den Zustand vor und nach der Aktion. Hat das Gerät nicht reagiert, sagt der Agent das — statt Erfolg zu behaupten. |
| **Fragt, bevor es gefährlich wird** | Schlösser, Alarmanlagen, Skripte, Buttons, Garagentore und Änderungen an Automationen laufen über eine Bestätigung: Inline-Tastatur in Telegram, Dialog in der Web-UI. |
| **Zwei Oberflächen, ein Gespräch** | Dashboard in der Seitenleiste und Telegram-Bot lesen und schreiben denselben Verlauf. |
| **Behält das Langweilige im Blick** | Nicht erreichbare Geräte, Sensoren die nicht mehr melden, Batterien unter 20 %, Backup-Alter und freier Speicherplatz — als Live-Prüfungen, nicht als Aufgabenliste, die nie leer wird. |
| **Schlägt Verbesserungen vor** | Eine regelmäßige Analyse sucht nach Energieverschwendung, Sicherheitslücken, fehlenden Rollladen-Automationen und uneinheitlicher Benennung und legt sie als prüfbare Aufgaben an. |
| **Lernt dazu** | Korrekturen, wiederkehrende Muster und frühere Tool-Fehler fließen in den System-Prompt zurück. |

## Vor der Installation

HA-Claw arbeitet mit deinem eigenen API-Key. Drei Dinge solltest du vorher wissen:

- **Es rechnet nicht lokal.** Deine Nachrichten, der Entity-Cache und die Tool-Ergebnisse
  gehen über [OpenRouter](https://openrouter.ai) an einen LLM-Anbieter. *Aktionen* laufen
  lokal gegen dein Home Assistant, das *Nachdenken* nicht. Wenn eine Verarbeitung beim
  Modellanbieter für dich nicht in Frage kommt, ist dieses Add-on das falsche Werkzeug.
- **Es kostet pro Nachricht Geld.** Mit dem Standardmodell `anthropic/claude-haiku-4.5`
  liegt eine normale Anfrage im Bruchteil eines Cents, aber auch die proaktive Analyse und
  die Aufgabenverarbeitung verbrauchen Tokens. Verbrauch und geschätzte Kosten in USD
  stehen unter Status.
- **Es kann dein Zuhause steuern.** Die Bestätigungsschranke deckt die gefährlichen Domains
  ab, aber ein KI-Agent mit Zugriff auf Dienstaufrufe ist ein Risiko, das du bewusst
  eingehen solltest. Lies vorher [SECURITY.md](SECURITY.md) und
  [docs/security.md](docs/security.md).

## Installation

[![Home Assistant öffnen und das Repository hinzufügen](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Funpaved028%2Fha-claw)

1. In Home Assistant unter **Einstellungen → Add-ons → Add-on-Store → ⋮ → Repositories**
   diese URL eintragen:

   ```text
   https://github.com/unpaved028/ha-claw
   ```

2. **HA-Claw** aus dem daraufhin erscheinenden Store-Eintrag installieren.
3. Im Reiter **Konfiguration** deinen OpenRouter-API-Key in `openrouter_api_key` eintragen.
4. *(Optional)* `telegram_bot_token` und `telegram_allowed_user_ids` setzen, um den Bot zu
   aktivieren.
5. Add-on starten. HA-Claw erscheint in der Seitenleiste und begrüßt dich mit einem kurzen
   Einrichtungsgespräch.

Voraussetzung ist Home Assistant OS oder Supervised auf `aarch64` oder `amd64`. Das Image
wird bei der ersten Installation auf deinem Gerät gebaut; auf einem Raspberry Pi dauert das
einige Minuten.

Die ausführliche Anleitung — inklusive Telegram-Bot anlegen und eigene User-ID finden —
steht im **[Handbuch](ha-claw/DOCS.de.md)**.

## Konfiguration

| Option | Pflicht | Standard | Beschreibung |
| --- | --- | --- | --- |
| `openrouter_api_key` | ja | — | API-Key von [openrouter.ai](https://openrouter.ai) |
| `openrouter_default_model` | nein | `anthropic/claude-haiku-4.5` | Modell, solange keine Stufe überschrieben ist |
| `openai_api_key` | nein | — | Eigener OpenAI-Key, nur für Telegram-Sprachnachrichten (Whisper) |
| `telegram_bot_token` | nein | — | Bot-Token von [@BotFather](https://t.me/BotFather) |
| `telegram_allowed_user_ids` | bedingt | — | User-IDs mit Komma getrennt; Pflicht, sobald ein Bot-Token gesetzt ist |
| `log_level` | nein | `info` | `debug`, `info`, `warn`, `error` |

## Dokumentation

| Dokument | Sprache | Für wen |
| --- | --- | --- |
| [ha-claw/DOCS.de.md](ha-claw/DOCS.de.md) | Deutsch | **Benutzer** — Einrichtung, Bedienung, Systemzustand, Fehlersuche |
| [ha-claw/CHANGELOG.md](ha-claw/CHANGELOG.md) | Deutsch/Englisch | Versionshistorie |
| [docs/README.md](docs/README.md) | Englisch | Technische Referenz (Übersicht) |
| [docs/roadmap.md](docs/roadmap.md) | Englisch | Vision und Planung |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Englisch | Mitarbeiten am Projekt |

## Mitmachen

Issues und Pull Requests sind willkommen. Fang mit [CONTRIBUTING.md](CONTRIBUTING.md) an —
dort steht der lokale Entwicklungsablauf, die eine Datei die du niemals von Hand ändern
darfst (`src/web/dashboard.ts`, sie wird generiert) und was die CI bei jedem Push prüft.

Wenn du ein KI-Coding-Agent in diesem Repository bist: lies [AGENTS.md](AGENTS.md).

## Lizenz

[MIT](LICENSE) © Rene Jung

HA-Claw ist ein Community-Projekt. Es steht in keiner Verbindung zum Home-Assistant-Projekt,
zu Nabu Casa, OpenRouter, Anthropic, OpenAI, Google oder Telegram und wird von diesen weder
unterstützt noch betreut.
