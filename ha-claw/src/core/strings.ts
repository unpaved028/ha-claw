/**
 * strings.ts – Server-side user-facing copy (Telegram, personality, digest, …).
 * Web UI strings live in src/web/ui/i18n.js.
 */

import { getLanguage, type UiLang } from './locale.js';

type Vars = Record<string, string | number>;

const DE: Record<string, string> = {
  'prompt.personalityHeading': 'Persönlichkeit & Profil',
  'prompt.noTools': '_(keine Tools verfügbar)_',
  'prompt.needsConfirm': '(erfordert Bestätigung)',
  'prompt.nameIntro':
    'Dein Name ist **{bot}**. Der Nutzer heisst **{user}**. Sprich den Nutzer mit seinem Namen an wenn es passt.',
  'prompt.directLow': 'Sei diplomatisch und indirekt in deinen Formulierungen.',
  'prompt.directHigh': 'Sei direkt und auf den Punkt. Keine Umschweife.',
  'prompt.formalLow': 'Sprich locker und casual, duze den Nutzer.',
  'prompt.formalHigh': 'Sprich professionell und formell.',
  'prompt.humorLow': 'Bleib sachlich, wenig Humor.',
  'prompt.humorHigh': 'Sei humorvoll, nutze trockenen Witz und smarte Kommentare.',
  'prompt.verboseLow': 'Antworte so knapp wie moeglich. Kurze Saetze.',
  'prompt.verboseHigh': 'Erklaere ausfuehrlich und gib Details und Kontext.',
  'scheduler.heading': 'Aktive Scheduled Jobs',
  'scheduler.once': 'einmalig',
  'scheduler.recurring': 'wiederkehrend',
  'scheduler.next': 'naechster Lauf',
  'voice.noKey': 'OpenAI API Key (openai_api_key) ist nicht konfiguriert.',
  'voice.noVoice': 'Keine Sprachnachricht gefunden.',
  'voice.noPath': 'Dateipfad von Telegram fehlt.',
  'voice.failed': 'Spracherkennung fehlgeschlagen: {error}',
  'telegram.start':
    '🤖 *HA-Claw online.*\n\nSchreib mir einfach, was du brauchst.\n\n`/status` – Systemstatus\n`/ping` – Lebenszeichen',
  'telegram.pong': '🏓 Pong! Uptime: {hours}h {minutes}m',
  'telegram.statusUsage':
    '• Anfragen: {requests}\n• Tokens: {tokens}\n• Kosten (Schätzung): ${cost}\n',
  'telegram.statusHealthHead': 'Systemzustand',
  'telegram.statusHealthFail': 'Nicht abrufbar.',
  'telegram.statusBody':
    '📊 *HA-Claw Status*\n\n• Uptime: {uptime}m\n• Memory: {heap} MB\n• Mode: {mode}\n• Node: {node}\n\n🌍 *LLM Nutzung (Global)*\n{usage}{health}',
  'telegram.help':
    '📖 *Hilfe & Befehle*\n\n• *Text*: Schreib einfach, was du brauchst (z.B. "Licht aus", "Termin morgen um 8").\n• `/status` – Systemstatus & Kosten\n• `/rooms` – Räume anzeigen\n• `/ping` – Antwort-Test\n• `/help` – Diese Übersicht',
  'telegram.noRooms': 'Keine Räume in Home Assistant gefunden.',
  'telegram.roomsTitle': '📂 *Räume & Bereiche*\n\nWähle einen Raum aus:',
  'telegram.roomsFail': 'Fehler beim Laden der Räume.',
  'telegram.roomStatus': 'Status von {room}',
  'telegram.voiceHeard': '🎙️ _Voice erkannt:_ "{text}"',
  'telegram.onboardingError': '❌ Fehler: {error}',
  'telegram.retryStart': 'Starte neu...',
  'telegram.retryNone': 'Keine vorherige Nachricht für Retry gefunden.',
  'telegram.loopError': '❌ Fehler: {error}',
  'telegram.retryBtn': '🔄 Nochmal versuchen',
  'telegram.cmdHelp': 'Hilfe anzeigen',
  'telegram.cmdRooms': 'Alle Räume anzeigen',
  'telegram.cmdStatus': 'Systemstatus & Kosten',
  'telegram.cmdPing': 'Antwort-Test',
  'confirm.expired': '⏰ Abgelaufen.',
  'confirm.wrongUser': 'Nur wer die Aktion ausgelöst hat, kann sie bestätigen.',
  'confirm.yes': '✅ Genehmigt',
  'confirm.no': '❌ Abgelehnt',
  'confirm.title': '⚠️ Gefährliche Aktion',
  'confirm.approveQ': 'Genehmigen?',
  'confirm.btnYes': '✅ Ja',
  'confirm.btnNo': '❌ Nein',
  'notify.foreignChat': 'Diese Aufgabe gehört zu einem anderen Chat.',
  'notify.fastTrackCb': 'Task wird im Hintergrund ausgeführt...',
  'notify.fastTrackReply': '⏳ Bestätigt: {title}. Ich kümmere mich darum.',
  'notify.rejectCb': 'Task wurde ignoriert.',
  'notify.rejectReply': '❌ Aufgabe wurde ignoriert.',
  'push.newTask':
    '⚠️ *Proaktive Warnung: {title}*\n\n*Ist-Zustand:* {asIs}\n*Soll-Zustand:* {toBe}',
  'push.taskDone': '✅ *Aufgabe erledigt:* {title}\n\n*Ergebnis:*\n{result}',
  'push.taskFail': '❌ *Fehler bei Aufgabe:* {title}\n\n*Details:*\n{result}',
  'push.taskRun': '✅ Ausführen',
  'push.taskIgnore': '❌ Ignorieren',
  'push.noResult': 'Ohne Rückmeldung',
  'push.unknown': 'Unbekannt',
  'push.healthWorse': '🩺 *Systemzustand verschlechtert*',
  'coverage.motion':
    '{motion} Bewegungsmelder und {lights} Lichter, aber keine Automation die sie verbindet.',
  'coverage.cover': '{covers} Cover ohne Sonnen-/Beschattungs-Automation.',
  'coverage.leak': '{leaks} Leck-/Feuchtesensoren ohne Benachrichtigungs-Automation.',
  'coverage.yamlNote':
    '{ui} UI-Automationen/Skripte vollständig, {yaml} nur YAML (kein voller Scan).',
  'coverage.impactMotion': 'Licht nur wenn jemand da ist; weniger vergessene Lichter.',
  'coverage.impactCover': 'Beschattung nach Sonnenstand statt nach der Uhr.',
  'coverage.impactLeak': 'Sofortige Warnung bei einem Leck, auch wenn niemand im Raum ist.',
  'coverage.climateWindow':
    '{contacts} Fenster/Türen und {climates} Klima, aber keine Automation die bei Offenstand pausiert.',
  'coverage.climateAway':
    '{climates} Klima ohne Absenkung, wenn die letzte Person das Haus verlässt.',
  'coverage.impactClimateWindow': 'Keine Heizung/Kühlung gegen ein offenes Fenster.',
  'coverage.impactClimateAway': 'Absenkung sobald niemand mehr zu Hause ist.',
  'coverage.sketchMotion':
    'state {trigger} → on, mode restart → light.turn_on ({target}); Delay, dann aus.',
  'coverage.sketchCover': 'sun elevation/sunset → cover.set_cover_position ({target}).',
  'coverage.sketchLeak': '{trigger} on → notify / persistent_notification.',
  'coverage.sketchClimateWindow':
    'state {trigger} on, for 2 min → climate.turn_off ({target}). mode: restart.',
  'coverage.sketchClimateAway':
    '{trigger} not_home → climate.set_temperature / set_hvac_mode ({target}).',
  'quality.deviceId': '{name} nutzt device_id im Trigger oder in der Condition, ohne entity_id.',
  'quality.deviceIdFix':
    'Trigger/Condition auf entity_id umstellen. device_id bricht beim Neu-Anlernen.',
  'quality.motionMode':
    '{name} schaltet bei Bewegung mit Delay, steht aber auf mode single (oder ohne mode).',
  'quality.motionModeFix': 'mode: restart, damit jede neue Bewegung den Timer zurücksetzt.',
  'quality.numericTemplate':
    '{name} vergleicht eine Zahl in einem Template statt mit numeric_state.',
  'quality.numericTemplateFix':
    'condition: numeric_state bzw. wait_for_trigger. Templates umgehen die Validierung.',
  'quality.impact': 'Weniger stille Brüche, Automationen die tun was der Name verspricht.',
  'digest.title': 'Wöchentlicher Hausbericht',
  'digest.health': 'Systemzustand: {severity} ({critical} rot, {warn} gelb)',
  'digest.gaps': 'Automationslücken: {n}',
  'digest.names': 'Namen ohne friendly_name: {n}',
  'digest.watts': 'Aktuelle Leistung (Summe der Power-Sensoren): {n} W',
  'digest.tasks': 'Offene Tasks: {n}',
  'digest.gapList': 'Lücken:',
  'digest.quality': 'Automation-Qualität: {n} Hinweise',
  'digest.topLoads': 'Größte Verbraucher:',
  'naming.light': 'Licht',
  'naming.switch': 'Schalter',
  'naming.binary_sensor': 'Sensor',
  'naming.sensor': 'Sensor',
  'naming.cover': 'Cover',
  'naming.climate': 'Heizung',
  'naming.fan': 'Lüfter',
  'naming.media_player': 'Media',
  'naming.lock': 'Schloss',
};

