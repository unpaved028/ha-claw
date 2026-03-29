# HA-Claw Add-on Documentation

## Was ist HA-Claw?

HA-Claw ist ein lokaler KI-Assistent, der als Home Assistant Add-on läuft. Er verbindet dein Smart Home mit einem KI-Agenten, der:

- **Geräte steuern** kann (Licht, Thermostat, Schalter – mit Bestätigung!)
- **Zustände abfragen** kann (Temperatur, Fensterstatus, etc.)
- **Notizen speichern** und **Gedächtnis aufbauen** kann
- Per **Telegram** oder **Web-Chat** erreichbar ist

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

## Daten & Backup

Alle Daten liegen in `/data/store/` und werden automatisch von Home Assistant Backups gesichert. Es gibt drei Sammlungen:
- **notes** – Notizen und Wissen
- **conversations** – Chat-Verlauf
- **memory** – Agent-Langzeitgedächtnis

## Support

Issues & Feature Requests: [GitHub Repository](https://github.com/unpaved028/ha-claw)
