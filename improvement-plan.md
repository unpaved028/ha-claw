# HA-Claw – Verbesserungsplan (Stand v0.9.1, 2026-08-26)

> **Status:** Phase 0 und Phase 1 sind in v0.9.2 umgesetzt. Offen ist Phase 2.
>
> Eine Abweichung vom Plan: Punkt 1.1 empfahl, das Complexity-Routing zu
> **entfernen**. Beim Umsetzen zeigte sich, dass die Funktion vollständig gebaut
> war (Settings-Dropdowns, Persistenz im Profil, Sterne pro Tool) – es fehlte
> ausschliesslich die Modellauswahl im Loop. Implementieren waren ~20 Zeilen in
> einer Datei, Entfernen hätte sieben Dateien inklusive der beiden grossen
> UI-Quellen berührt und eine Funktion gelöscht. Umgesetzt ist daher Variante A.

Ergebnis einer vollständigen Projektanalyse. Dieser Plan ist nach Blocker-Wirkung
sortiert, nicht nach Aufwand. Jede Aufgabe nennt Problem, Änderung und
Akzeptanzkriterium, damit sie ohne Rückfrage umsetzbar ist.

**Leitgedanke:** Die Feature-Geschwindigkeit hat das Engineering-Fundament weit
hinter sich gelassen — 30+ Releases, ~10.300 Zeilen Quellcode, null Tests, keine
CI. Die drei Phasen unten stellen zuerst Reproduzierbarkeit her, dann Sicherheit,
dann Wahrheit zwischen Doku und Code. Neue Features erst danach.

---

## Architekturentscheidung: Dashboard-Build

**Entschieden:** `src/web/ui/` ist die Quelle. `src/web/dashboard.ts` ist ein
generiertes Artefakt und bleibt committet (die HA-Ingress-Auslieferung braucht
alles inline in einer HTML-Antwort, siehe Begründung im Bundler-Header).

**Aktueller Zustand:** Der Bundler existiert und funktioniert — er liegt aber
unter `.agents/workflows/bundle-dashboard.js`, und `.agents/` ist per
`.gitignore` ausgeschlossen. Damit gilt:

- Kein Fremd-Clone und keine CI kann die UI neu bauen.
- Es gibt keinen Mechanismus, der erkennt, wenn `dashboard.ts` von
  `src/web/ui/` abweicht (z. B. nach einer manuellen Notkorrektur am Artefakt).
- Bus-Faktor 1 — kritisch für ein öffentliches GitHub-Release.

Die Escaping-Bugserie von v0.8.1 bis v0.8.5 ist kein Zufall, sondern eine
strukturelle Folge davon, dass CSS/JS in ein TypeScript-Template-Literal
inlined und die Escapes (`\`, `` ` ``, `${`) manuell in drei
`String.replace`-Schritten gesetzt werden. Der Fix in Phase 0 beseitigt diese
Fehlerklasse dauerhaft.

---

## Phase 0 — v0.9.2 „Fundament reparieren"

Keine neuen Features. Ziel: Das Repository ist aus sich selbst heraus baubar,
und das Safety Gate hält, was es verspricht.

### 0.1 Bundler ins Repository holen

- **Problem:** Build-Tooling liegt im gitignorierten `.agents/`.
- **Änderung:** Skript nach `ha-claw/scripts/bundle-dashboard.js` verschieben.
  Pfadauflösung anpassen (`repoRoot` wird zu `ha-claw/`, also
  `path.resolve(__dirname, '..')`). Da `package.json` `"type": "module"` setzt,
  entweder auf ESM-Imports umschreiben oder die Datei als `.cjs` ablegen.
  Header-Kommentar in der Generatorausgabe auf den neuen Pfad korrigieren.
