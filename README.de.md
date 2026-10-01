<div align="center">

<img src="logo.png" alt="HA-Claw" width="140">

# HA-Claw

**Ein Home-Assistant-Add-on, das deine Installation pflegt — keine zweite Sprachassistenz.**

Home Assistant ist gut im Ausführen. Es ist nicht dafür gebaut, sich um sich selbst zu
kümmern. HA-Claw achtet auf Drift: Geräte, die offline gegangen sind, Automationen, die
nach einer Umbenennung still kaputt sind, Batterien, Backups und Räume mit Sensoren aber
ohne Automation. Es schlägt Fixes vor, die du freigibst. Chat, in der Seitenleiste oder
über Telegram, ist der Weg für Rückfragen.

[![CI](https://github.com/unpaved028/ha-claw/actions/workflows/ci.yml/badge.svg)](https://github.com/unpaved028/ha-claw/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Add-on-Version](https://img.shields.io/badge/add--on-v1.5.1-0aa8d2.svg)](ha-claw/CHANGELOG.md)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5.svg?logo=home-assistant&logoColor=white)](https://www.home-assistant.io/)

[Installation](#installation) · [Handbuch](ha-claw/DOCS.de.md) · [Roadmap](docs/roadmap.md) · [English](README.md)

</div>

> **Hinweis zur Sprache:** Diese Seite ist die deutsche Fassung von [README.md](README.md).
> Das vollständige Benutzerhandbuch gibt es auf Deutsch unter
> [ha-claw/DOCS.de.md](ha-claw/DOCS.de.md). Die technische Referenz unter [`docs/`](docs/README.md)
> wird nur auf Englisch gepflegt.

---

## Was es macht

Status, Pflege und der Wochenbericht sind das Produkt. Chat ist der Weg, nachzufragen warum
eine Karte rot ist oder einen Vorschlag freizugeben. Wenn du nur „Küchenlicht an" willst,
nimm Assist — das ist schneller, billiger und privater.

Wenn du doch fragst, fährt HA-Claw eine **agentische Schleife**: Entities suchen,
Automation lesen, Dienst aufrufen, Zustand prüfen, nächsten Schritt entscheiden — bis zu
zehn Mal. So beantwortet es *„im Wohnzimmer ist es kalt, steht irgendwo ein Fenster offen?"*
statt einen Satz auf eine vordefinierte Absicht abzubilden.

| | |
| --- | --- |
| **Behält das Langweilige im Blick** | Nicht erreichbare Geräte, Sensoren die nicht mehr melden, Batterien unter 20 %, Backup-Alter und freier Speicherplatz — Live-Prüfungen, keine Aufgabenliste die nie leer wird. |
| **Schlägt Verbesserungen vor** | Energieverschwendung, Sicherheitslücken, fehlende Rollladen-Automationen und Namensdrift, als prüfbare Aufgaben. |
| **Fragt, bevor es gefährlich wird** | Schlösser, Alarmanlagen, Skripte, Buttons, Garagentore und Änderungen an Automationen laufen über eine Bestätigung: Inline-Tastatur in Telegram, Dialog in der Web-UI. |
| **Kennt die Struktur deines Zuhauses** | Stockwerk → Bereich → Entity, Auflösung von Gruppen, Sensorsuche über `device_class`. Der Agent weiß, *welches* Fenster offen ist, nicht nur dass irgendein `binary_sensor` auf `on` steht. |
| **Handelt und prüft nach** | Jeder Dienstaufruf erfasst den Zustand vor und nach der Aktion. Hat das Gerät nicht reagiert, sagt der Agent das — statt Erfolg zu behaupten. |
| **Zwei Oberflächen, ein Gespräch** | Dashboard in der Seitenleiste und Telegram-Bot lesen und schreiben denselben Verlauf. |
| **Lernt dazu** | Korrekturen, wiederkehrende Muster und frühere Tool-Fehler fließen in den System-Prompt zurück. |

## Vor der Installation

HA-Claw arbeitet mit deinem eigenen API-Key. Drei Dinge solltest du vorher wissen:

- **Es rechnet nicht lokal.** Deine Nachrichten, der Entity-Cache und die Tool-Ergebnisse
  gehen über [OpenRouter](https://openrouter.ai) an einen LLM-Anbieter. *Aktionen* laufen
  lokal gegen dein Home Assistant, das *Nachdenken* nicht. Wenn eine Verarbeitung beim
  Modellanbieter für dich nicht in Frage kommt, ist dieses Add-on das falsche Werkzeug.
- **Chat kostet pro Nachricht Geld.** Status, Care und der Wochenbericht rufen kein Modell
  auf und starten ohne Key. Ein Chat-Turn schickt die Tool-Liste mit und kostet mehr als
  einen Bruchteil eines Cents. Telegram `/status` zeigt die von OpenRouter gemeldete
  Belastung, wenn die Antwort sie enthält, und kennzeichnet die Preistabelle als Schätzung,
  wenn sie fehlt. Die Status-Seite zeigt keinen Dollarbetrag. Das ist nicht die
  OpenRouter-Rechnung.
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
3. Add-on starten. Die erste Seite ist Status. Ein OpenRouter-Key in `openrouter_api_key`
   ergänzt Chat und Aufgabenlösungen.
4. *(Optional)* `telegram_bot_token` und `telegram_allowed_user_ids` setzen, um den Bot zu
   aktivieren.

Voraussetzung ist Home Assistant OS oder Supervised auf `aarch64` oder `amd64`. Das Image
wird bei der ersten Installation auf deinem Gerät gebaut; auf einem Raspberry Pi dauert das
einige Minuten.

Die ausführliche Anleitung — inklusive Telegram-Bot anlegen und eigene User-ID finden —
steht im **[Handbuch](ha-claw/DOCS.de.md)**.

## Konfiguration

| Option | Pflicht | Standard | Beschreibung |
| --- | --- | --- | --- |
| `openrouter_api_key` | nein | — | API-Key von [openrouter.ai](https://openrouter.ai). Chat und Aufgabenlösungen brauchen ihn; Status, Care und der Bericht nicht. |
| `openrouter_default_model` | nein | `anthropic/claude-haiku-4.5` | Modell, solange keine Stufe überschrieben ist |
| `openai_api_key` | nein | — | Eigener OpenAI-Key, nur für Telegram-Sprachnachrichten (Whisper) |
| `telegram_bot_token` | nein | — | Bot-Token von [@BotFather](https://t.me/BotFather) |
| `telegram_allowed_user_ids` | bedingt | — | User-IDs mit Komma getrennt; Pflicht, sobald ein Bot-Token gesetzt ist |
| `log_level` | nein | `info` | `debug`, `info`, `warn`, `error` |
| `language` | nein | `auto` | `auto` (Home-Assistant-Locale), `en` oder `de` |
| `notify_entity` | nein | — | Volle `notify.*`-ID; Spalte HA Notify unter Settings → Benachrichtigungen |

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
