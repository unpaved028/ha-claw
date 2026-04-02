/**
 * proactive-analysis.ts – Periodic analysis of the HA environment.
 *
 * Modules:
 * - Energy: lights left on, heating in summer, windows open + climate, standby waste
 * - Solar: grid export, battery usage, surplus routing
 * - Security: doors/windows open, locks, smoke detectors, water leak sensors
 * - Covers: storm protection, dusk/dawn, seasonal solar shading
 * - Climate: humidity/mold risk, temperature differentials between rooms
 * - Maintenance: stale sensors, unavailable entities, low battery
 * - Naming: inconsistent entity naming, missing labels/areas
 * - Automation: unused automations, missing common automations, night mode
 *
 * IMPORTANT: Only the top 3 most impactful findings are written to backlog per run.
 * Existing backlog items (including rejected/deferred) are considered to avoid duplicates.
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

    // Collect all findings from all modules
    const findings: Finding[] = [
      ...analyzeEnergy(states, now),
      ...analyzeSolar(states),
      ...analyzeSecurity(states, now),
      ...analyzeCovers(states, now),
      ...analyzeClimate(states),
      ...analyzeMaintenance(states, now),
      ...analyzeNaming(states),
      ...analyzeAutomations(states, now),
    ];

    // Sort by priority (high=3, medium=2, low=1), take top 3
    const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };
    findings.sort(
      (a, b) => (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0),
    );
    const top3 = findings.slice(0, 3);

    // Write only top 3 to backlog, respecting existing items (including rejected/deferred)
    const newCount = await writeFindings(top3, existingTasks);

    const summary =
      newCount > 0
        ? `Analyse abgeschlossen: ${findings.length} Auffälligkeiten gefunden, Top ${top3.length} priorisiert, ${newCount} neue Vorschläge ins Backlog.`
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
    const lightsOn = states.filter(s => s.entity_id.startsWith('light.') && s.state === 'on');
    if (lightsOn.length >= 3) {
      findings.push({
        title: `${lightsOn.length} Lichter tagsüber an`,
        asIs: `${lightsOn.length} Lichter eingeschaltet tagsüber um ${hour}:00. Entitäten: ${lightsOn
          .slice(0, 5)
          .map(s => s.entity_id)
          .join(', ')}`,
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
    const heating = states.filter(
      s =>
        s.entity_id.startsWith('climate.') &&
        (s.state === 'heat' || String(s.attributes['hvac_action']) === 'heating'),
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
  const solarPower = states.find(
    s =>
      s.entity_id.includes('solar') ||
      s.entity_id.includes('pv') ||
      s.entity_id.includes('photovoltaik') ||
      s.entity_id.includes('inverter'),
  );
  const gridExport = states.find(
    s =>
      s.entity_id.includes('grid_export') ||
      s.entity_id.includes('einspeisung') ||
      s.entity_id.includes('export_power') ||
      s.entity_id.includes('feed_in'),
  );
  const batteryLevel = states.find(
    s =>
      (s.entity_id.includes('battery') ||
        s.entity_id.includes('speicher') ||
        s.entity_id.includes('akku')) &&
      s.entity_id.startsWith('sensor.') &&
      !isNaN(Number(s.state)),
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
// COVER / RAFFSTORE ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeCovers(states: HAState[], now: Date): Finding[] {
  const findings: Finding[] = [];
  const month = now.getMonth(); // 0-based: 0=Jan, 5=Jun, 11=Dec
  const hour = now.getHours();
  const isSummer = month >= 4 && month <= 8; // May–Sep

  const covers = states.filter(s => s.entity_id.startsWith('cover.'));
  if (covers.length === 0) return findings;

  // Wind sensor detection
  const windSensor = states.find(
    s =>
      s.entity_id.startsWith('sensor.') &&
      (String(s.attributes['device_class']) === 'wind_speed' ||
        s.entity_id.includes('wind') ||
        s.entity_id.includes('gust')),
  );

  // Storm protection: covers down while wind is high
  if (windSensor) {
    const windSpeed = Number(windSensor.state);
    const closedCovers = covers.filter(
      s => s.state === 'closed' || Number(s.attributes['current_position']) < 20,
    );
    if (!isNaN(windSpeed) && windSpeed > 60 && closedCovers.length > 0) {
      findings.push({
        title: 'Sturmschutz für Raffstores fehlt',
        asIs: `Windgeschwindigkeit ${windSpeed} km/h, aber ${closedCovers.length} Raffstores sind unten. Sturmschaden-Risiko.`,
        toBe: 'Automatisierung: Bei Wind >50 km/h alle Raffstores automatisch hochfahren. Windwächter-Automatisierung in HA einrichten.',
        impact: 'Schutz vor Sturmschäden an Raffstores/Jalousien',
        category: 'security',
        priority: 'high',
        tags: ['cover', 'raffstore', 'sturm', 'wind', 'sicherheit'],
      });
    }
    // No storm automation exists: suggest one
    const automations = states.filter(s => s.entity_id.startsWith('automation.'));
    const hasStormAutomation = automations.some(
      s =>
        s.entity_id.includes('wind') ||
        s.entity_id.includes('sturm') ||
        s.entity_id.includes('storm') ||
        friendlyName(s).toLowerCase().includes('wind') ||
        friendlyName(s).toLowerCase().includes('sturm'),
    );
    if (!hasStormAutomation) {
      findings.push({
        title: 'Keine Windwächter-Automatisierung für Raffstores',
        asIs: `${covers.length} Covers vorhanden, Windsensor erkannt, aber keine Sturmschutz-Automatisierung.`,
        toBe: 'Windwächter einrichten: Bei >50 km/h Raffstores hoch, nach 30 Min Wind-Check, bei <30 km/h wieder freigeben.',
        impact: 'Verhindert Sturmschäden an Raffstores/Jalousien',
        category: 'security',
        priority: 'high',
        tags: ['cover', 'raffstore', 'wind', 'automatisierung'],
      });
    }
  }

  // Dusk/dawn automation: covers open during day, closed at night
  const automations = states.filter(s => s.entity_id.startsWith('automation.'));
  const hasDawnDuskAutomation = automations.some(s => {
    const id = s.entity_id.toLowerCase();
    const name = friendlyName(s).toLowerCase();
    return (
      (id + name).match(/dämmerung|sonnenauf|sonnenunter|dawn|dusk|sunrise|sunset/) !== null &&
      (id + name).match(/cover|raffstore|jalousie|rollo|beschattung/) !== null
    );
  });
  if (!hasDawnDuskAutomation && covers.length >= 2) {
    findings.push({
      title: 'Keine Dämmerungssteuerung für Raffstores',
      asIs: `${covers.length} Covers vorhanden, aber keine Automatisierung für Sonnenauf-/untergang.`,
      toBe: 'Automatisierung: Raffstores bei Sonnenaufgang öffnen, bei Sonnenuntergang schließen. Erhöht Privatsphäre und Einbruchschutz abends.',
      impact: 'Komfort, Privatsphäre, Wärmedämmung nachts',
      category: 'comfort',
      priority: 'medium',
      tags: ['cover', 'raffstore', 'dämmerung', 'sonnenuntergang', 'automatisierung'],
    });
  }

  // Seasonal solar shading (summer only)
  if (isSummer && covers.length >= 2) {
    const hasShadingAutomation = automations.some(s => {
      const id = s.entity_id.toLowerCase();
      const name = friendlyName(s).toLowerCase();
      return (id + name).match(/beschattung|shading|solar.*cover|sonnenschutz/) !== null;
    });
    if (!hasShadingAutomation) {
      findings.push({
        title: 'Keine Sonnenschutz-Beschattung im Sommer',
        asIs: `Sommer, ${covers.length} Covers vorhanden, aber keine Beschattungs-Automatisierung. Räume heizen sich auf.`,
        toBe: 'Automatisierung: Süd-/West-Raffstores bei direkter Sonneneinstrahlung teilschließen (50%). Azimut+Elevation-basiert oder via Helligkeitssensor. Nur Mai–September aktiv, im Winter offen lassen für passive Solarwärme.',
        impact: 'Reduziert Kühlbedarf um bis zu 30%, spart Klimatisierungsenergie',
        category: 'energy',
        priority: 'high',
        tags: ['cover', 'raffstore', 'beschattung', 'solar', 'sommer', 'energie'],
      });
    }
  }

  // Covers still closed during daytime (possible forgotten state)
  if (hour >= 10 && hour <= 17) {
    const allClosed = covers.filter(
      s => s.state === 'closed' || Number(s.attributes['current_position']) === 0,
    );
    if (allClosed.length === covers.length && covers.length >= 3) {
      findings.push({
        title: 'Alle Raffstores tagsüber geschlossen',
        asIs: `Alle ${covers.length} Raffstores um ${hour}:00 komplett geschlossen.`,
        toBe: 'Prüfen: Sollte dies so sein? Automatisierung für tageslichtabhängiges Öffnen einrichten.',
        impact: 'Tageslichtnutzung, Wohlbefinden, Energieeinsparung (weniger Kunstlicht)',
        category: 'comfort',
        priority: 'low',
        tags: ['cover', 'raffstore', 'tageslicht'],
      });
    }
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// CLIMATE / HUMIDITY ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeClimate(states: HAState[]): Finding[] {
  const findings: Finding[] = [];

  // Humidity / mold risk (>65% in any room)
  const humiditySensors = states.filter(
    s =>
      s.entity_id.startsWith('sensor.') &&
      (String(s.attributes['device_class']) === 'humidity' ||
        s.entity_id.includes('humidity') ||
        s.entity_id.includes('feuchte')) &&
      !isNaN(Number(s.state)),
  );
  const highHumidity = humiditySensors.filter(s => Number(s.state) > 65);
  if (highHumidity.length > 0) {
    findings.push({
      title: `Schimmelrisiko: ${highHumidity.length} Räume mit hoher Luftfeuchtigkeit`,
      asIs: `Luftfeuchtigkeit >65%: ${highHumidity.map(s => `${friendlyName(s)} (${s.state}%)`).join(', ')}`,
      toBe: 'Automatisierung: Bei >65% Lüftungserinnerung senden. Bei >70% Alarm + ggf. Entfeuchter einschalten. Ideal: 40-60%.',
      impact: 'Gesundheit, Bausubstanzschutz, Schimmelvermeidung',
      category: 'health',
      priority: 'high',
      tags: ['feuchtigkeit', 'schimmel', 'gesundheit', 'lüften'],
    });
  }

  // Large temperature differences between rooms (>5°C)
  const tempSensors = states.filter(
    s =>
      s.entity_id.startsWith('sensor.') &&
      (String(s.attributes['device_class']) === 'temperature' ||
        s.entity_id.includes('temperature') ||
        s.entity_id.includes('temperatur')) &&
      !isNaN(Number(s.state)) &&
      Number(s.state) > 5 &&
      Number(s.state) < 40,
  );
  if (tempSensors.length >= 3) {
    const temps = tempSensors.map(s => Number(s.state));
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    if (maxTemp - minTemp > 5) {
      const coldest = tempSensors.find(s => Number(s.state) === minTemp)!;
      const warmest = tempSensors.find(s => Number(s.state) === maxTemp)!;
      findings.push({
        title: 'Große Temperaturdifferenz zwischen Räumen',
        asIs: `${(maxTemp - minTemp).toFixed(1)}°C Unterschied: ${friendlyName(warmest)} (${maxTemp}°C) vs ${friendlyName(coldest)} (${minTemp}°C)`,
        toBe: 'Heizkreise ausbalancieren. Thermostat-Sollwerte prüfen. Evtl. Türen zwischen Räumen automatisch steuern oder Heizzeiten anpassen.',
        impact: 'Komfort, gleichmäßige Wärmeverteilung, Energieeffizienz',
        category: 'energy',
        priority: 'medium',
        tags: ['temperatur', 'heizung', 'komfort', 'balance'],
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
  const presenceSensors = states.filter(
    s =>
      String(s.attributes['device_class']) === 'occupancy' ||
      String(s.attributes['device_class']) === 'presence' ||
      s.entity_id.includes('person.') ||
      s.entity_id.includes('presence'),
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
        asIs: `Niemand zu Hause, aber ${openWindows.length} Fenster offen: ${openWindows
          .slice(0, 3)
          .map(s => friendlyName(s))
          .join(', ')}`,
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
        asIs: `Niemand zu Hause, ${openDoors.length} Türen offen: ${openDoors
          .slice(0, 3)
          .map(s => friendlyName(s))
          .join(', ')}`,
        toBe: 'Automatisierung: Türstatus bei Abwesenheit überwachen und sofort benachrichtigen.',
        impact: 'Einbruchschutz',
        category: 'security',
        priority: 'high',
        tags: ['tür', 'abwesenheit', 'sicherheit', 'alarm'],
      });
    }
  }

  // Unlocked locks
  const unlockedLocks = states.filter(
    s => s.entity_id.startsWith('lock.') && s.state === 'unlocked',
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

  // Smoke detectors – check if any exist
  const smokeDetectors = states.filter(
    s =>
      String(s.attributes['device_class']) === 'smoke' ||
      s.entity_id.includes('smoke') ||
      s.entity_id.includes('rauchmelder'),
  );
  if (smokeDetectors.length === 0) {
    findings.push({
      title: 'Keine Rauchmelder in Home Assistant integriert',
      asIs: 'Keine Rauchmelder-Entities gefunden. Smarte Rauchmelder ermöglichen Benachrichtigung auch unterwegs.',
      toBe: 'Smarte Rauchmelder integrieren (z.B. Zigbee). Automatisierung: Bei Alarm → Push-Benachrichtigung, Lichter an, Rollläden hoch.',
      impact: 'Lebensrettend, Frühwarnung auch bei Abwesenheit',
      category: 'security',
      priority: 'medium',
      tags: ['rauchmelder', 'sicherheit', 'brand', 'benachrichtigung'],
    });
  }

  // Water leak sensors
  const waterLeakSensors = states.filter(
    s =>
      String(s.attributes['device_class']) === 'moisture' ||
      s.entity_id.includes('water_leak') ||
      s.entity_id.includes('wasserleck') ||
      s.entity_id.includes('leak'),
  );
  if (waterLeakSensors.length === 0) {
    // Only suggest if there are enough other sensors (user has smart home infra)
    const totalSensors = states.filter(
      s => s.entity_id.startsWith('sensor.') || s.entity_id.startsWith('binary_sensor.'),
    ).length;
    if (totalSensors > 20) {
      findings.push({
        title: 'Keine Wasserleck-Sensoren integriert',
        asIs: 'Keine Wasserleck-Sensoren gefunden. Wasserschäden sind teuer und vermeidbar.',
        toBe: 'Wasserleck-Sensoren unter Waschmaschine, Spülmaschine, Waschbecken. Automatisierung: Bei Leck → Alarm + Hauptwasserventil schließen (falls smart).',
        impact: 'Schadenvermeidung, frühzeitige Warnung bei Wasserschäden',
        category: 'security',
        priority: 'low',
        tags: ['wasser', 'leck', 'sicherheit', 'sensor'],
      });
    }
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
    const examples = unavailable
      .slice(0, 8)
      .map(s => s.entity_id)
      .join(', ');
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
    if (!s.entity_id.startsWith('sensor.') && !s.entity_id.startsWith('binary_sensor.'))
      return false;
    if (s.state === 'unavailable' || s.state === 'unknown') return false;
    const lastChanged = new Date(s.last_changed);
    const hoursAgo = (now.getTime() - lastChanged.getTime()) / 3_600_000;
    return hoursAgo > 48;
  });
  if (staleSensors.length >= 5) {
    const examples = staleSensors
      .slice(0, 5)
      .map(
        s =>
          `${s.entity_id} (${Math.round((now.getTime() - new Date(s.last_changed).getTime()) / 3_600_000)}h)`,
      )
      .join(', ');
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
    domainsToCheck.some(d => s.entity_id.startsWith(d + '.')),
  );
  // Heuristic: if no areas are assigned, the entity cache will group everything under "Ohne Bereich"
  // We check for missing area_id in attributes (HA doesn't expose this in states API directly,
  // but we can flag if many entities seem unassigned)

  // Labels check: does HA have labels feature?
  const hasLabels = states.some(
    s => Array.isArray(s.attributes['labels']) && (s.attributes['labels'] as unknown[]).length > 0,
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

function analyzeAutomations(states: HAState[], now: Date): Finding[] {
  const findings: Finding[] = [];

  const automations = states.filter(s => s.entity_id.startsWith('automation.'));

  // Disabled automations
  const disabled = automations.filter(s => s.state === 'off');
  if (disabled.length >= 3) {
    findings.push({
      title: `${disabled.length} Automationen deaktiviert`,
      asIs: `${disabled.length} Automationen sind ausgeschaltet: ${disabled
        .slice(0, 5)
        .map(s => friendlyName(s))
        .join(', ')}`,
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
      asIs: `Automationen ohne bisherige Auslösung: ${neverFired
        .slice(0, 5)
        .map(s => friendlyName(s))
        .join(', ')}`,
      toBe: 'Trigger prüfen: Falsch konfiguriert? Bedingung nie erfüllt? Überflüssig? → Reparieren oder entfernen.',
      impact: 'Aufräumen, potenzielle Fehler finden',
      category: 'automation',
      priority: 'low',
      tags: ['automation', 'trigger', 'diagnose'],
    });
  }

  // Missing common automations (suggest if not present)
  const hasMotionLights = automations.some(
    s =>
      s.entity_id.includes('motion') ||
      s.entity_id.includes('bewegung') ||
      friendlyName(s).toLowerCase().includes('motion') ||
      friendlyName(s).toLowerCase().includes('bewegung'),
  );
  const hasMotionSensors = states.some(s => String(s.attributes['device_class']) === 'motion');
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

  // Night mode: lights on between 1:00-5:00
  const hour = now.getHours();
  if (hour >= 1 && hour <= 5) {
    const nightLights = states.filter(s => s.entity_id.startsWith('light.') && s.state === 'on');
    if (nightLights.length >= 2) {
      findings.push({
        title: `${nightLights.length} Lichter mitten in der Nacht an`,
        asIs: `Um ${hour}:00 Uhr sind ${nightLights.length} Lichter eingeschaltet: ${nightLights
          .slice(0, 4)
          .map(s => friendlyName(s))
          .join(', ')}`,
        toBe: 'Nachtmodus einrichten: Alle Lichter ab 1:00 automatisch aus (außer Nachtlicht). Benachrichtigung wenn Licht manuell eingeschaltet wird.',
        impact: 'Energieeinsparung, besserer Schlaf, Erkennung vergessener Lichter',
        category: 'energy',
        priority: 'medium',
        tags: ['nacht', 'licht', 'energie', 'automatisierung'],
      });
    }
  }

  // Standby power waste: smart plugs with low but non-zero power
  const smartPlugs = states.filter(s => {
    if (!s.entity_id.startsWith('sensor.')) return false;
    const power = Number(s.state);
    const unit = String(s.attributes['unit_of_measurement'] ?? '');
    return (
      unit === 'W' &&
      power > 2 &&
      power < 15 &&
      (s.entity_id.includes('plug') ||
        s.entity_id.includes('steckdose') ||
        s.entity_id.includes('power'))
    );
  });
  if (smartPlugs.length >= 2) {
    const totalStandby = smartPlugs.reduce((sum, s) => sum + Number(s.state), 0);
    findings.push({
      title: `${smartPlugs.length} Geräte im Standby verbrauchen ${totalStandby.toFixed(0)}W`,
      asIs: `Standby-Verbrauch: ${smartPlugs.map(s => `${friendlyName(s)} (${s.state}W)`).join(', ')}`,
      toBe: 'Automatisierung: Geräte bei Nichtnutzung komplett ausschalten. Zeitbasiert oder via Abwesenheit. Spart ca. ${(totalStandby * 8.76).toFixed(0)} kWh/Jahr.',
      impact: 'Energieeinsparung, Kostenreduktion',
      category: 'energy',
      priority: 'low',
      tags: ['standby', 'strom', 'energie', 'steckdose'],
    });
  }

  // Missing notification automations (no notify service used)
  const hasNotifyAutomation = automations.some(s => {
    const id = s.entity_id.toLowerCase();
    const name = friendlyName(s).toLowerCase();
    return (id + name).match(/notify|benachricht|alert|push|telegram|mail/) !== null;
  });
  if (!hasNotifyAutomation && automations.length >= 3) {
    findings.push({
      title: 'Keine Benachrichtigungs-Automatisierungen vorhanden',
      asIs: `${automations.length} Automationen, aber keine nutzt Benachrichtigungen.`,
      toBe: 'Benachrichtigungen einrichten für: Tür offen bei Abwesenheit, Waschmaschine fertig, niedrige Batterie, Temperatur-Alarm.',
      impact: 'Proaktive Information, schnellere Reaktion auf Ereignisse',
      category: 'comfort',
      priority: 'medium',
      tags: ['benachrichtigung', 'push', 'automatisierung'],
    });
  }

  // Vacation mode: nobody home for extended period, no vacation automation
  const presenceSensors = states.filter(
    s => s.entity_id.startsWith('person.') || String(s.attributes['device_class']) === 'presence',
  );
  const allAway =
    presenceSensors.length > 0 &&
    presenceSensors.every(s => s.state === 'not_home' || s.state === 'off');
  if (allAway) {
    const hasVacationMode = automations.some(s => {
      const id = s.entity_id.toLowerCase();
      const name = friendlyName(s).toLowerCase();
      return (id + name).match(/urlaub|vacation|away|abwesen/) !== null;
    });
    if (!hasVacationMode) {
      findings.push({
        title: 'Kein Urlaubsmodus konfiguriert',
        asIs: 'Alle Personen abwesend, aber kein Urlaubsmodus vorhanden.',
        toBe: 'Urlaubsmodus einrichten: Heizung absenken, Anwesenheitssimulation (Lichter zufällig ein/aus), Rollläden normal fahren, Benachrichtigung bei Bewegung.',
        impact: 'Einbruchschutz, Energieeinsparung bei längerer Abwesenheit',
        category: 'security',
        priority: 'medium',
        tags: ['urlaub', 'abwesenheit', 'simulation', 'sicherheit'],
      });
    }
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
  return (
    s.entity_id.startsWith('binary_sensor.') &&
    (String(s.attributes['device_class']) === 'window' ||
      s.entity_id.includes('window') ||
      s.entity_id.includes('fenster'))
  );
}

function isDoorSensor(s: HAState): boolean {
  return (
    s.entity_id.startsWith('binary_sensor.') &&
    (String(s.attributes['device_class']) === 'door' ||
      s.entity_id.includes('door') ||
      s.entity_id.includes('tuer'))
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