- **npm-Scripts:**
  - `"bundle": "node scripts/bundle-dashboard.cjs"`
  - `"prebuild": "npm run bundle"` — damit läuft es automatisch vor `tsc`,
    also auch im Docker-Build.
  - `"verify:bundle"` — regeneriert in ein temporäres Verzeichnis und
    vergleicht mit `src/web/dashboard.ts`; Exit-Code 1 bei Abweichung.
- **Akzeptanz:** `git clean -xdf && npm ci && npm run build` erzeugt aus einem
  frischen Clone ein identisches `dashboard.ts`.

### 0.2 Escaping strukturell beseitigen

- **Problem:** `bundle-dashboard.js:53-63` escapt Backslashes, Backticks und
  `${` manuell in einer bestimmten Reihenfolge. Jeder neue Sonderfall im
  Frontend-Code bricht die Generierung (Ursache von v0.8.1–v0.8.5).
- **Änderung:** Kein Template-Literal mehr erzeugen. Statt dessen den
  zusammengesetzten HTML-String als JSON-String-Literal emittieren:
  `const TEMPLATE = ` + JSON.stringify(assembled) + `;`
  und `basePath` zur Laufzeit einsetzen — entweder per
  `TEMPLATE.split(BASEPATH_TOKEN).join(basePath)` oder indem der Token gar
  nicht escaped werden muss, weil `JSON.stringify` alles korrekt behandelt.
  Die drei manuellen `replace`-Schritte fallen komplett weg.
