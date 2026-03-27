/**
 * proactive-analysis.ts – Periodic analysis of the HA environment.
 *
 * Runs on a schedule (default: every 6 hours) and produces insights:
 * - Devices stuck in unexpected states (lights on during day, heaters on in summer)
 * - Unused automations
 * - Entities that haven't changed in a long time (possibly dead sensors)
 * - Energy-saving opportunities
 *
 * Findings are written as backlog proposals for the user to review.
 */

import * as ha from './ha-client.js';
import { createLogger } from './logger.js';
import { createTask, listTasks } from '../storage/backlog.js';

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

/**
 * Run a full analysis of the HA environment.
 * Returns a human-readable summary of findings.
 */
export async function runAnalysis(): Promise<string> {
  log.info('Proactive analysis started');
  const findings: Finding[] = [];

  try {
    const states = await ha.getStates();
    const now = new Date();
    const hour = now.getHours();

    // ── Analysis 1: Lights on during daytime (10:00-16:00) ──
    if (hour >= 10 && hour <= 16) {
      const lightsOn = states.filter(s =>
        s.entity_id.startsWith('light.') && s.state === 'on'
      );
      if (lightsOn.length >= 3) {
        findings.push({
          title: `${lightsOn.length} Lichter tagsüber an`,
          asIs: `${lightsOn.length} Lichter sind eingeschaltet obwohl es Tag ist (${hour}:00 Uhr).`,
          toBe: 'Automatische Tageslichtabschaltung: Lichter bei ausreichend Sonnenlicht automatisch dimmen/ausschalten.',
          impact: 'Energieeinsparung, weniger manuelle Steuerung',
          category: 'energy',
          priority: 'medium',
          tags: ['licht', 'energie', 'automatisierung', 'tageslicht'],
        });
      }
    }

    // ── Analysis 2: Stale sensors (no change > 24h) ──
    const staleSensors = states.filter(s => {
      if (!s.entity_id.startsWith('sensor.') && !s.entity_id.startsWith('binary_sensor.')) return false;
      const lastChanged = new Date(s.last_changed);
      const hoursAgo = (now.getTime() - lastChanged.getTime()) / 3_600_000;
      return hoursAgo > 24 && s.state !== 'unavailable';
    });
    if (staleSensors.length >= 5) {
      const examples = staleSensors.slice(0, 5).map(s => s.entity_id).join(', ');
      findings.push({
        title: `${staleSensors.length} Sensoren seit 24h+ unverändert`,
        asIs: `${staleSensors.length} Sensoren haben sich seit über 24 Stunden nicht verändert. Beispiele: ${examples}`,
        toBe: 'Prüfen ob Sensoren noch funktionieren (Batterie leer, Verbindung verloren, defekt).',
        impact: 'Zuverlässigkeit des Smart Home, frühzeitige Fehlererkennung',
        category: 'maintenance',
        priority: 'low',
        tags: ['sensor', 'wartung', 'batterie', 'diagnose'],
      });
    }

    // ── Analysis 3: Unavailable entities ──
    const unavailable = states.filter(s => s.state === 'unavailable');
    if (unavailable.length >= 3) {
      const examples = unavailable.slice(0, 5).map(s => s.entity_id).join(', ');
      findings.push({
        title: `${unavailable.length} Geräte nicht erreichbar`,
        asIs: `${unavailable.length} Entities sind "unavailable". Beispiele: ${examples}`,
        toBe: 'Geräte prüfen: Strom, WLAN/Zigbee-Verbindung, Integration-Status in HA.',
        impact: 'Funktionsfähigkeit, Sicherheit (wenn Sensoren betroffen)',
        category: 'maintenance',
        priority: 'high',
        tags: ['unavailable', 'netzwerk', 'wartung'],
      });
    }

    // ── Analysis 4: Climate devices in heating mode during warm months ──
    const month = now.getMonth(); // 0-based, 5-8 = Jun-Sep
    if (month >= 5 && month <= 8) {
      const heating = states.filter(s =>
        s.entity_id.startsWith('climate.') &&
        (s.state === 'heat' || String(s.attributes['hvac_action']) === 'heating')
      );
      if (heating.length > 0) {
        findings.push({
          title: `${heating.length} Heizungen im Sommer aktiv`,
          asIs: `${heating.length} Klimageräte heizen obwohl Sommermonat (${['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][month]}).`,
          toBe: 'Saisonale Automatisierung: Heizung im Sommer automatisch in Standby versetzen.',
          impact: 'Erhebliche Energieeinsparung',
          category: 'energy',
          priority: 'high',
          tags: ['heizung', 'energie', 'sommer', 'klima'],
        });
      }
    }

    // ── Analysis 5: Windows/doors open while climate active ──
    const openContacts = states.filter(s =>
      s.entity_id.startsWith('binary_sensor.') &&
      s.state === 'on' &&
      (s.entity_id.includes('window') || s.entity_id.includes('door') ||
       s.entity_id.includes('fenster') || s.entity_id.includes('tuer') ||
       String(s.attributes['device_class']) === 'window' ||
       String(s.attributes['device_class']) === 'door')
    );
    const activeClimate = states.filter(s =>
      s.entity_id.startsWith('climate.') && s.state !== 'off'
    );
    if (openContacts.length > 0 && activeClimate.length > 0) {
      findings.push({
        title: 'Fenster/Tür offen bei aktiver Heizung/Kühlung',
        asIs: `${openContacts.length} Fenster/Türen offen während ${activeClimate.length} Klimageräte aktiv sind.`,
        toBe: 'Automatisierung: Heizung/Kühlung pausieren wenn Fenster geöffnet wird.',
        impact: 'Signifikante Energieeinsparung',
        category: 'energy',
        priority: 'high',
        tags: ['fenster', 'heizung', 'energie', 'automatisierung'],
      });
    }

    // ── Write findings to backlog (avoid duplicates) ──
    const existingTasks = await listTasks({});
    const existingTitles = new Set(existingTasks.map(t => t.title));
    let newCount = 0;

    for (const f of findings) {
      if (existingTitles.has(f.title)) continue; // skip duplicate
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

    const summary = newCount > 0
      ? `Analyse abgeschlossen: ${findings.length} Auffälligkeiten gefunden, ${newCount} neue Vorschläge ins Backlog geschrieben.`
      : findings.length > 0
        ? `Analyse abgeschlossen: ${findings.length} Auffälligkeiten, aber alle bereits im Backlog bekannt.`
        : 'Analyse abgeschlossen: Keine Auffälligkeiten gefunden. Alles sieht gut aus.';

    log.info(summary);
    return summary;

  } catch (err) {
    const msg = `Analyse fehlgeschlagen: ${String(err)}`;
    log.error(msg);
    return msg;
  }
}
