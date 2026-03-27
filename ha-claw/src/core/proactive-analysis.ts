/**
 * proactive-analysis.ts – Periodic analysis of the HA environment.
 *
 * Checks cover:
 * - Energy: lights left on, heating in summer, windows open + climate, solar surplus
 * - Security: doors/windows open with nobody home, unlocked locks
 * - Maintenance: stale sensors, unavailable entities, low battery
 * - Naming: inconsistent entity naming, missing labels/areas
 * - Automation: unused automations, missing common automations
 *
 * Results are written as backlog proposals. Existing backlog items
 * (including rejected/deferred) are considered to avoid duplicates.
 */

import * as ha from './ha-client.js';
import { createLogger } from './logger.js';
import { createTask, listTasks, type BacklogTask } from '../storage/backlog.js';

const log = createLogger('analysis');

interface Finding {
  title: string;
  asIs: string;
  toBe: string;
  impact: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

/**
 * Run a full analysis of the HA environment.
 * Returns a human-readable summary of findings.
 */
export async function runAnalysis(): Promise<string> {
  log.info('Proactive analysis started');

  try {
    const states = await ha.getStates();
    const existingTasks = await listTasks({});
    const now = new Date();

    // Collect all findings
    const findings: Finding[] = [
      ...analyzeEnergy(states, now),
      ...analyzeSecurity(states, now),
      ...analyzeMaintenance(states, now),
      ...analyzeNaming(states),
      ...analyzeAutomations(states),
      ...analyzeSolar(states),
    ];

    // Write to backlog, respecting existing items (including rejected/deferred)
    const newCount = await writeFindings(findings, existingTasks);

    const summary = newCount > 0
      ? `Analyse abgeschlossen: ${findings.length} Auffälligkeiten, ${newCount} neue Vorschläge ins Backlog.`
      : findings.length > 0
        ? `Analyse abgeschlossen: ${findings.length} Auffälligkeiten, alle bereits bekannt.`
        : 'Analyse abgeschlossen: Keine Auffälligkeiten. Alles sieht gut aus.';

    log.info(summary);
    return summary;
  } catch (err) {
    const msg = `Analyse fehlgeschlagen: ${String(err)}`;
    log.error(msg);
    return msg;
  }
}

// ═══════════════════════════════════════════════════════════════
// ENERGY ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeEnergy(states: HAState[], now: Date): Finding[] {
  const findings: Finding[] = [];
  const hour = now.getHours();

  // Lights on during daytime (10:00-16:00)
  if (hour >= 10 && hour <= 16) {
    const lightsOn = states.filter(s =>
      s.entity_id.startsWith('light.') && s.state === 'on'
    );
    if (lightsOn.length >= 3) {
      findings.push({
        title: `${lightsOn.length} Lichter tagsüber an`,
        asIs: `${lightsOn.length} Lichter eingeschaltet tagsüber um ${hour}:00. Entitäten: ${lightsOn.slice(0, 5).map(s => s.entity_id).join(', ')}`,
        toBe: 'Tageslicht-Automatisierung: Lichter bei ausreichend Helligkeit automatisch dimmen/ausschalten (z.B. via Helligkeitssensor oder Sonnenstand).',
        impact: 'Energieeinsparung, weniger manuelle Steuerung',
        category: 'energy',
        priority: 'medium',
        tags: ['licht', 'energie', 'tageslicht', 'automatisierung'],
      });
    }
  }

  // Heating in summer (Jun–Sep)
  const month = now.getMonth();
  if (month >= 5 && month <= 8) {
    const heating = states.filter(s =>
      s.entity_id.startsWith('climate.') &&
      (s.state === 'heat' || String(s.attributes['hvac_action']) === 'heating')
    );
    if (heating.length > 0) {
      findings.push({
        title: `${heating.length} Heizungen im Sommer aktiv`,
        asIs: `${heating.length} Klimageräte heizen im Sommermonat.`,
        toBe: 'Saisonale Automatisierung: Heizmodus Mai–September automatisch deaktivieren.',
        impact: 'Erhebliche Energieeinsparung',
        category: 'energy',
        priority: 'high',
        tags: ['heizung', 'energie', 'sommer', 'klima'],
      });
    }
  }