- **Akzeptanz:** Ein Test-Payload mit `` ` ``, `\`, `${x}` und `</script>` im
  CSS und im JS überlebt einen Bundle-Lauf und `npm run check` unverändert.

### 0.3 SAFE_DOMAINS bereinigen

- **Problem:** `ha-claw/src/tools/ha-tools.ts:27-46` erlaubt `script`, `scene`,
  `button` und `cover` ohne Bestätigung. `lock` und `alarm_control_panel` sind
  direkt gesperrt, aber über `script.turn_on` auf ein Türskript oder
  `cover.open_cover` auf das Garagentor trivial erreichbar.
- **Änderung:** `script`, `scene` und `button` aus `SAFE_DOMAINS` entfernen und
  in `ha_call_service_dangerous` verschieben. Für `cover` eine
  `device_class`-Prüfung ergänzen: `garage`, `gate` und `door` gelten als
  gefährlich, `shutter`/`blind`/`curtain`/`awning` bleiben alltäglich.
- **Akzeptanz:** `ha_call_service` mit `domain: "script"` wird abgelehnt;
  `cover.open_cover` auf ein `device_class: garage`-Entity landet im Safety Gate.

### 0.4 entity_id-Override schließen

- **Problem:** `ha-claw/src/tools/ha-tools.ts:279-280` spreadet das
  LLM-gelieferte `data` **nach** `entity_id`. Die Domain-Prüfung besteht, das
  effektive Ziel ist danach ein beliebiges anderes Entity.
- **Änderung:** Reihenfolge umdrehen (`...extraData` zuerst, `entity_id`
  danach) **und** zusätzlich validieren, dass jedes `entity_id` mit
  `${domain}.` beginnt. Dieselbe Prüfung in `ha_call_service_dangerous` und in
  `ha_light_set_scene` (Prefix `scene.`).
- **Akzeptanz:** `{ domain: "light", entity_id: "lock.front_door", ... }` wird
  mit Fehlermeldung abgelehnt; `data: { entity_id: "lock.x" }` kann das Ziel
  nicht mehr überschreiben.

### 0.5 Web-Confirmation-Hang beheben

- **Problem:** `ha-claw/src/web/server.ts:48` hält genau einen Slot
  (`pendingConfirmation`). Ein zweiter gefährlicher Aufruf überschreibt den
  ersten; dessen Timeout-Guard prüft `pendingConfirmation?.id === id`, trifft
  nicht mehr zu, `resolve` wird nie gerufen. Das Promise löst nie auf — der
  Agentic Loop steht und der Fastify-Request hängt offen.
- **Änderung:** `Map<string, PendingConfirmation>` statt Einzel-Slot.
  `/api/confirm/pending` liefert die Liste (oder den ältesten Eintrag).
  Timeout löst immer auf und entfernt nur den eigenen Eintrag aus der Map.
- **Akzeptanz:** Zwei parallele gefährliche Aktionen erzeugen zwei
  Bestätigungsdialoge; keiner der beiden Requests hängt, auch nicht nach 60 s.

### 0.6 Telegram-Bestätigungen an den Anfragenden binden

- **Problem:** `ha-claw/src/telegram/confirmation.ts` mappt nur
  `callbackId → resolver` ohne Prüfung von `ctx.from.id`. In einer Gruppe kann
  jedes Whitelist-Mitglied die gefährliche Aktion eines anderen freigeben.
  Gleiches gilt für `task:fast_track:*` und `task:reject:*` in
  `ha-claw/src/telegram/notifications.ts`.
- **Änderung:** Beim Erzeugen der Bestätigung `userId` und `chatId` mitspeichern
  und im Callback-Handler vergleichen. Bei Nichtübereinstimmung
  `answerCallbackQuery` mit Hinweistext, ohne den Resolver zu triggern.
- **Akzeptanz:** Ein zweiter Whitelist-Nutzer bekommt beim Klick eine Absage,
  der ursprüngliche Nutzer kann weiterhin bestätigen.

### 0.7 Doppelte Tool-Registrierung entfernen

- **Problem:** `ha_call_service_dangerous` ist in
  `ha-claw/src/tools/ha-tools.ts` zweimal registriert (ca. Zeile 460 und 708);
  die zweite überschreibt die erste still (`registry.ts:93-95` warnt nur).
- **Änderung:** Beide Blöcke vergleichen, gewünschtes Verhalten festlegen
  (insbesondere: ist `entity_id` optional für domainweite Services?), einen
  Block entfernen.
- **Akzeptanz:** Beim Start erscheint keine `already registered`-Warnung mehr.

### 0.8 Repository aufräumen

- **Problem:** Im Arbeitsbaum liegen `dashboard_generated.html` (184 KB),
  `test-html.ts`, `test-log.ts`, `lint-report.txt`, `git_files.txt` und ein
  1-MB-`icon.png`. `extract-ui.js` im Root ist ein abgeschlossenes
  Einweg-Migrationsskript. `.gitignore` enthält eine pauschale `*.txt`-Regel,
  die auch gewollte Dateien verschluckt.
- **Änderung:** Artefakte löschen, `extract-ui.js` entfernen (oder nach
  `ha-claw/scripts/legacy/` mit Hinweis), `*.txt` durch gezielte Einträge
  ersetzen, `icon.png` auf HA-Add-on-Vorgabe (256×256) verkleinern.
  Ausserdem das KI-Editier-Artefakt in `ha-claw/src/tools/ha-tools.ts:81-83`
  entfernen (`// ... (lines 34-100 unchanged)` /
  `// (Note: Skipping re-pasting ... for brevity ...)`).
- **Akzeptanz:** `git status` ist nach `npm run build` sauber; kein
  generiertes Artefakt mehr im Arbeitsbaum ausser `dashboard.ts` und `dist/`.

### 0.9 CI aufsetzen

- **Problem:** Kein `.github/`. Nichts erzwingt `check`, `lint` oder `format`
  vor einem Release — bei 30+ Releases.
- **Änderung:** `.github/workflows/ci.yml` auf Push und Pull Request:
  `npm ci`, `npm run verify:bundle`, `npm run check`, `npm run lint`,
  `npm run format`. Zusätzlich ein Job, der `docker build` für `amd64` prüft.
- **Akzeptanz:** Ein absichtlich eingebauter Typfehler oder ein von Hand
  editiertes `dashboard.ts` lässt die Pipeline rot werden.

---

## Phase 1 — v0.9.3 „Wahrheit herstellen"

Doku, UI-Versprechen und Code müssen dasselbe sagen.

