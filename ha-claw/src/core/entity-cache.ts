/**
 * entity-cache.ts – Fetches all HA entities at startup and builds a compact
 * summary for injection into the agent system prompt.
 *
 * Groups entities by FLOOR → AREA (room) → domain.
 * Entities without an area are grouped under "Ohne Bereich".
 * Areas without a floor are grouped under "Kein Stockwerk".
 * Compresses same-domain/same-state entities (≥3) into one line to save tokens.
 * Includes important binary_sensor device classes (window, door, motion, smoke, moisture).
 */

import * as ha from './ha-client.js';
import { createLogger } from './logger.js';

const log = createLogger('entity-cache');

let cachedSummary = '';

/** Device classes of binary_sensor to include in cache (safety/spatial relevance). */
const IMPORTANT_SENSOR_CLASSES = new Set([
  'window', 'door', 'motion', 'smoke', 'moisture',
  'garage_door', 'lock', 'opening', 'presence', 'occupancy',
]);

/**
 * Fetch all entities, resolve area + floor mappings, and build a compact summary.
 * Called once at startup. Can be called again to refresh.
 */
export async function buildEntityCache(): Promise<string> {
  try {
    const [states, areaMap, floorMap] = await Promise.all([
      ha.getStates(),
      ha.getAreaEntityMap(),
      ha.getFloorAreaMap(),
    ]);

    log.info('Entity cache: fetched data', {
      entities: states.length,
      areas: Object.keys(areaMap).length,
      floors: Object.keys(floorMap).length,
    });

    // Build reverse map: entity_id → area_name
    const entityToArea = new Map<string, string>();
    for (const [areaName, entityIds] of Object.entries(areaMap)) {
      for (const eid of entityIds) {
        entityToArea.set(eid, areaName);
      }
    }

    // Build reverse map: area_name → floor_name
    const areaToFloor = new Map<string, string>();
    for (const [floorName, areaNames] of Object.entries(floorMap)) {
      for (const aName of areaNames) {
        areaToFloor.set(aName, floorName);
      }
    }

    // Build state lookup (include device_class for sensor filtering)
    interface EntityInfo { id: string; name: string; state: string; domain: string; deviceClass: string; }
    const stateMap = new Map<string, EntityInfo>();
    for (const s of states) {
      const dot = s.entity_id.indexOf('.');
      const domain = s.entity_id.slice(0, dot);
      const name = String(s.attributes['friendly_name'] ?? '');
      const deviceClass = String(s.attributes['device_class'] ?? '');
      stateMap.set(s.entity_id, { id: s.entity_id, name, state: s.state, domain, deviceClass });
    }

    // Group: area → domain → entities
    const grouped = new Map<string, Map<string, EntityInfo[]>>();

    for (const [eid, info] of stateMap) {
      const area = entityToArea.get(eid) || 'Ohne Bereich';
      if (!grouped.has(area)) grouped.set(area, new Map());
      const domainMap = grouped.get(area)!;
      if (!domainMap.has(info.domain)) domainMap.set(info.domain, []);
      domainMap.get(info.domain)!.push(info);
    }

    // Actionable domains shown with full detail
    const ACTIONABLE_DOMAINS = new Set([
      'light', 'switch', 'scene', 'media_player', 'cover', 'fan',
      'climate', 'vacuum', 'humidifier', 'water_heater', 'script',
      'input_boolean', 'input_number', 'input_select', 'input_text',
      'number', 'select', 'button', 'lock', 'alarm_control_panel',
      'automation',
    ]);

    // Group areas by floor
    const floorAreas = new Map<string, string[]>();
    const allAreas = [...grouped.keys()];
    for (const area of allAreas) {
      const floor = areaToFloor.get(area) || 'Kein Stockwerk';
      if (!floorAreas.has(floor)) floorAreas.set(floor, []);
      floorAreas.get(floor)!.push(area);
    }

    // Sort floors alphabetically, "Kein Stockwerk" last
    const floorNames = [...floorAreas.keys()].sort((a, b) => {
      if (a === 'Kein Stockwerk') return 1;
      if (b === 'Kein Stockwerk') return -1;
      return a.localeCompare(b, 'de');
    });

    // Build compact text
    const lines: string[] = [];

    for (const floor of floorNames) {
      const areas = floorAreas.get(floor)!.sort((a, b) => {
        if (a === 'Ohne Bereich') return 1;
        if (b === 'Ohne Bereich') return -1;
        return a.localeCompare(b, 'de');
      });

      // Check if any area in this floor has relevant entities (actionable OR important sensors)
      const hasRelevant = areas.some(area => {
        const domainMap = grouped.get(area)!;
        if ([...domainMap.keys()].some(d => ACTIONABLE_DOMAINS.has(d))) return true;
        // Check for important binary_sensors
        const binarySensors = domainMap.get('binary_sensor') ?? [];
        return binarySensors.some(e => IMPORTANT_SENSOR_CLASSES.has(e.deviceClass));
      });
      if (!hasRelevant) continue;

      lines.push(`# ${floor}`);

      for (const area of areas) {
        const domainMap = grouped.get(area)!;
        const relevantDomains = [...domainMap.keys()].filter(d => ACTIONABLE_DOMAINS.has(d)).sort();

        // Filter important binary_sensors for this area
        const importantSensors = (domainMap.get('binary_sensor') ?? [])
          .filter(e => IMPORTANT_SENSOR_CLASSES.has(e.deviceClass));

        if (relevantDomains.length === 0 && importantSensors.length === 0) continue;

        lines.push(`## ${area}`);

        // Actionable domains
        for (const domain of relevantDomains) {
          const entities = domainMap.get(domain)!;

          // Compress: if ≥3 entities of same domain share the same state, group them
          if (entities.length >= 3) {
            const byState = new Map<string, EntityInfo[]>();
            for (const e of entities) {
              if (!byState.has(e.state)) byState.set(e.state, []);
              byState.get(e.state)!.push(e);
            }

            for (const [state, group] of byState) {
              if (group.length >= 3) {
                const ids = group.map(e => `\`${e.id}\``).join(', ');
                lines.push(`- ${group.length}× ${domain} (alle ${state}): ${ids}`);
              } else {
                for (const e of group) {
                  const label = e.name || e.id;
                  lines.push(`- ${label} → \`${e.id}\` (${e.state})`);
                }
              }
            }
          } else {
            for (const e of entities) {
              const label = e.name || e.id;
              lines.push(`- ${label} → \`${e.id}\` (${e.state})`);
            }
          }
        }

        // Important sensors section (compact)
        if (importantSensors.length > 0) {
          const sensorParts = importantSensors.map(e => {
            const label = e.name || e.id;
            const stateDE = e.state === 'on' ? 'offen' : e.state === 'off' ? 'zu' : e.state;
            return `${label} (${stateDE})`;
          });
          lines.push(`- _Sensoren:_ ${sensorParts.join(', ')}`);
        }

        lines.push('');
      }
    }

    // Append remaining sensor summary (count only for non-important sensors)
    const sensorCount = states.filter(s => s.entity_id.startsWith('sensor.')).length;
    const binarySensorCount = states.filter(s => s.entity_id.startsWith('binary_sensor.')).length;
    lines.push(`_Weitere Sensoren: ${sensorCount} sensor, ${binarySensorCount} binary_sensor – nutze ha_search_entities oder ha_get_state um Sensorwerte abzufragen._`);

    cachedSummary = lines.join('\n');
    log.info('Entity cache built', {
      floors: floorNames.length,
      areas: allAreas.length,
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
