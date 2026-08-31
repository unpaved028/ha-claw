# HA-Claw — Handbuch

_English version: [DOCS.md](DOCS.md)_

- [Was HA-Claw macht](#was-ha-claw-macht)
- [Was du vorher wissen solltest](#was-du-vorher-wissen-solltest)
- [Installation](#installation)
- [Konfiguration](#konfiguration)
- [Telegram einrichten](#telegram-einrichten)
- [Erster Start](#erster-start)
- [Mit dem Assistenten reden](#mit-dem-assistenten-reden)
- [Das Dashboard](#das-dashboard)
- [Systemzustand](#systemzustand)
- [Aufgaben](#aufgaben)
- [Erinnerungen und Zeitpläne](#erinnerungen-und-zeitpläne)
- [Gedächtnis und Lernen](#gedächtnis-und-lernen)
- [Telegram-Befehle](#telegram-befehle)
- [Sicherheit und Bestätigungen](#sicherheit-und-bestätigungen)
- [Kosten](#kosten)
- [Daten und Backup](#daten-und-backup)
- [Fehlerbehebung](#fehlerbehebung)
- [Hilfe bekommen](#hilfe-bekommen)

## Was HA-Claw macht

HA-Claw ist ein KI-Assistent in deiner Home-Assistant-Seitenleiste. Du redest mit ihm in
normaler Sprache, und er macht drei Arten von Dingen:

**Er beantwortet Fragen zu deinem Zuhause.** Nicht nur „wie warm ist es", sondern „steht oben
noch ein Fenster offen", „was macht die Bewegungslicht-Automation im Flur eigentlich", „welche
Geräte sind in der Wohnzimmer-Gruppe". Er kennt deine Stockwerke, Bereiche, Entities und deren
aktuellen Zustand.

**Er steuert Geräte und prüft nach, ob es geklappt hat.** Nach jedem Dienstaufruf liest er den
Zustand erneut. Ist das Licht nicht angegangen, sagt er das — statt Erfolg zu behaupten.

**Er kümmert sich um deine Installation.** Im Hintergrund prüft er, ob Geräte offline gegangen
sind, Sensoren nichts mehr melden, Batterien zur Neige gehen, Backups ausbleiben oder der
Speicherplatz knapp wird. Getrennt davon sucht er nach Verbesserungen — ein Raum mit
Bewegungsmeldern aber ohne Bewegungslicht-Automation, ein Thermostat auf 24 °C im Juli,
offene Fenster bei laufender Heizung — und legt sie dir zur Freigabe vor.

Er kann auch Automationen und Skripte schreiben. Das erfordert immer deine ausdrückliche
Bestätigung.

## Was du vorher wissen solltest

Drei Dinge, damit es keine Überraschungen gibt.

**Deine Daten gehen an einen LLM-Anbieter.** Jede Nachricht, dazu eine komprimierte Liste
deiner Bereiche und Entities mit ihrem aktuellen Zustand, dazu die Ergebnisse von allem was der
Assistent nachgeschlagen hat — das alles geht über [OpenRouter](https://openrouter.ai) an ein
Sprachmodell. Die _Aktionen_ laufen lokal auf deinem Home Assistant. Das _Nachdenken_ nicht.
Wenn das in deinem Haushalt nicht in Frage kommt, hilft keine Einstellung — dann ist dieses
Add-on das falsche Werkzeug.

**Es kostet Geld.** Du bringst deinen eigenen OpenRouter-Key mit und zahlst pro Anfrage. Mit
dem Standardmodell `anthropic/claude-haiku-4.5` kostet eine normale Frage einen Bruchteil
eines Cents. Auch die Hintergrundanalyse und die Aufgabenverarbeitung verbrauchen Tokens. Setz
ein Ausgabenlimit auf deinen OpenRouter-Key.

**Er kann dein Zuhause steuern.** Die Bestätigungsschranke deckt Schlösser, Alarmanlagen,
Skripte, Buttons, Garagentore und Änderungen an Automationen ab. Alles andere — Licht,
Schalter, Klima, Rollos, Medienplayer — macht er ohne Rückfrage. Das ist eine bewusste
Abwägung, der du zustimmen solltest, bevor du anfängst.

## Installation

1. In Home Assistant: **Einstellungen → Add-ons → Add-on-Store → ⋮ → Repositories**.
2. `https://github.com/unpaved028/ha-claw` eintragen.
3. **HA-Claw** aus dem erscheinenden Eintrag installieren.

Das Image wird bei der Installation auf deinem Gerät kompiliert. Auf einem Raspberry Pi dauert
das ein paar Minuten; das ist normal und passiert nur bei Installation und Update.

Voraussetzung: Home Assistant OS oder Supervised auf `aarch64` oder `amd64`.

## Konfiguration

Im Reiter **Konfiguration** des Add-ons.

| Option                      | Pflicht       | Standard                     | Wozu                                                                                                       |
| --------------------------- | ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `openrouter_api_key`        | **ja**        | —                            | Dein Key von [openrouter.ai](https://openrouter.ai). Ohne startet das Add-on nicht.                        |
| `openrouter_default_model`  | nein          | `anthropic/claude-haiku-4.5` | Welches Sprachmodell benutzt wird. Später auch in der Web-UI änderbar, ohne Neustart.                      |
| `openai_api_key`            | nein          | —                            | Eigener OpenAI-Key. **Nur** für die Transkription von Telegram-Sprachnachrichten nötig. Sonst leer lassen. |
| `telegram_bot_token`        | nein          | —                            | Aktiviert den Telegram-Bot.                                                                                |
| `telegram_allowed_user_ids` | siehe Hinweis | —                            | Wer den Bot benutzen darf. **Pflicht**, sobald ein Token gesetzt ist — sonst startet das Add-on nicht.     |
| `log_level`                 | nein          | `info`                       | Für Fehlermeldungen auf `debug` stellen.                                                                   |

### Modellwahl

| Modell                         | Wofür                                                                       |
| ------------------------------ | --------------------------------------------------------------------------- |
| `anthropic/claude-haiku-4.5`   | Der Standard. Schnell, günstig, zuverlässig beim Werkzeugeinsatz.           |
| `anthropic/claude-sonnet-5`    | Besseres Denken für Automationen. Deutlich teurer.                          |
| `anthropic/claude-opus-5`      | Stärkstes Denken. Nur für komplexe Automationsarbeit sinnvoll.              |
| `google/gemini-3.7-flash`      | Gutes Preis-Leistungs-Verhältnis, kommt mit mehrstufigen Abläufen gut klar. |
| `google/gemini-3.5-flash-lite` | Günstigste Google-Option.                                                   |
| `openai/gpt-5.6-luna`          | Günstige OpenAI-Option.                                                     |
| `openai/gpt-5.6-sol`           | Stärkere OpenAI-Option für Automationsarbeit.                               |
| `deepseek/deepseek-v4-flash`   | Sehr günstig, sehr grosser Kontext.                                         |
| `x-ai/grok-4.6`                | Starkes Denken.                                                             |
| `openrouter/auto`              | OpenRouter wählt pro Anfrage.                                               |
| `openrouter/free`              | Kostenlose Modelle. Qualität und Werkzeugunterstützung schwanken stark.     |

Wenn sich der Assistent merkwürdig verhält — erfundene Entity-IDs, seltsame Werkzeug-Syntax
mitten in der Antwort — probier zuerst ein stärkeres Modell. Schwache Modelle tun sich mit
Tool Calling schwer.

Unter **Settings → Model Forge** kannst du jeder Komplexitätsstufe ein eigenes Modell
zuweisen: ein günstiges zum Nachschlagen, ein stärkeres zum Schreiben von Automationen.

## Telegram einrichten

Optional, aber es ist der Weg zu Benachrichtigungen — und zu deinem Zuhause von unterwegs.

**1. Bot anlegen.** [@BotFather](https://t.me/BotFather) in Telegram öffnen, `/newbot`
schicken, den Fragen folgen. Das Token kommt in `telegram_bot_token`.

**2. Eigene User-ID herausfinden.** [@userinfobot](https://t.me/userinfobot) öffnen und
irgendeine Nachricht schicken. Er antwortet mit deiner Nummer. Die kommt in
`telegram_allowed_user_ids`.

Für mehrere Personen die IDs mit Komma trennen: `123456789,987654321`.

**3. Add-on neu starten** und dem Bot eine Nachricht schicken.

Wer nicht auf der Liste steht, kann den Bot nicht benutzen — Nachrichten anderer Konten werden
ohne Antwort verworfen. Alle auf der Liste sind aber vollwertige Bediener: Es gibt keine
Abstufungen. Nimm lieber einen privaten Chat, ausser du willst, dass jeder in einer Gruppe
deine Haustür aufschliessen kann.

### Sprachnachrichten

Telegram-Sprachnachrichten werden mit OpenAI Whisper transkribiert. Dafür braucht es einen
eigenen Key in `openai_api_key` — das läuft **nicht** über OpenRouter. Ohne den Key antwortet
der Bot auf Sprachnachrichten mit einem Hinweis; Textnachrichten sind davon unberührt.

## Erster Start

Add-on starten und **HA-Claw** in der Seitenleiste öffnen. Statt eines Formulars begrüsst dich
ein kurzes Einrichtungsgespräch:

- Wie soll der Assistent heissen?
- Wie soll er dich nennen?
- Wie soll er mit dir reden — direkt oder behutsam, förmlich oder locker, humorvoll oder
  trocken, knapp oder ausführlich?

Antworte in normaler Sprache; er zieht sich heraus was er braucht. Danach stellt er seine
Fähigkeiten vor und bietet an, eine wöchentliche automatische Hausanalyse einzurichten.

Alles davon lässt sich später unter **Settings → Profile** ändern.

## Mit dem Assistenten reden

Ein paar Beispiele, damit du ein Gefühl dafür bekommst, was geht:

**Fragen zum Zustand**

> Steht oben noch ein Fenster offen?
> Welche Geräte sind im Wohnzimmer?
> Zeig mir alle Räume im Obergeschoss.
> Wie warm ist es im Bad?

**Steuern**

> Mach das Licht im Keller aus.
> Stell das Wohnzimmer auf 21 Grad.
> Fahr alle Rollos auf der Südseite runter.

**Die eigene Installation verstehen**

> Was macht die Automation „Bewegungslicht Flur" eigentlich?
> Welche Geräte sind in der Gruppe Wohnzimmer?
> Warum ist heute Morgen die Heizung angegangen?

**Verbessern**

> Analysier mein Zuhause.
> Gibt es etwas, das ich in Ordnung bringen sollte?
> Richte eine Automation ein, die bei Sonnenuntergang die Rollos schliesst.

**Erinnerungen**

> Erinnere mich in 30 Minuten an den Müll.
> Schalte in 10 Minuten das Kellerlicht aus.
> Sag mir um 14:30 Bescheid, dass der Kuchen fertig ist.

### Wenn er etwas nicht findet

Sagt er, er finde ein Gerät nicht, das es definitiv gibt, ist meist der Entity-Cache veraltet
— der baut sich alle 30 Minuten neu auf. Unter Settings **Cache aktualisieren** drücken, oder
einfach nochmal nachfragen lassen.

Geräte erscheinen nur mit dem richtigen Raum, wenn sie in Home Assistant einem Bereich
zugeordnet sind. Bereiche zu pflegen ist die mit Abstand wirksamste Verbesserung dafür, wie
gut HA-Claw dein Zuhause versteht.

## Das Dashboard

Drei Bereiche in der oberen Navigation.

**Chat** — das Gespräch. Der Fortschritt ist live sichtbar: welches Werkzeug gerade läuft, was
es gefunden hat, wann es fertig ist. Es gibt einen Mikrofon-Knopf für Spracheingabe
(browserbasiert, deutsch).

**Status** — drei Reiter:

- _System Health_ — die unten beschriebenen Dauerprüfungen.
- _Tasks_ — Verbesserungsvorschläge, die auf deine Entscheidung warten.
- _Logs_ — das Add-on-Protokoll und unter Actions jeder Dienstaufruf mit Rückgängig-Knopf.

**Settings** — drei Bereiche:

- _Model Forge_ — Standardmodell und ein Modell je Komplexitätsstufe.
- _Tool Vault_ — einzelne Fähigkeiten an- und abschalten. Ein abgeschaltetes Werkzeug wird dem
  Assistenten gar nicht erst angeboten. Schaltest du die gefährlichen ab, wird HA-Claw
  schreibgeschützt.
- _Profile_ — Namen und Gesprächsstil.

Änderungen wirken ab der nächsten Nachricht. Kein Neustart nötig.

## Systemzustand

**Status → System Health** zeigt Dauerprüfungen mit ihrem aktuellen Stand und einem Hinweis,
was zu tun ist. Beim Öffnen steht die letzte Prüfung sofort da (Uhrzeit unten). HA-Claw
aktualisiert den Bericht nach dem Start und stündlich. **Neu prüfen** holt auf Wunsch einen
frischen Stand — nur dann wartet die Oberfläche.

| Prüfung                                 | Was sie bedeutet                                                                       | Gelb                             | Rot                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------ |
| **Geräte nicht erreichbar**             | Physische Geräte, deren Entities seit weniger als 30 Tagen `unavailable` sind          | ab 3                             | ab 15                                |
| **Seit 30 Tagen nicht erreichbar**      | Dasselbe, aber die letzte Meldung ist 30 Tage her — vermutlich entsorgt                | ab 1                             | ab 8                                 |
| **Sensoren seit 48 h ohne Meldung**     | Temperatur, Luftfeuchte, Luftdruck oder Luftqualität ohne neue Werte                   | ab 5                             | ab 25                                |
| **Batterie unter 20 %**                 | Batterien, die gewechselt werden sollten                                               | ab 1                             | ab 8                                 |
| **Kaputte Referenzen**                  | Automationen, Skripte oder Szenen, die eine Entity nennen, die es nicht mehr gibt      | ab 1                             | ab 8                                 |
| **Automationen und Skripte mit Fehler** | Letzter Trace mit Fehler, oder die Automation/das Skript selbst ist `unavailable`      | ab 1                             | ab 5                                 |
| **Updates liegen bereit**               | `update.*`-Entities mit verfügbarem Update                                             | ab 1                             | ab 8, oder Core / OS / Supervisor    |
| **Integrationen laden nicht**           | Config Entries im Setup-Fehler oder Retry. Overlap mit Home Assistant Repairs          | ab 1                             | ab 3                                 |
| **Funk wird leise**                     | Zigbee-`last_seen` älter als 48 h, oder Linkqualität 20 oder weniger                   | ab 3                             | ab 10                                |
| **Add-ons laufen nicht**                | Add-ons mit Autostart, die gestoppt sind, plus jedes Add-on im Fehlerzustand           | ab 1                             | ab 3                                 |
| **Recorder / Historie**                 | Historie wird nicht geschrieben, der Recorder-Thread steht, oder der Rückstau ist groß | Rückstau ≥ 1 000, oder Migration | Recorder aus, oder Rückstau ≥ 10 000 |
| **Nur wiederhergestellt**               | Entities, die nur aus einem Restore stammen und seit diesem Start nicht gesehen wurden | ab 1                             | ab 15                                |
| **Backup**                              | Tage seit dem letzten Backup, das Home Assistant enthält                               | ab 7 Tagen, oder nur lokal       | ab 14 Tagen, oder gar kein Backup    |
| **Speicherplatz**                       | Freier Platz auf der HA-Datenpartition                                                 | siehe unten                      | siehe unten                          |

Karten sind nach Schwere sortiert: rot, dann gelb, dann grün. Jede Karte erklärt sich —
auch die grünen — und verlinkt in Home Assistant (Geräteseite, Updates, Backups,
Entity-Registry, Automations- oder Skript-Editor, Add-on, Integration). Wenn ein Wert sich
bewegt hat, steht der vorherige dabei.

**Kaputte Referenzen.** UI-Automationen und -Skripte werden vollständig gelesen. Automationen,
die nur in YAML liegen, prüft HA-Claw nur auf die `entity_id`-Attribute, die sie nach aussen
zeigen — nicht die ganze Datei. Die Karte sagt, wie viele vollständig gelesen wurden und wie
viele nur YAML sind — Grün heisst also nicht „wir haben nicht hingesehen“.

Gezählt werden **Geräte, nicht Entities**. Ein Zigbee-Fensterkontakt, der zusätzlich Batterie,
Spannung, Firmware und einen Identifizieren-Button meldet, zählt einmal, nicht zwölfmal. Klapp
eine Karte auf, um die einzelnen Entities unter dem Gerätenamen zu sehen.

**Stille Sensoren.** Ein geschlossenes Fenster, ein trockener Wassermelder oder ein
Regensensor ohne Regen ist kein Defekt. Diese Prüfung gilt nur für Sensoren, die sich auch
dann weiter melden sollten, wenn der Messwert gleich bleibt — Temperatur, Luftfeuchte,
Luftdruck und Luftqualität — und sie zählt die letzte Meldung an Home Assistant, nicht die
letzte Wertänderung.

**Backups.** Eine Kopie ausserhalb des Geräts reicht. HA-Claw akzeptiert jedes davon: einen
offiziellen Backup-Ort (Home Assistant Cloud, Google Drive, OneDrive, Synology, WebDAV, ein
NAS-Mount), das Add-on _Home Assistant Google Drive Backup_, oder _Samba Backup_. Zu den
anderen wird nicht gedrängt. Nur lokal gespeicherte Backups bleiben gelb, auch wenn sie frisch
sind — eine SD-Karte überlebt das Gerät nicht, in dem sie steckt.

**Speicherplatz.** Wird vom Supervisor gelesen, ganz ohne extra Sensor. Auf Flash-Speicher
(unter 128 GB, also SD-Karte oder eMMC) gelb unter 5 GB frei, rot unter 3 GB. Auf grösseren
Laufwerken zählt der Anteil: gelb unter 10 % frei, rot unter 5 %. Meldet das Laufwerk eine
Lebensdauer, warnt die Karte zusätzlich ab 90 % Verbrauch.

### Warum das keine Aufgaben sind

Eine Aufgabe ist etwas, das irgendwann erledigt ist. Ein paar dauerhaft nicht erreichbare
Geräte sind in vielen Installationen der Normalzustand und würden als Aufgabe für immer in der
Liste stehen bleiben. Deshalb werden diese Prüfungen bei Bedarf berechnet und als Zustand
angezeigt. Du findest sie auch in `/status` im Telegram-Bot.

Telegram meldet sich nur, wenn sich etwas **verschlechtert** — wenn eine Prüfung ihre Stufe
wechselt (grün → gelb → rot) oder sich ihr Wert seit der letzten Meldung mindestens verdoppelt
hat. Die zweite Regel fängt einen echten neuen Ausfall auch in einer Installation, die
dauerhaft rot steht. Verbesserungen werden still vermerkt.

Bleiben Geräte dauerhaft in der Liste, sind es meist Reste entfernter Hardware. Solche Entities
in Home Assistant zu löschen ist der einzige Weg, sie loszuwerden — HA-Claw kann nicht
unterscheiden zwischen „gerade offline" und „letztes Jahr entsorgt".

## Aufgaben

**Status → Tasks** enthält Verbesserungsvorschläge. Sie stammen aus der regelmässigen Analyse
oder daraus, dass du den Assistenten direkt fragst („analysier mein Zuhause"). Jeder Vorschlag
benennt den Ist-Zustand, den vorgeschlagenen Soll-Zustand und den erwarteten Nutzen.

Der Ablauf fragt bewusst zweimal:

1. **Vorgeschlagen** — du gibst frei, lehnst ab oder stellst zurück.
2. **Freigegeben** — der Assistent erarbeitet eine konkrete Lösung.
3. **Lösung vorgeschlagen** — du prüfst den tatsächlichen Plan und gibst ihn frei.
4. **Ausführung** — der Assistent setzt ihn um und meldet das Ergebnis.

Scheitert die Ausarbeitung oder die Ausführung dreimal, wird die Aufgabe als **Failed**
markiert statt endlos neu versucht. Unter Status → Tasks kannst du sie erneut anstoßen.

Die zweite Freigabe ist wichtig: Die _Idee_ einer Automation freizugeben ist etwas anderes, als
die _Automation freizugeben, die er geschrieben hat_. Lies die Lösung, bevor du sie freigibst —
ab dann arbeitet der Assistent mit seinem vollen Werkzeugkasten.

Solange du nichts freigibst, passiert nichts. Ein Leerlauf verbraucht keine Tokens.

### Duplikate entfernen

Unter Tasks gibt es den Knopf **Duplikate entfernen**. Vor Version 0.9.3 legte die Analyse für
denselben Befund bei jedem Durchlauf einen neuen Task an — der Abgleich lief über den Titel,
und der Titel enthält eine wechselnde Zahl. Der Knopf räumt diese Altlasten auf, zusammen mit
den alten Einträgen der drei Prüfungen, die inzwischen unter System Health stehen. Deine
eigenen Tasks und deine Entscheidungen (freigegeben, abgelehnt, zurückgestellt) bleiben
unangetastet.

## Erinnerungen und Zeitpläne

**Einmalige Erinnerungen** — einfach sagen:

> Erinnere mich in 30 Minuten an den Müll.
> Schalte in 10 Minuten das Kellerlicht aus.
> Sag mir um 14:30, dass der Kuchen fertig ist.

Die Zustellung läuft über Telegram. Relative Angaben (`5m`, `2h`, `1h30m`) und feste Uhrzeiten
(`14:30`, heute oder morgen) funktionieren beide.

**Wiederkehrende Jobs** laufen durch den Assistenten und können damit alles, was auch eine
Nachricht kann:

| Format             | Bedeutung                    |
| ------------------ | ---------------------------- |
| `every 5m`         | Alle 5 Minuten               |
| `every 2h`         | Alle 2 Stunden               |
| `daily 07:00`      | Täglich um 07:00             |
| `weekdays 08:00`   | Montag bis Freitag um 08:00  |
| `weekends 10:00`   | Samstag und Sonntag um 10:00 |
| `weekly mon 08:00` | Jeden Montag um 08:00        |

Ein guter Einstieg ist eine wöchentliche Analyse: _„Jeden Montag um 8 mein Zuhause analysieren
und mir das Ergebnis schicken."_ Jobs verwaltest du unter Status, oder du lässt sie dir vom
Assistenten auflisten.

## Gedächtnis und Lernen

**Gedächtniskarten** sind Dinge, die es wert sind, behalten zu werden: „das Gästezimmer ist der
kleine Raum im Obergeschoss", „die Pflanzen werden sonntags gegossen". Sag ihm, er soll sich
etwas merken, und er bringt es zurück, wenn es passt.

**Korrekturen** — wenn du ihm sagst, dass er etwas falsch gemacht hat, merkt er sich das und
wendet es beim nächsten Mal an. „Nein, das Badlicht ist die Decke, nicht der Spiegel."

**Regeln** sind dauerhafte Anweisungen: „nach 22 Uhr niemals das Schlafzimmerlicht anschalten".

**Muster** — wiederkehrende Handlungen, die ihm aufgefallen sind und aus denen
Automationsvorschläge werden können.

Alles Gelernte kannst du dir zeigen lassen, und alles liegt in deinem Home-Assistant-Backup.

## Telegram-Befehle

| Befehl    | Macht                                                                          |
| --------- | ------------------------------------------------------------------------------ |
| `/help`   | Was der Bot kann                                                               |
| `/status` | Laufzeit, Speicher, geschätzte Tokenkosten, Zusammenfassung des Systemzustands |
| `/rooms`  | Knöpfe für jeden Bereich — antippen für dessen Status                          |
| `/ping`   | Kurzer Lebenszeichen-Test                                                      |
| `/start`  | Begrüssung                                                                     |

Alles andere ist einfach Gespräch. Sprachnachrichten funktionieren, wenn `openai_api_key`
gesetzt ist. Geht etwas schief, gibt es einen **Nochmal versuchen**-Knopf.

## Sicherheit und Bestätigungen

Alltägliche Geräte — Licht, Schalter, Klima, Rollos, Medienplayer, Helfer — steuert er direkt.

**Eine Bestätigung ist immer nötig bei:**

- Schlössern und Alarmanlagen
- Automationen und Skripten, auch beim Bearbeiten
- Buttons — ihre Wirkung lässt sich vorher nicht prüfen
- Rollos/Toren mit `device_class` `garage`, `gate` oder `door`
- Szenen, die ein Schloss oder eine Alarmanlage mitschalten
- Löschen von Gespeichertem

**So bestätigst du:**

- **Telegram** — Ja/Nein-Knöpfe im Chat. Nur wer die Aktion ausgelöst hat, kann antworten.
  Nach 60 Sekunden automatisch abgelehnt.
- **Web-UI** — ein Dialog mit dem Werkzeug und seinen exakten Parametern. Ebenfalls 60
  Sekunden. Mehrere offene Anfragen reihen sich an, statt sich gegenseitig zu überschreiben.

Der Dialog zeigt absichtlich die rohe Entity-ID statt einer freundlichen Beschreibung. Die
Beschreibung käme von demselben Assistenten, dessen Entscheidung du gerade prüfst. Lies die
Entity-ID.

**Alles wird protokolliert.** Unter Status → Logs → Actions steht jeder Dienstaufruf mit
Ergebnis und Rückgängig-Knopf. Nach etwas Unerwartetem ist das die Aufzeichnung dessen, was
tatsächlich passiert ist.

## Kosten

Unter **Status** siehst du den kumulierten Tokenverbrauch und eine Kostenschätzung in
US-Dollar, ebenso über `/status` in Telegram.

Was Tokens kostet:

- Jede Nachricht, die du schickst.
- Jeder Lauf der Hintergrundanalyse.
- Jede Aufgabe, an der der Assistent nach deiner Freigabe arbeitet.
- Zeitgesteuerte Jobs, bei jedem Lauf.

Was nichts kostet:

- Leerlauf. Es wird nichts gepollt.
- Das Dashboard, die Systemprüfungen und das Lesen der Protokolle.

Günstig bleiben: für den Alltag bei `anthropic/claude-haiku-4.5` bleiben, die Analyse
wöchentlich statt stündlich laufen lassen, und deinen Entities Bereiche zuweisen — dann findet
er Dinge in einem Schritt statt in dreien.

Der angezeigte Betrag ist eine Schätzung aus einer Preistabelle, keine abgerechnete Nutzung.
Massgeblich ist dein OpenRouter-Dashboard.

## Daten und Backup

Alles liegt in `/data/store/` und wird von Home-Assistant-Backups automatisch mitgesichert.

| Ordner                      | Inhalt                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `conversations/`            | Chat-Verlauf, gemeinsam für Web-UI und Telegram                                                   |
| `memory/`                   | Langzeit-Gedächtniskarten                                                                         |
| `notes/`                    | Notizen                                                                                           |
| `backlog/`                  | Aufgaben                                                                                          |
| `learning/`                 | Korrekturen, Regeln, Muster, frühere Fehler                                                       |
| `scheduler.json`            | Erinnerungen und wiederkehrende Jobs                                                              |
| `actions.jsonl`             | Aktionsprotokoll mit Rückgängig-Daten, 7 Tage aufbewahrt                                          |
| `profile.json`              | Namen, Gesprächsstil, Modellwahl                                                                  |
| `system-health.json`        | Zuletzt gesehene Werte (die Oberfläche zeigt, was sich bewegt hat) und zuletzt gemeldeter Zustand |
| `system-health-report.json` | Letzter vollständiger System-Health-Bericht für die Status-Oberfläche                             |

Ein wiederhergestelltes Home-Assistant-Backup stellt das alles mit wieder her. Für einen
Neuanfang das Add-on deinstallieren (das leert `/data`) und neu installieren.

## Fehlerbehebung

**Das Add-on startet nicht.**
Ins Protokoll schauen. Meist fehlt der `openrouter_api_key`, oder es ist ein
`telegram_bot_token` ohne `telegram_allowed_user_ids` gesetzt — diese Kombination wird
absichtlich verweigert, weil ein Bot ohne Whitelist jedem antwortet.

**Das Add-on startet und der Supervisor startet es gleich wieder.**
Ein Watchdog ruft `/health` auf. Wenn der HTTP-Server innerhalb von etwa 40 Sekunden nicht
antwortet oder später weg ist, wirft Home Assistant den Container neu an. Das Add-on-Protokoll
ist die erste Anlaufstelle.

**Er findet ein Gerät nicht, das es definitiv gibt.**
Ordne die Entity in Home Assistant einem Bereich zu und drücke unter Settings **Cache
aktualisieren**. Im Cache stehen nur steuerbare Domains und die wichtigen Sensorklassen
(Fenster, Tür, Bewegung, Rauch, Feuchtigkeit); nach einem abgelegenen Diagnose-Sensor muss man
namentlich suchen lassen.

**Er sagt, er habe etwas eingeschaltet, aber nichts ist passiert.**
Das ist die Nachprüfung bei der Arbeit — sie vergleicht den Zustand vorher und nachher. Sieh
in Home Assistant direkt nach. Meistens ist das Gerät nicht erreichbar, was der Systemzustand
bestätigt.

**In den Antworten steht seltsamer Text wie `[TOOL_CALLS]` oder `tool_code`.**
Das Modell lässt seine interne Syntax durch. Nimm ein stärkeres Modell; das passiert vor allem
bei kostenlosen und sehr kleinen Modellen.

**Der Telegram-Bot antwortet nicht.**
Wahrscheinlich steht deine User-ID nicht in `telegram_allowed_user_ids` oder hat einen
Zahlendreher. Nachrichten von Nicht-Berechtigten werden bewusst still verworfen. Prüf deine ID
mit [@userinfobot](https://t.me/userinfobot).

**Er hört mitten in einer Anfrage auf zu antworten.**
Irgendetwas wartet auf eine Bestätigung. Schau in der Web-UI nach einem offenen Dialog oder in
Telegram nach unbeantworteten Knöpfen. Unbeantwortete Anfragen werden nach 60 Sekunden
abgelehnt.

**„Dienst vorübergehend nicht verfügbar".**
Der Schutzschalter hat nach wiederholten Fehlern des LLM-Anbieters ausgelöst und pausiert die
Aufrufe, statt die API zu bombardieren. Er erholt sich von selbst. Prüf den
[OpenRouter-Status](https://status.openrouter.ai) und ob dein Key noch Guthaben hat.

**Die Aufgabenliste füllt sich immer wieder mit demselben Befund.**
Das wurde in 0.9.3 behoben. Aktualisieren, danach unter Status → Tasks **Duplikate entfernen**
benutzen.

**Etwas anderes.**
`log_level: debug` setzen, den Fehler nachstellen, ins Protokoll schauen. Vor dem Weitergeben
auf API-Keys prüfen.

## Hilfe bekommen

- **Fehler und Wünsche**: [GitHub Issues](https://github.com/unpaved028/ha-claw/issues)
- **Fragen und Ideen**: [Discussions](https://github.com/unpaved028/ha-claw/discussions)
- **Sicherheitsprobleme**:
  [vertraulich melden](https://github.com/unpaved028/ha-claw/security/advisories/new), nicht
  als öffentliches Issue
- **Wie es intern funktioniert**: [technische Dokumentation](../docs/README.md) (englisch)
- **Was geplant ist**: [Roadmap](../docs/roadmap.md) (englisch)

Bei einer Fehlermeldung bitte HA-Claw-Version, Home-Assistant-Version, benutztes Modell und
das relevante Protokoll mit `log_level: debug` angeben. Und vorher auf Geheimnisse prüfen —
der Logger schwärzt, was er erkennt, was keine Garantie ist.