### 1.1 Complexity-Routing: implementieren oder entfernen

- **Problem:** README (Zeile 15, 25) und `architecture.md` (106-112) bewerben
  Modell-Routing pro Tool-Komplexität. `getToolComplexity()`
  (`ha-claw/src/tools/registry.ts:176`) hat **null Aufrufstellen**;
  `agentic-loop.ts:167` nutzt immer `agent.model`. Die Einstellung im
  Settings-Dialog wirkt nicht.
- **Änderung, Variante A (implementieren):** Im Agentic Loop vor jedem
  LLM-Call die höchste Komplexität der im letzten Schritt tatsächlich
  aufgerufenen Tools bestimmen und das zugeordnete Modell wählen. Achtung:
  Modellwechsel mitten im Gespräch kann Tool-Call-Formate brechen — deshalb
  eher pro Anfrage einmal entscheiden (heuristisch anhand der Nachricht) als
  pro Iteration.
- **Änderung, Variante B (entfernen):** `complexity` aus `RegisteredTool`,
  `ToolInfo`, dem Settings-UI, README und `architecture.md` streichen.
- **Empfehlung:** Variante B jetzt, Variante A als eigenes Feature später.
  Ein nicht funktionierendes Feature in der UI kostet mehr Vertrauen als ein
  fehlendes.
- **Akzeptanz:** Entweder ändert die Einstellung nachweislich das verwendete
  Modell (Log), oder sie existiert nicht mehr.

### 1.2 Kosten-Tracking beim Streaming reparieren

- **Problem:** `parseStream()` in `ha-claw/src/core/openrouter.ts:254-256`
  liefert bewusst kein `usage`-Feld, also wird `trackUsage()` bei Streaming nie
  gerufen. Die Web-UI nutzt SSE als Standardpfad — die Kosten in `/status`
  sind systematisch zu niedrig.
- **Änderung:** Im Request-Body `stream_options: { include_usage: true }`
  setzen (OpenRouter/OpenAI-kompatibel) und den `usage`-Chunk am Stream-Ende
  auswerten. Fallback: Tokens aus `countTokens()` schätzen und als geschätzt
  markieren. Zusätzlich in `ha-claw/src/storage/usage-tracker.ts` die auf
  Haiku fixierten Preiskonstanten durch eine Modell→Preis-Tabelle ersetzen.
- **Akzeptanz:** Nach einem Chat über die Web-UI steigt der Token-Zähler in
  `/status`, und der USD-Betrag passt zum eingestellten Modell.

### 1.3 openai_api_key konfigurierbar machen

- **Problem:** `ha-claw/src/telegram/voice.ts:12` verlangt `openaiApiKey`,
  `ha-claw/src/core/config.ts:55,98,130` liest `openai_api_key` — die Option
  fehlt aber in `ha-claw/config.yaml` (`options` und `schema`). Telegram-Voice
  ist über die HA-Add-on-UI nicht einschaltbar.
- **Änderung:** `openai_api_key: ''` in `options` und `openai_api_key: 'str?'`
  in `schema` ergänzen. In README und DOCS.md dokumentieren, inklusive Hinweis,
  dass Telegram-Voice einen separaten OpenAI-Key braucht.
- **Akzeptanz:** Der Key ist in der Add-on-Konfiguration setzbar, eine
  Telegram-Sprachnachricht wird transkribiert.

### 1.4 Datenpfade vereinheitlichen

- **Problem:** `ha-claw/src/storage/learning.ts:20`,
  `ha-claw/src/storage/scheduler.ts:52` und
  `ha-claw/src/tools/registry.ts:44` nutzen
  `process.env.HA_CLAW_DATA || '/data/store'`, alles andere `appConfig.dataPath`
  (im Dev-Modus `./data`). Lokal liegen die Daten damit in zwei getrennten
  Bäumen — Scheduler-Jobs und Corrections „verschwinden" beim Neustart.