const EN: Record<string, string> = {
  'prompt.personalityHeading': 'Personality & profile',
  'prompt.noTools': '_(no tools available)_',
  'prompt.needsConfirm': '(requires confirmation)',
  'prompt.nameIntro':
    'Your name is **{bot}**. The user is **{user}**. Address the user by name when it fits.',
  'prompt.directLow': 'Be diplomatic and indirect in how you phrase things.',
  'prompt.directHigh': 'Be direct and to the point. No padding.',
  'prompt.formalLow': 'Speak casually. Use first names.',
  'prompt.formalHigh': 'Speak professionally and formally.',
  'prompt.humorLow': 'Stay matter-of-fact, little humour.',
  'prompt.humorHigh': 'Be humorous; use dry wit and smart asides.',
  'prompt.verboseLow': 'Reply as briefly as possible. Short sentences.',
  'prompt.verboseHigh': 'Explain in detail and give context.',
  'scheduler.heading': 'Active scheduled jobs',
  'scheduler.once': 'one-shot',
  'scheduler.recurring': 'recurring',
  'scheduler.next': 'next run',
  'voice.noKey': 'OpenAI API key (openai_api_key) is not configured.',
  'voice.noVoice': 'No voice message found.',
  'voice.noPath': 'Telegram file path is missing.',
  'voice.failed': 'Speech recognition failed: {error}',
  'telegram.start':
    '🤖 *HA-Claw online.*\n\nJust tell me what you need.\n\n`/status` – system status\n`/ping` – liveness',
  'telegram.pong': '🏓 Pong! Uptime: {hours}h {minutes}m',
  'telegram.statusUsage':
    '• Requests: {requests}\n• Tokens: {tokens}\n• Cost (estimate): ${cost}\n',
  'telegram.statusHealthHead': 'System health',
  'telegram.statusHealthFail': 'Unavailable.',
  'telegram.statusBody':
    '📊 *HA-Claw status*\n\n• Uptime: {uptime}m\n• Memory: {heap} MB\n• Mode: {mode}\n• Node: {node}\n\n🌍 *LLM usage (global)*\n{usage}{health}',
  'telegram.help':
    '📖 *Help & commands*\n\n• *Text*: Just write what you need (e.g. "lights off", "reminder tomorrow at 8").\n• `/status` – system status & cost\n• `/rooms` – list rooms\n• `/ping` – reply test\n• `/help` – this overview',
  'telegram.noRooms': 'No rooms found in Home Assistant.',
  'telegram.roomsTitle': '📂 *Rooms & areas*\n\nPick a room:',
  'telegram.roomsFail': 'Failed to load rooms.',
  'telegram.roomStatus': 'Status of {room}',
  'telegram.voiceHeard': '🎙️ _Voice heard:_ "{text}"',
  'telegram.onboardingError': '❌ Error: {error}',
  'telegram.retryStart': 'Starting again...',
  'telegram.retryNone': 'No previous message to retry.',
  'telegram.loopError': '❌ Error: {error}',
  'telegram.retryBtn': '🔄 Try again',
  'telegram.cmdHelp': 'Show help',
  'telegram.cmdRooms': 'Show all rooms',
  'telegram.cmdStatus': 'System status & cost',
  'telegram.cmdPing': 'Reply test',
  'confirm.expired': '⏰ Expired.',
  'confirm.wrongUser': 'Only the person who triggered the action can confirm it.',
  'confirm.yes': '✅ Approved',
  'confirm.no': '❌ Denied',
  'confirm.title': '⚠️ Dangerous action',
  'confirm.approveQ': 'Approve?',
  'confirm.btnYes': '✅ Yes',
  'confirm.btnNo': '❌ No',
  'notify.foreignChat': 'This task belongs to another chat.',
  'notify.fastTrackCb': 'Task is running in the background...',
  'notify.fastTrackReply': '⏳ Confirmed: {title}. I will take care of it.',
  'notify.rejectCb': 'Task ignored.',
  'notify.rejectReply': '❌ Task ignored.',
  'push.newTask': '⚠️ *Proactive warning: {title}*\n\n*As-is:* {asIs}\n*To-be:* {toBe}',
  'push.taskDone': '✅ *Task done:* {title}\n\n*Result:*\n{result}',
  'push.taskFail': '❌ *Task failed:* {title}\n\n*Details:*\n{result}',
  'push.taskRun': '✅ Run',
  'push.taskIgnore': '❌ Ignore',
  'push.noResult': 'No result',
  'push.unknown': 'Unknown',
  'push.healthWorse': '🩺 *System health got worse*',
  'coverage.motion':
    '{motion} motion sensors and {lights} lights, but no automation connecting them.',
  'coverage.cover': '{covers} covers without a sun/shading automation.',
  'coverage.leak': '{leaks} leak/moisture sensors without a notification automation.',
  'coverage.yamlNote': '{ui} UI automations/scripts read fully, {yaml} YAML-only (no full scan).',
  'coverage.impactMotion': 'Lights only when someone is there; fewer lights left on.',
  'coverage.impactCover': 'Shading from the sun, not from the clock.',
  'coverage.impactLeak': 'An immediate warning on a leak, even when nobody is in the room.',
  'coverage.climateWindow':
    '{contacts} windows/doors and {climates} climate entities, but no automation that pauses when they are open.',
  'coverage.climateAway':
    '{climates} climate entities with no setback when the last person leaves.',
  'coverage.impactClimateWindow': 'No heating or cooling against an open window.',
  'coverage.impactClimateAway': 'A setback as soon as nobody is home.',
  'coverage.sketchMotion':
    'state {trigger} → on, mode restart → light.turn_on ({target}); delay, then off.',
  'coverage.sketchCover': 'sun elevation/sunset → cover.set_cover_position ({target}).',
  'coverage.sketchLeak': '{trigger} on → notify / persistent_notification.',
  'coverage.sketchClimateWindow':
    'state {trigger} on, for 2 min → climate.turn_off ({target}). mode: restart.',
  'coverage.sketchClimateAway':
    '{trigger} not_home → climate.set_temperature / set_hvac_mode ({target}).',
  'quality.deviceId': '{name} uses device_id in a trigger or condition, without an entity_id.',
  'quality.deviceIdFix':
    'Switch the trigger/condition to entity_id. device_id breaks when the device is re-added.',
  'quality.motionMode':
    '{name} drives a motion light with a delay, but mode is single (or missing).',
  'quality.motionModeFix': 'Set mode: restart so each new motion resets the timer.',
  'quality.numericTemplate':
    '{name} compares a number in a template instead of using numeric_state.',
  'quality.numericTemplateFix':
    'Use condition: numeric_state or wait_for_trigger. Templates skip validation.',
  'quality.impact': 'Fewer silent breakages; automations that do what they look like they do.',
  'digest.title': 'Weekly home report',
  'digest.health': 'System health: {severity} ({critical} red, {warn} yellow)',
  'digest.gaps': 'Automation gaps: {n}',
  'digest.names': 'Names without friendly_name: {n}',
  'digest.watts': 'Current power (sum of power sensors): {n} W',
  'digest.tasks': 'Open tasks: {n}',
  'digest.gapList': 'Gaps:',
  'digest.quality': 'Automation quality: {n} notes',
  'digest.topLoads': 'Largest loads:',
  'naming.light': 'Light',
  'naming.switch': 'Switch',
  'naming.binary_sensor': 'Sensor',
  'naming.sensor': 'Sensor',
  'naming.cover': 'Cover',
  'naming.climate': 'Climate',
  'naming.fan': 'Fan',
  'naming.media_player': 'Media',
  'naming.lock': 'Lock',
};

function lookup(lang: UiLang, key: string): string {
  const dict = lang === 'en' ? EN : DE;
  return dict[key] ?? DE[key] ?? key;
}

function applyVars(s: string, vars?: Vars): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function t(key: string, vars?: Vars, lang: UiLang = getLanguage()): string {
  return applyVars(lookup(lang, key), vars);
}

export function dateLocale(lang: UiLang = getLanguage()): string {
  return lang === 'en' ? 'en' : 'de-DE';
}