  // Windows open while climate active
  const openContacts = states.filter(s => isWindowOrDoorSensor(s) && s.state === 'on');
  const activeClimate = states.filter(s => s.entity_id.startsWith('climate.') && s.state !== 'off');
  if (openContacts.length > 0 && activeClimate.length > 0) {
    findings.push({
      title: 'Fenster/Tür offen bei aktiver Heizung/Kühlung',
      asIs: `${openContacts.length} Fenster/Türen offen, ${activeClimate.length} Klimageräte aktiv.`,
      toBe: 'Automatisierung: Heizung/Kühlung pausieren wenn Fenster >2 Min geöffnet. Benachrichtigung an Nutzer.',
      impact: 'Signifikante Energieeinsparung, Komfort',
      category: 'energy',
      priority: 'high',
      tags: ['fenster', 'heizung', 'energie', 'automatisierung'],
    });
  }

  // Thermostats set very high (>23°C)
  const hotThermostats = states.filter(s => {
    if (!s.entity_id.startsWith('climate.')) return false;
    const temp = Number(s.attributes['temperature']);
    return !isNaN(temp) && temp > 23;
  });
  if (hotThermostats.length >= 2) {
    findings.push({
      title: `${hotThermostats.length} Thermostate über 23°C`,
      asIs: `Thermostate auf hohe Temperaturen eingestellt: ${hotThermostats.map(s => `${s.entity_id} (${s.attributes['temperature']}°C)`).join(', ')}`,
      toBe: 'Nachtabsenkung und Abwesenheits-Temperatur einrichten. Jedes Grad weniger spart ca. 6% Heizenergie.',
      impact: 'Energieeinsparung bis zu 15-20% Heizkosten',
      category: 'energy',
      priority: 'medium',
      tags: ['heizung', 'energie', 'thermostat', 'temperatur'],
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// SOLAR ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeSolar(states: HAState[]): Finding[] {
  const findings: Finding[] = [];

  // Detect solar/PV sensors
  const solarPower = states.find(s =>
    s.entity_id.includes('solar') || s.entity_id.includes('pv') ||
    s.entity_id.includes('photovoltaik') || s.entity_id.includes('inverter')
  );
  const gridExport = states.find(s =>
    s.entity_id.includes('grid_export') || s.entity_id.includes('einspeisung') ||
    s.entity_id.includes('export_power') || s.entity_id.includes('feed_in')
  );
  const batteryLevel = states.find(s =>
    (s.entity_id.includes('battery') || s.entity_id.includes('speicher') || s.entity_id.includes('akku')) &&
    s.entity_id.startsWith('sensor.') &&
    !isNaN(Number(s.state))
  );

  // Solar present but exporting to grid
  if (solarPower && gridExport) {
    const exportW = Number(gridExport.state);
    if (!isNaN(exportW) && exportW > 500) {
      findings.push({
        title: 'Solarüberschuss wird ins Netz eingespeist',
        asIs: `Aktuell ${exportW}W Einspeisung ins Netz. Geräte könnten stattdessen den Überschuss nutzen.`,
        toBe: 'Solarüberschuss-Automatisierung: Bei >500W Überschuss automatisch Verbraucher einschalten (Warmwasser, Wallbox, Waschmaschine). Priorisierung: 1. Batterie 2. Warmwasser 3. E-Auto 4. Haushaltsgeräte.',
        impact: 'Höhere Eigenverbrauchsquote, weniger Einspeisung zu niedrigen Vergütungen',
        category: 'energy',
        priority: 'high',
        tags: ['solar', 'pv', 'überschuss', 'eigenverbrauch', 'energie'],
      });
    }
  }

  // Solar present but no battery
  if (solarPower && !batteryLevel) {
    findings.push({
      title: 'Solaranlage ohne erkennbaren Batteriespeicher',
      asIs: 'PV-Anlage erkannt, aber kein Batteriespeicher-Sensor gefunden.',
      toBe: 'Falls Speicher vorhanden: Integration prüfen. Falls nicht: Zeitbasierte Verbrauchersteuerung (Waschmaschine, Spülmaschine etc. tagsüber laufen lassen).',
      impact: 'Bessere Solarnutzung ohne Hardware-Investition',
      category: 'energy',
      priority: 'low',
      tags: ['solar', 'batterie', 'eigenverbrauch'],
    });
  }

  // Battery present and full but still exporting
  if (batteryLevel && gridExport) {
    const level = Number(batteryLevel.state);
    const exportW = Number(gridExport.state);
    if (level > 90 && exportW > 200) {
      findings.push({
        title: 'Batterie voll, Überschuss wird eingespeist',
        asIs: `Batterie bei ${level}%, ${exportW}W Einspeisung. Überschuss wird nicht optimal genutzt.`,
        toBe: 'Zusätzliche Verbraucher bei voller Batterie aktivieren: Warmwasser-Booster, E-Auto vorladen, Klimaanlage vorheizen/kühlen.',
        impact: 'Maximierung Eigenverbrauch, Kosten-Optimierung',
        category: 'energy',
        priority: 'medium',
        tags: ['solar', 'batterie', 'überschuss', 'eigenverbrauch'],
      });
    }
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// SECURITY ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeSecurity(states: HAState[], now: Date): Finding[] {
  const findings: Finding[] = [];
  const hour = now.getHours();

  // Detect presence/occupancy
  const presenceSensors = states.filter(s =>
    String(s.attributes['device_class']) === 'occupancy' ||
    String(s.attributes['device_class']) === 'presence' ||
    s.entity_id.includes('person.') ||
    s.entity_id.includes('presence')
  );
  const someoneHome = presenceSensors.some(s => s.state === 'on' || s.state === 'home');
  const hasPresenceDetection = presenceSensors.length > 0;

  // No presence detection at all
  if (!hasPresenceDetection) {
    findings.push({
      title: 'Keine Anwesenheitserkennung konfiguriert',
      asIs: 'Keine Person-Entities oder Anwesenheitssensoren gefunden.',
      toBe: 'Anwesenheitserkennung einrichten (z.B. via Smartphone-Tracking, Bluetooth, Router-Integration). Basis für Abwesenheits-Automatisierungen.',
      impact: 'Ermöglicht: Auto-Heizung-ab, Auto-Licht-aus, Sicherheitsmodus bei Abwesenheit',
      category: 'security',
      priority: 'high',
      tags: ['anwesenheit', 'sicherheit', 'automatisierung'],
    });
  }

  // Nobody home but windows/doors open
  if (hasPresenceDetection && !someoneHome) {
    const openWindows = states.filter(s => isWindowSensor(s) && s.state === 'on');
    if (openWindows.length > 0) {
      findings.push({
        title: `${openWindows.length} Fenster offen bei Abwesenheit`,
        asIs: `Niemand zu Hause, aber ${openWindows.length} Fenster offen: ${openWindows.slice(0, 3).map(s => friendlyName(s)).join(', ')}`,
        toBe: 'Automatisierung: Bei Abwesenheit Fenster-Status prüfen und Benachrichtigung senden. Optional: Alarm aktivieren.',
        impact: 'Einbruchschutz, Wetterschutz (Regen)',
        category: 'security',
        priority: 'high',
        tags: ['fenster', 'abwesenheit', 'sicherheit', 'benachrichtigung'],
      });
    }

    const openDoors = states.filter(s => isDoorSensor(s) && s.state === 'on');
    if (openDoors.length > 0) {
      findings.push({
        title: `${openDoors.length} Türen offen bei Abwesenheit`,
        asIs: `Niemand zu Hause, ${openDoors.length} Türen offen: ${openDoors.slice(0, 3).map(s => friendlyName(s)).join(', ')}`,
        toBe: 'Automatisierung: Türstatus bei Abwesenheit überwachen und sofort benachrichtigen.',
        impact: 'Einbruchschutz',
        category: 'security',
        priority: 'high',
        tags: ['tür', 'abwesenheit', 'sicherheit', 'alarm'],
      });
    }
  }

  // Unlocked locks
  const unlockedLocks = states.filter(s =>
    s.entity_id.startsWith('lock.') && s.state === 'unlocked'
  );
  if (unlockedLocks.length > 0 && (hour >= 22 || hour <= 6)) {
    findings.push({
      title: `${unlockedLocks.length} Schlösser nachts nicht verriegelt`,
      asIs: `${unlockedLocks.length} Schlösser sind um ${hour}:00 Uhr unverriegelt: ${unlockedLocks.map(s => friendlyName(s)).join(', ')}`,
      toBe: 'Nacht-Automatisierung: Schlösser ab 22:00 automatisch verriegeln. Benachrichtigung wenn manuell entriegelt.',
      impact: 'Sicherheit, Einbruchschutz',
      category: 'security',
      priority: 'high',
      tags: ['schloss', 'nacht', 'sicherheit', 'automatisierung'],
    });
  }

  // No alarm system
  const alarmPanels = states.filter(s => s.entity_id.startsWith('alarm_control_panel.'));
  if (alarmPanels.length === 0 && hasPresenceDetection) {
    findings.push({
      title: 'Kein Alarm-System konfiguriert',
      asIs: 'Keine alarm_control_panel Entities gefunden. Anwesenheitserkennung ist vorhanden.',
      toBe: 'HA-eigene Alarmanlage einrichten: Automatisch scharf bei Abwesenheit, Benachrichtigung bei Auslösung.',
      impact: 'Sicherheit ohne zusätzliche Hardware',
      category: 'security',
      priority: 'medium',
      tags: ['alarm', 'sicherheit', 'automatisierung'],
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// MAINTENANCE ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeMaintenance(states: HAState[], now: Date): Finding[] {
  const findings: Finding[] = [];

  // Unavailable entities
  const unavailable = states.filter(s => s.state === 'unavailable');
  if (unavailable.length >= 3) {
    const examples = unavailable.slice(0, 8).map(s => s.entity_id).join(', ');
    findings.push({
      title: `${unavailable.length} Geräte nicht erreichbar`,
      asIs: `${unavailable.length} Entities "unavailable": ${examples}`,
      toBe: 'Geräte prüfen: Strom, WLAN/Zigbee-Verbindung, Integration-Status. Nicht mehr vorhandene Geräte aus HA entfernen.',
      impact: 'Zuverlässigkeit, Sicherheit',
      category: 'maintenance',
      priority: 'high',
      tags: ['unavailable', 'netzwerk', 'wartung'],
    });
  }

  // Stale sensors (no change > 48h, excluding unavailable)
  const staleSensors = states.filter(s => {
    if (!s.entity_id.startsWith('sensor.') && !s.entity_id.startsWith('binary_sensor.')) return false;
    if (s.state === 'unavailable' || s.state === 'unknown') return false;
    const lastChanged = new Date(s.last_changed);
    const hoursAgo = (now.getTime() - lastChanged.getTime()) / 3_600_000;
    return hoursAgo > 48;
  });
  if (staleSensors.length >= 5) {
    const examples = staleSensors.slice(0, 5).map(s => `${s.entity_id} (${Math.round((now.getTime() - new Date(s.last_changed).getTime()) / 3_600_000)}h)`).join(', ');
    findings.push({
      title: `${staleSensors.length} Sensoren seit 48h+ unverändert`,
      asIs: `Sensoren ohne Statuswechsel: ${examples}`,
      toBe: 'Prüfen: Batterie leer? Verbindung verloren? Wenn dauerhaft tot → aus HA entfernen.',
      impact: 'Zuverlässigkeit, frühzeitige Fehlererkennung',
      category: 'maintenance',
      priority: 'low',
      tags: ['sensor', 'wartung', 'batterie', 'diagnose'],
    });
  }

  // Low battery devices
  const lowBattery = states.filter(s => {
    const battLevel = Number(s.attributes['battery_level'] ?? s.attributes['battery'] ?? -1);
    return battLevel >= 0 && battLevel < 20;
  });
  if (lowBattery.length > 0) {
    findings.push({
      title: `${lowBattery.length} Geräte mit niedriger Batterie`,
      asIs: `Geräte unter 20% Batterie: ${lowBattery.map(s => `${friendlyName(s)} (${s.attributes['battery_level'] ?? s.attributes['battery']}%)`).join(', ')}`,
      toBe: 'Batterien zeitnah wechseln. Automatische Benachrichtigung bei <20% einrichten.',
      impact: 'Vermeidet Geräteausfall, proaktive Wartung',
      category: 'maintenance',
      priority: 'medium',
      tags: ['batterie', 'wartung', 'benachrichtigung'],
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// NAMING & LABEL ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeNaming(states: HAState[]): Finding[] {
  const findings: Finding[] = [];

  // Entities without friendly names (using auto-generated IDs)
  const noFriendlyName = states.filter(s => {
    const name = String(s.attributes['friendly_name'] ?? '');
    // Auto-generated names often match the entity_id pattern
    return !name || name === s.entity_id || name === s.entity_id.split('.')[1];
  });
  if (noFriendlyName.length >= 10) {
    findings.push({
      title: `${noFriendlyName.length} Entities ohne sprechenden Namen`,
      asIs: `${noFriendlyName.length} Entities haben keinen friendly_name oder der Name entspricht der entity_id.`,
      toBe: 'Alle aktiv genutzten Entities benennen mit Muster: "[Raum] [Gerätetype] [Nr]" (z.B. "OG Bad Licht 1"). Erleichtert Sprachsteuerung und Übersicht.',
      impact: 'Bedienbarkeit, Sprachsteuerung, Übersichtlichkeit',
      category: 'maintenance',
      priority: 'low',
      tags: ['naming', 'labels', 'organisation'],
    });
  }

  // Inconsistent naming patterns
  const lightNames = states
    .filter(s => s.entity_id.startsWith('light.'))
    .map(s => s.entity_id.split('.')[1]!);
  const namingPatterns = detectNamingPatterns(lightNames);
  if (namingPatterns.inconsistent && lightNames.length >= 5) {
    findings.push({
      title: 'Inkonsistente Entity-ID Namensgebung',
      asIs: `Verschiedene Muster bei Lichtern: ${namingPatterns.examples.join(', ')}. Kein einheitliches Schema erkennbar.`,
      toBe: 'Einheitliches Namensschema einführen: "[kuerzel]_[stockwerk]_[raum]_[nr]" (z.B. lgt_og_bad_1). Alle Domains gleich benennen.',
      impact: 'Wartbarkeit, Automatisierungen einfacher, KI-Steuerung besser',
      category: 'maintenance',
      priority: 'low',
      tags: ['naming', 'convention', 'organisation'],
    });
  }

  // Entities without area assignment
  // We can detect this by checking if areas are empty (requires area data)
  const domainsToCheck = ['light', 'switch', 'climate', 'cover', 'media_player'];
  const actionableEntities = states.filter(s =>
    domainsToCheck.some(d => s.entity_id.startsWith(d + '.'))
  );
  // Heuristic: if no areas are assigned, the entity cache will group everything under "Ohne Bereich"
  // We check for missing area_id in attributes (HA doesn't expose this in states API directly,
  // but we can flag if many entities seem unassigned)

  // Labels check: does HA have labels feature?
  const hasLabels = states.some(s =>
    Array.isArray(s.attributes['labels']) && (s.attributes['labels'] as unknown[]).length > 0
  );
  if (!hasLabels && actionableEntities.length > 20) {
    findings.push({
      title: 'Keine Labels für Geräte-Kategorisierung genutzt',
      asIs: `${actionableEntities.length} steuerbare Entities, aber keine Labels vergeben.`,
      toBe: 'HA Labels nutzen für Gruppierung: "Beleuchtung", "Heizung", "Sicherheit", "Unterhaltung". Ermöglicht Gruppen-Steuerung ("Alle Heizungen aus").',
      impact: 'Bessere Organisation, Gruppen-Automatisierungen möglich',
      category: 'maintenance',
      priority: 'low',
      tags: ['labels', 'organisation', 'gruppierung'],
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// AUTOMATION ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeAutomations(states: HAState[]): Finding[] {
  const findings: Finding[] = [];

  const automations = states.filter(s => s.entity_id.startsWith('automation.'));

  // Disabled automations
  const disabled = automations.filter(s => s.state === 'off');
  if (disabled.length >= 3) {
    findings.push({
      title: `${disabled.length} Automationen deaktiviert`,
      asIs: `${disabled.length} Automationen sind ausgeschaltet: ${disabled.slice(0, 5).map(s => friendlyName(s)).join(', ')}`,
      toBe: 'Prüfen: Noch benötigt? → Aktivieren oder löschen. Deaktivierte Automationen sind tote Konfiguration.',
      impact: 'Sauberkeit, Wartbarkeit',
      category: 'automation',
      priority: 'low',
      tags: ['automation', 'aufräumen', 'organisation'],
    });
  }

  // Automations that never fired
  const neverFired = automations.filter(s => {
    const lastTriggered = s.attributes['last_triggered'];
    return !lastTriggered || lastTriggered === 'None' || lastTriggered === null;
  });
  if (neverFired.length >= 2) {
    findings.push({
      title: `${neverFired.length} Automationen nie ausgelöst`,
      asIs: `Automationen ohne bisherige Auslösung: ${neverFired.slice(0, 5).map(s => friendlyName(s)).join(', ')}`,
      toBe: 'Trigger prüfen: Falsch konfiguriert? Bedingung nie erfüllt? Überflüssig? → Reparieren oder entfernen.',
      impact: 'Aufräumen, potenzielle Fehler finden',
      category: 'automation',
      priority: 'low',
      tags: ['automation', 'trigger', 'diagnose'],
    });
  }

  // Missing common automations (suggest if not present)
  const hasMotionLights = automations.some(s =>
    s.entity_id.includes('motion') || s.entity_id.includes('bewegung') ||
    friendlyName(s).toLowerCase().includes('motion') || friendlyName(s).toLowerCase().includes('bewegung')
  );
  const hasMotionSensors = states.some(s =>
    String(s.attributes['device_class']) === 'motion'
  );
  if (hasMotionSensors && !hasMotionLights) {
    findings.push({
      title: 'Bewegungsmelder ohne Licht-Automatisierung',
      asIs: 'Bewegungsmelder vorhanden, aber keine Automation die Lichter bei Bewegung steuert.',
      toBe: 'Automatisierung: Licht bei Bewegung einschalten, nach X Minuten ohne Bewegung ausschalten.',
      impact: 'Komfort, Energieeinsparung (Licht aus wenn niemand im Raum)',
      category: 'comfort',
      priority: 'medium',
      tags: ['bewegung', 'licht', 'automatisierung', 'komfort'],
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function friendlyName(s: HAState): string {
  return String(s.attributes['friendly_name'] ?? s.entity_id);
}

function isWindowSensor(s: HAState): boolean {
  return s.entity_id.startsWith('binary_sensor.') && (
    String(s.attributes['device_class']) === 'window' ||
    s.entity_id.includes('window') || s.entity_id.includes('fenster')
  );
}

function isDoorSensor(s: HAState): boolean {
  return s.entity_id.startsWith('binary_sensor.') && (
    String(s.attributes['device_class']) === 'door' ||
    s.entity_id.includes('door') || s.entity_id.includes('tuer')
  );
}

function isWindowOrDoorSensor(s: HAState): boolean {
  return isWindowSensor(s) || isDoorSensor(s);
}

function detectNamingPatterns(names: string[]): { inconsistent: boolean; examples: string[] } {
  if (names.length < 3) return { inconsistent: false, examples: [] };

  // Check if names follow similar patterns
  const hasUnderscore = names.filter(n => n.includes('_')).length;
  const hasCamel = names.filter(n => /[a-z][A-Z]/.test(n)).length;
  const hasDash = names.filter(n => n.includes('-')).length;

  const total = names.length;
  const dominant = Math.max(hasUnderscore, hasCamel, hasDash);
  const inconsistent = dominant < total * 0.7; // less than 70% follow one pattern

  return {
    inconsistent,
    examples: names.slice(0, 4),
  };
}

/**
 * Write findings to backlog, skipping any that already exist
 * (matches by title, includes ALL statuses: proposed, approved, rejected, deferred, done).
 */
async function writeFindings(findings: Finding[], existingTasks: BacklogTask[]): Promise<number> {
  // Build set of ALL existing titles (including rejected, deferred, done)
  // This prevents re-proposing items the user already decided on
  const knownTitles = new Set(existingTasks.map(t => t.title));

  let newCount = 0;
  for (const f of findings) {
    if (knownTitles.has(f.title)) continue;
    await createTask({
      title: f.title,
      asIs: f.asIs,
      toBe: f.toBe,
      impact: f.impact,
      category: f.category,
      priority: f.priority,
      tags: f.tags,
      proposedBy: 'analysis',
    });
    newCount++;
  }
  return newCount;
}