- **Änderung:** Alle drei auf `join(appConfig.dataPath, 'store', ...)`
  umstellen. Ausserdem `ha-claw/src/core/config.ts:96-97` prüfen: das
  Dev-Fallback-Modell ist `google/gemini-2.5-flash-preview`, dokumentiert ist
  `anthropic/claude-haiku-4.5`.
- **Akzeptanz:** Im Dev-Modus landen sämtliche Store-Dateien unter `./data/store/`.

### 1.5 Doku mit der Realität synchronisieren

- `architecture.md:80,169`: `agents/butler.md` → `agents/main.md`
  (umbenannt in v0.8.7).
- `architecture.md:127`: „Polls every 30 seconds" → event-driven (seit v0.6.2).
- `architecture.md:74`: Dashboard ist kein handgepflegtes HTML mehr.
- `architecture.md:75-78`: Telegram-Baum um `voice.ts` und `notifications.ts`
  ergänzen; `core/` um `context-manager.ts`; `storage/` um `usage-tracker.ts`;
  `telegram/` um `whitelist.ts`.
- `README.md:71`: Link `[Architecture.md](Architecture.md)` zeigt auf einen
  nicht existierenden Pfad — die Datei heisst `architecture.md` und liegt im
  Repo-Root, nicht in `ha-claw/`. Bricht auf case-sensitiven Systemen.
- README/DOCS ergänzen um die tatsächlich vorhandenen Features: SSE-Streaming,
  Circuit Breaker, Usage-/Kosten-Tracking, Telegram-Voice, `/rooms`, `/help`,
  Retry-Button, conversational Onboarding.
- `CHANGELOG.md`: Der SSE-Tool-Namen-Fix steht doppelt unter 0.9.0 (Zeile 19)
  und 0.9.1 (Zeile 7). Version 0.8.8 fehlt komplett, obwohl es einen
  Release-Commit gibt.
- **Akzeptanz:** Kein Dokument nennt eine Datei, die nicht existiert; kein
  Feature in README ohne Implementierung.

### 1.6 Tool-Liste im System-Prompt vervollständigen

- **Problem:** `ha-claw/agents/main.md:100-125` dokumentiert die Tools für das
  LLM, aber 11 registrierte Tools fehlen darin: `store_list`, `store_read`,
  `store_write`, `store_delete`, `notes_add`, `tasks_add`, `action_log_list`,
  `action_log_rollback`, `ha_light_set_scene`, `ha_light_set_color`,
  `ha_get_entities_by_label`. Das Modell kennt eigene Fähigkeiten nicht.
- **Änderung:** Liste ergänzen. Mittelfristig besser: die Liste zur Laufzeit
  aus `getToolInfos()` generieren und per Platzhalter injizieren, analog zu
  `{{ENTITY_CACHE}}` — dann kann sie nicht mehr veralten.
- **Akzeptanz:** Jedes registrierte Tool ist im Prompt beschrieben.

### 1.7 Modell-Liste auf eine Quelle reduzieren

- **Problem:** Die Liste steht dreifach: `ha-claw/config.yaml:45` (Schema),
  `ha-claw/src/web/server.ts:363-379` (hardcodiert) und in der Dashboard-UI.
  `openrouter/free` und `openrouter/auto` fehlen in der Server-Liste und sind
  daher im Web-UI nicht wählbar.
- **Änderung:** Eine exportierte Konstante in `ha-claw/src/core/config.ts` als
  Quelle; `config.yaml` bleibt notgedrungen manuell, aber ein Test vergleicht
  beide und schlägt bei Abweichung fehl.
- **Akzeptanz:** Ein neues Modell wird an genau einer Stelle im TypeScript
  ergänzt und erscheint überall in der UI.

---

## Phase 2 — v1.0.0 „Härten"

### 2.1 Tests einführen (vitest)

Nicht auf Abdeckung optimieren, sondern dort testen, wo ein Bug teuer ist:

