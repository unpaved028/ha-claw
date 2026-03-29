# HA-Claw Add-on Documentation

## Was ist HA-Claw?

HA-Claw ist ein lokaler KI-Assistent, der als Home Assistant Add-on läuft. Er verbindet dein Smart Home mit einem KI-Agenten, der:

- **Geräte steuern** kann (Licht, Thermostat, Schalter – mit Bestätigung!)
- **Zustände abfragen** kann (Temperatur, Fensterstatus, etc.)
- **Notizen speichern** und **Gedächtnis aufbauen** kann
- **Timer & Erinnerungen** setzen kann ("Erinnere mich in 30min an den Müll")
- **Proaktive Benachrichtigungen** via Telegram senden kann
- Per **Telegram** oder **Web-Chat** erreichbar ist
- Mit jeder Interaktion **dazulernt** und besser wird

## Konfiguration

| Option | Pflicht | Beschreibung |
|--------|---------|-------------|
| `openrouter_api_key` | ✅ | Dein OpenRouter API-Key ([openrouter.ai](https://openrouter.ai)) |
| `openrouter_default_model` | ❌ | LLM Model (Standard: `openrouter/free`) |
| `telegram_bot_token` | ❌ | Telegram Bot Token (von @BotFather) |
| `telegram_allowed_user_ids` | ❌* | Telegram User-IDs die Zugriff haben (*Pflicht wenn Bot aktiv) |
| `log_level` | ❌ | `debug`, `info`, `warn`, `error` (Standard: `info`) |

## Sicherheit & Datenfluss

- **Whitelist-Only**: Nur eingetragene Telegram User-IDs können mit dem Bot interagieren
- **Safety Gate**: Gefährliche Aktionen (Gerät steuern, Daten löschen) erfordern per Telegram Inline-Button eine Bestätigung
- **Secret Redaction**: API-Keys und Tokens werden in Logs automatisch unkenntlich gemacht
- **Kein offener Port**: Web-UI läuft nur über HA Ingress (kein externer Zugriff)
- **Cloud-LLM**: Chat-Nachrichten werden an den gewählten LLM-Provider (z.B. OpenRouter) gesendet. Alle Aktionen (Gerätesteuerung, Speicherung) werden lokal auf deinem Home Assistant ausgeführt.

## Ersteinrichtung (Onboarding)

Beim ersten Start führt der Bot ein natürliches Gespräch, um dich kennenzulernen:
- Wie soll der Bot heißen?
- Wie heißt du?
- Welchen Kommunikationsstil bevorzugst du? (Direktheit, Formalität, Humor, Ausführlichkeit)

Nach der Einrichtung stellt sich der Bot vor und bietet an, eine wöchentliche automatische Hausanalyse einzurichten.

## Timer & Erinnerungen

Du kannst einmalige Timer und Erinnerungen erstellen:
- "Erinnere mich in 30 Minuten an den Müll"
- "Schalte in 10 Minuten das Licht im Keller aus"
- "Um 14:30 Bescheid sagen, dass der Kuchen fertig ist"

Die Erinnerungen werden automatisch per Telegram zugestellt.

## Wiederkehrende Jobs

Für regelmäßige Aufgaben:
- `every 5m` – alle 5 Minuten
- `daily 07:00` – täglich um 07:00
- `weekdays 08:00` – Mo–Fr um 08:00
- `weekends 10:00` – Sa–So um 10:00
- `weekly mon 08:00` – jeden Montag um 08:00

## Daten & Backup

Alle Daten liegen in `/data/store/` und werden automatisch von Home Assistant Backups gesichert:
- **notes** – Notizen und Wissen
- **conversations** – Chat-Verlauf
- **memory** – Agent-Langzeitgedächtnis
- **scheduler** – Geplante Jobs und Timer
- **backlog** – Verbesserungsvorschläge
- **learning** – Gelernte Korrekturen und Regeln

## Support

Issues & Feature Requests: [GitHub Repository](https://github.com/unpaved028/ha-claw)
