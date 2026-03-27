/**
 * entity-cache.ts – Fetches all HA entities at startup and builds a compact
 * summary for injection into the agent system prompt.
 *
 * Groups entities by AREA (room) first, then by domain within each area.
 * Entities without an area are grouped under "Ohne Bereich".
 * This makes it much easier for the LLM to understand spatial context.
 */

import * as ha from './ha-client.js';
import { createLogger } from './logger.js';

const log = createLogger('entity-cache');

let cachedSummary = '';

/**
 * Fetch all entities, resolve area mappings, and build a compact summary.
 * Called once at startup. Failures are non-fatal.
 */
export async function buildEntityCache(): Promise<string> {
  try {
    const [states, areaMap] = await Promise.all([
      ha.getStates(),
      ha.getAreaEntityMap(),
    ]);

    log.info('Entity cache: fetched data', {
      entities: states.length,
      areas: Object.keys(areaMap).length,
    });

    // Build reverse map: entity_id → area_name
    const entityToArea = new Map<string, string>();
    for (const [areaName, entityIds] of Object.entries(areaMap)) {
      for (const eid of entityIds) {
        entityToArea.set(eid, areaName);
      }
    }

    // Build state lookup
    const stateMap = new Map<string, { id: string; name: string; state: string; domain: string }>();
    for (const s of states) {
      const dot = s.entity_id.indexOf('.');
      const domain = s.entity_id.slice(0, dot);
      const name = String(s.attributes['friendly_name'] ?? '');
      stateMap.set(s.entity_id, { id: s.entity_id, name, state: s.state, domain });
    }

    // Group: area → domain → entities
    const grouped = new Map<string, Map<string, { id: string; name: string; state: string }[]>>();

    for (const [eid, info] of stateMap) {
      const area = entityToArea.get(eid) || 'Ohne Bereich';
      if (!grouped.has(area)) grouped.set(area, new Map());
      const domainMap = grouped.get(area)!;
      if (!domainMap.has(info.domain)) domainMap.set(info.domain, []);
      domainMap.get(info.domain)!.push({ id: info.id, name: info.name, state: info.state });
    }

    // Build compact text
    const lines: string[] = [];

    // Important areas first (sorted), "Ohne Bereich" last
    const areaNames = [...grouped.keys()].sort((a, b) => {
      if (a === 'Ohne Bereich') return 1;
      if (b === 'Ohne Bereich') return -1;
      return a.localeCompare(b, 'de');
    });

    // Only show actionable domains in cache (skip sensor, binary_sensor etc. to save tokens)
    const ACTIONABLE_DOMAINS = new Set([
      'light', 'switch', 'scene', 'media_player', 'cover', 'fan',
      'climate', 'vacuum', 'humidifier', 'water_heater', 'script',
      'input_boolean', 'input_number', 'input_select', 'input_text',
      'number', 'select', 'button', 'lock', 'alarm_control_panel',
      'automation',
    ]);

    for (const area of areaNames) {
      const domainMap = grouped.get(area)!;
      const relevantDomains = [...domainMap.keys()].filter(d => ACTIONABLE_DOMAINS.has(d)).sort();
      if (relevantDomains.length === 0) continue; // skip areas with only sensors

      lines.push(`## ${area}`);
      for (const domain of relevantDomains) {
        const entities = domainMap.get(domain)!;
        for (const e of entities) {
          const label = e.name ? `${e.name}` : e.id;
          lines.push(`- ${label} → \`${e.id}\` (${e.state})`);
        }
      }
      lines.push('');
    }

    // Append a sensor summary (count only, not individual entities)
    const sensorCount = states.filter(s => s.entity_id.startsWith('sensor.')).length;
    const binarySensorCount = states.filter(s => s.entity_id.startsWith('binary_sensor.')).length;
    lines.push(`_Sensoren: ${sensorCount} sensor, ${binarySensorCount} binary_sensor – nutze ha_search_entities oder ha_get_state um Sensorwerte abzufragen._`);

    cachedSummary = lines.join('\n');
    log.info('Entity cache built', {
      areas: areaNames.length,
      chars: cachedSummary.length,
    });

    return cachedSummary;
  } catch (err) {
    log.warn('Entity cache build failed – agent will work without cache', {
      error: String(err),
    });
    cachedSummary = '(Entity-Cache nicht verfügbar – nutze ha_search_entities zum Suchen.)';
    return cachedSummary;
  }
}

/**
 * Get the cached entity summary (empty string if not yet built).
 */
export function getEntityCache(): string {
  return cachedSummary;
}