- **Cron-/Zeitparsing** (`storage/scheduler.ts`): `every 5m`, `daily 07:00`,
  `weekdays 08:00`, `weekly mon 08:00`, plus DST-Übergänge.
- **Safety-Policy** (`tools/ha-tools.ts`): Tabellentest über Domain × Service ×
  `device_class` gegen erwartetes „braucht Bestätigung ja/nein". Das ist der
  wichtigste Test im Projekt, weil er die Fixes aus 0.3/0.4 festnagelt.
- **`pruneMessages` / `countTokens`** (`core/context-manager.ts`): Budget wird
  eingehalten, `tool_calls` und ihre Ergebnisse bleiben paarweise erhalten.
- **Entity-Cache-Komprimierung** (`core/entity-cache.ts`): ≥3 gleiche
  Domain+State werden zusammengefasst; Bereichsnamen mit Regex-Sonderzeichen
  brechen das Pruning nicht.
- **Storage-Atomarität** (`storage/json-store.ts`): paralleles `upsert` auf
  denselben Datensatz verliert kein Update.
- **Akzeptanz:** `npm test` läuft in CI, die fünf Bereiche sind abgedeckt.

### 2.2 Dockerfile härten

- **Problem:** `ha-claw/Dockerfile` nutzt das gleitende Tag `node:22-alpine`
  (nicht reproduzierbar), läuft als root, hat keinen HEALTHCHECK, und
  `VOLUME /data` ist überflüssig, weil der HA Supervisor `/data` selbst
  mountet.
- **Änderung:** Basis-Image per Digest pinnen, `USER node` (mit `chown` für
  `/data`), `HEALTHCHECK` gegen den existierenden `/health`-Endpunkt,
  `VOLUME /data` entfernen. Falls die UI-Quellen zur Laufzeit gebraucht werden
  sollten: `COPY src/web/ui/` ergänzen — mit dem `prebuild`-Hook aus 0.1 ist
  das nicht nötig.
- **Akzeptanz:** `docker build` reproduzierbar, Container läuft nicht als root,
  `docker inspect` zeigt Health-Status `healthy`.

### 2.3 Schreibzugriffe serialisieren

- **Problem:** `learning.ts:431` und `scheduler.ts:59` schreiben ohne
  temp+rename (anders als `json-store.ts:177-181`) — ein Crash beim Schreiben
  kostet die ganze Datei. Alle Monolith-JSONs (learning, scheduler, usage,
  action-log-Prune) sind read-modify-write ohne Sperre; parallele Web- und
  Telegram-Anfragen überschreiben sich gegenseitig. Alle `atomicWrite`-Varianten
  nutzen denselben festen `${path}.tmp`.
- **Änderung:** Ein kleiner Single-Flight-Mutex pro Dateipfad (Promise-Kette in
  einer `Map<string, Promise<void>>`), gemeinsam genutzte `atomicWrite`-Helfer
  mit eindeutigem tmp-Namen (`${path}.${randomUUID()}.tmp`).
- **Akzeptanz:** Der Parallel-Test aus 2.1 ist grün; kein Modul schreibt mehr
  direkt mit `writeFile` auf eine Store-Datei.

### 2.4 Scheduler-Overlap verhindern

- **Problem:** `storage/scheduler.ts:103-144`: `tick()` ist `async`, wird per
  `setInterval` gerufen, und `nextRunAt` wird erst **nach** dem Executor
  hochgesetzt. Ein Job, der länger als das Tick-Intervall läuft, feuert
  doppelt — doppelte LLM-Kosten, doppelte HA-Aktionen, doppelte Push-Nachricht.
- **Änderung:** `nextRunAt` vor dem Executor-Aufruf setzen und ein
  `running`-Flag pro Job führen. Ausserdem beim Schliessen des Circuit Breakers
  überfällige Jobs nicht alle gleichzeitig starten (Jitter oder Verfallsfenster).
