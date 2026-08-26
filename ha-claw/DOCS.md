# HA-Claw Add-on Documentation

## Was ist HA-Claw?

HA-Claw ist ein lokaler KI-Assistent, der als Home Assistant Add-on läuft. Er verbindet dein Smart Home mit einem KI-Agenten, der:

- **Geräte steuern** kann (Licht, Thermostat, Schalter – mit Bestätigung!)
- **Zustände abfragen** kann (Temperatur, Fensterstatus, etc.)
- **Notizen speichern** und **Gedächtnis aufbauen** kann
- **Timer & Erinnerungen** setzen kann ("Erinnere mich in 30min an den Müll")
- **Proaktive Benachrichtigungen** via Telegram senden kann
- Den **Systemzustand** im Blick behält (nicht erreichbare Geräte, tote Sensoren, schwache Batterien)
- Per **Telegram** oder **Web-Chat** erreichbar ist
- Mit jeder Interaktion **dazulernt** und besser wird

## Konfiguration

| Option                      | Pflicht | Beschreibung                                                     |
| --------------------------- | ------- | ---------------------------------------------------------------- |
| `openrouter_api_key`        | ✅      | Dein OpenRouter API-Key ([openrouter.ai](https://openrouter.ai)) |
| `openrouter_default_model`  | ❌      | LLM Model (Standard: `anthropic/claude-haiku-4.5`)               |
| `openai_api_key`            | ❌      | Eigener OpenAI-Key, nur für Telegram-Sprachnachrichten nötig     |
| `telegram_bot_token`        | ❌      | Telegram Bot Token (von @BotFather)                              |
| `telegram_allowed_user_ids` | ❌\*    | Telegram User-IDs die Zugriff haben (\*Pflicht wenn Bot aktiv)   |
| `log_level`                 | ❌      | `debug`, `info`, `warn`, `error` (Standard: `info`)              |

### Sprachnachrichten (Telegram)

Sprachnachrichten werden per OpenAI Whisper transkribiert. Das läuft **nicht**
über OpenRouter, sondern braucht einen eigenen OpenAI-API-Key in
`openai_api_key`. Ohne diesen Key antwortet der Bot auf Sprachnachrichten mit
einem Hinweis; Textnachrichten funktionieren unabhängig davon.

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

## Systemzustand

Unter _Einstellungen → Systemzustand_ siehst du drei Prüfungen mit ihrem
aktuellen Stand, den betroffenen Entities und einem Hinweis, was zu tun ist:

- **Geräte nicht erreichbar** – Entities im Zustand `unavailable`
- **Sensoren seit 48 h unverändert** – möglicher Batterie- oder Verbindungsausfall
- **Batterie unter 20 %** – Batterien, die gewechselt werden sollten

Diese Prüfungen landen absichtlich **nicht** im Backlog. Ein Backlog-Eintrag ist
ein Vorhaben, das irgendwann erledigt ist – ein paar dauerhaft nicht
erreichbare Geräte sind dagegen in vielen Installationen der Normalzustand und
würden dort für immer stehen bleiben. Sie werden deshalb bei Bedarf berechnet
und live angezeigt; du findest sie auch in `/status` im Telegram-Bot.

Telegram meldet sich nur, wenn sich etwas **verschlechtert**: wenn eine Prüfung
ihre Stufe wechselt (grün → gelb → rot) oder sich der Wert seit der letzten
Meldung mindestens verdoppelt hat. Eine Verbesserung wird still vermerkt.

Bleiben Geräte dauerhaft in der Liste, sind es meist Reste entfernter Hardware.
Solche Entities in Home Assistant zu löschen ist der einzige Weg, sie
loszuwerden – HA-Claw kann nicht erkennen, ob ein Gerät nur gerade offline oder
längst im Elektroschrott ist.

### Backlog aufräumen

Im selben Bereich findest du „Duplikate entfernen". Vor Version 0.9.3 legte die
Analyse für denselben Befund bei jedem Durchlauf einen neuen Task an, weil der
Abgleich über den Titel lief und der Titel eine wechselnde Anzahl enthält. Der
Knopf räumt diese Altlasten auf: doppelte Analyse-Einträge und die alten
Einträge der drei Prüfungen, die jetzt oben stehen. Deine eigenen Tasks und
deine Entscheidungen (freigegeben, abgelehnt, zurückgestellt) bleiben erhalten.

## Daten & Backup

Alle Daten liegen in `/data/store/` und werden automatisch von Home Assistant Backups gesichert:

- **notes** – Notizen und Wissen
- **conversations** – Chat-Verlauf
- **memory** – Agent-Langzeitgedächtnis
- **scheduler** – Geplante Jobs und Timer
- **backlog** – Verbesserungsvorschläge
- **learning** – Gelernte Korrekturen und Regeln
- **system-health.json** – Merkposten, welcher Zustand zuletzt gemeldet wurde

## Sicherheit bei Geraetesteuerung

Alltaegliche Geraete (Licht, Schalter, Klima, Rollos, Medienplayer) steuert
HA-Claw direkt. Eine Bestaetigung ist immer erforderlich bei:

- Schloessern, Alarmanlagen, Automationen und Loeschungen
- Skripten und Buttons — ihre Wirkung laesst sich vorab nicht pruefen
- Rollos/Toren mit `device_class` `garage`, `gate` oder `door`
- Szenen, die ein Schloss oder eine Alarmanlage mitschalten

So bestaetigst du:

- **Telegram**: Inline-Buttons (Ja/Nein) direkt im Chat. Nur wer die Aktion
  ausgeloest hat, kann sie bestaetigen.
- **Web UI**: Bestaetigungs-Modal mit Details zur geplanten Aktion. Automatische
  Ablehnung nach 60 Sekunden. Mehrere gleichzeitige Anfragen werden als Warteschlange
  abgearbeitet.

## Raumstruktur & Automationen

HA-Claw versteht die räumliche Struktur deines Zuhauses:

- **Stockwerke → Bereiche → Geräte**: Der Bot kennt die Zuordnung von Geräten zu Räumen und Räumen zu Stockwerken
- **Gruppen**: Der Bot kann `group.*` Entities auflösen und die einzelnen Mitglieder anzeigen
- **Automationen**: Der Bot kann Automations-Konfigurationen lesen (Trigger, Bedingungen, Aktionen) und in einfacher Sprache erklären

Beispiele:

- "Welche Geräte sind im Wohnzimmer?"
- "Zeig mir alle Räume im Obergeschoss"
- "Was macht die Automation Bewegungslicht Flur?"
- "Welche Geräte sind in der Gruppe Wohnzimmer?"

## Support

Issues & Feature Requests: [GitHub Repository](https://github.com/unpaved028/ha-claw)