- **Akzeptanz:** Ein künstlich 90 s laufender Job feuert genau einmal.

### 2.5 Sauberes Herunterfahren

- **Problem:** `ha-claw/src/index.ts:105-122` ruft `process.exit(0)`, ohne
  `app.close()` abzuwarten — laufende Requests werden abgeschnitten. Die
  Intervalle für Entity-Cache-Refresh (Zeile 75) und Proaktivanalyse
  (Zeile 189) werden nie geleert.
- **Änderung:** Interval-Handles aufbewahren, im Shutdown `clearInterval`,
  `await app.close()` und danach beenden. Der Web-Server müsste dazu die
  Fastify-Instanz aus `startWebServer()` zurückgeben.
- **Akzeptanz:** SIGTERM beendet den Prozess ohne abgebrochene Requests und
  ohne offene Timer.

### 2.6 Kleinere Härtungen aus den Audits

- `tools/registry.ts:138-150`: keine Schema-Validierung der LLM-Argumente — das
  JSON-Schema ist reine Dokumentation. Eine schlanke Prüfung von Typ und
  Pflichtfeldern vor dem Handler-Aufruf.
- `tools/tool-cache.ts:30-34`: „Invalidierung" setzt TTL 0 statt den Key zu
  löschen — auf `delete` umstellen.
- `core/entity-cache.ts:166`: Bereichsnamen werden unescaped in `new RegExp()`
  interpoliert — escapen.
- `tools/ha-tools.ts:164,219`: `limit` wird nicht geprüft; nicht-numerische
  Werte ergeben `slice(0, NaN)` und damit leere Ergebnisse — clampen.
- `storage/action-log.ts:111`: `getActionById` sucht nur in den letzten 200
  Einträgen, Rollback älterer Aktionen schlägt fehl obwohl die Daten da sind.
- `storage/backlog-processor.ts`: dauerhaft fehlschlagende Tasks werden endlos
  neu versucht — Retry-Zähler und Abbruch nach N Versuchen.
- `core/openrouter.ts:82-144`: 4xx-Antworten (falscher Key, unbekanntes Modell)
  werden dreimal mit Backoff wiederholt. Nur 429 und 5xx wiederholen.

---

## Bewusst zurückgestellt

Die folgenden Punkte stehen aktuell als v0.9.0 in `CLAUDE.md`, lösen aber
Skalierungsprobleme, die das Projekt noch nicht hat. Erst nach Phase 2:

- **Memory Card Vector Search** — lohnt ab ~1000 Karten, realistisch sind es
  Dutzende. Die vorhandene Keyword-Suche hat konkretere Mängel, die billiger zu
  beheben sind: das Substring-Matching in `memory-cards.ts:208` (`"art"` matcht
  `"start"`) und der widersprüchliche Score-Filter (0.5 in `searchCards` gegen
  0.1 in `agentic-loop.ts:96`, wodurch der zweite toter Code ist).
- **Chat-History-Paginierung** — die History ist auf 20 Nachrichten begrenzt.
- **HA-State-Cache mit 5 s TTL** — `tool-cache.ts` existiert bereits; erst 2.6
  (Invalidierung reparieren), dann messen, ob es überhaupt klemmt.
- **Bild/Vision-Support** — eigenes Feature, kein Fundament.

---

## Zusammenfassung der Reihenfolge

| Phase | Version | Kern | Blockiert |
|---|---|---|---|
| 0 | 0.9.2 | Build reproduzierbar, Safety Gate dicht, CI | öffentliches Release |
| 1 | 0.9.3 | Doku = Code, Voice konfigurierbar, Kosten korrekt | Nutzervertrauen |
| 2 | 1.0.0 | Tests, Docker-Härtung, Storage-Nebenläufigkeit | 1.0-Anspruch |

Phase 0 ist Voraussetzung für alles Weitere: ohne CI und reproduzierbaren Build
lässt sich in Phase 1 und 2 nicht sicher arbeiten.
