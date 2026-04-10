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

/** Device classes of binary_sensor to include in cache (safety/spatial relevance). */
const IMPORTANT_SENSOR_CLASSES = new Set([
  'window',
  'door',
  'motion',
  'smoke',
  'moisture',
  'garage_door',
  'lock',
  'opening',
  'presence',
  'occupancy',
]);

interface EntityInfo {
  id: string;
  name: string;
  state: string;
  domain: string;
  deviceClass: string;
}

/** Structured storage for dynamic pruning */
let lastGroupedData: Map<string, Map<string, EntityInfo[]>> | null = null;
let lastFloorAreas: Map<string, string[]> | null = null;
let lastAreaToFloor: Map<string, string> | null = null;
let cachedFullSummary = '';

/** Actionable domains shown with full detail */
const ACTIONABLE_DOMAINS = new Set([
  'light',
  'switch',
  'scene',
  'media_player',
  'cover',
  'fan',
  'climate',
  'vacuum',
  'humidifier',
  'water_heater',
  'script',
  'input_boolean',
  'input_number',
  'input_select',
  'input_text',
  'number',
  'select',
  'button',
  'lock',
  'alarm_control_panel',
  'automation',
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
    lastAreaToFloor = areaToFloor;

    // Build state lookup
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
    lastGroupedData = grouped;

    // Group areas by floor
    const floorAreas = new Map<string, string[]>();
    const allAreas = [...grouped.keys()];
    for (const area of allAreas) {
      const floor = areaToFloor.get(area) || 'Kein Stockwerk';
      if (!floorAreas.has(floor)) floorAreas.set(floor, []);
      floorAreas.get(floor)!.push(area);
    }
    lastFloorAreas = floorAreas;

    // Build full summary once
    cachedFullSummary = renderCache();

    log.info('Entity cache built', {
      areas: allAreas.length,
      chars: cachedFullSummary.length,
    });

    return cachedFullSummary;
  } catch (err) {
    log.warn('Entity cache build failed', { error: String(err) });
    cachedFullSummary = '(Entity-Cache nicht verfügbar – nutze ha_search_entities zum Suchen.)';
    return cachedFullSummary;
  }
}

/**
 * Get a dynamic pruned version of the entity cache based on the user's query.
 * If specific areas are mentioned, only those are shown in detail.
 */
export function getDynamicPrunedCache(query: string): string {
  if (!lastGroupedData || !lastFloorAreas || !lastAreaToFloor) return cachedFullSummary;

  const queryLower = query.toLowerCase();
  const allAreas = [...lastGroupedData.keys()];

  // Find mentioned areas
  const mentionedAreas = allAreas.filter(area => {
    if (area === 'Ohne Bereich') return false;
    // Check for exact word match to avoid false positives (e.g. "Bad" in "Badezimmer")
    const regex = new RegExp(`\\b${area.toLowerCase()}\\b`, 'i');
    return regex.test(queryLower);
  });

  // If no areas mentioned, or it's a broad query, return full summary (or a smart subset)
  if (mentionedAreas.length === 0) {
    // If the cache is very large (> 10k chars), maybe prune it even without mentions?
    // For now, return full.
    return cachedFullSummary;
  }

  // Always include "Global" or "Safety" areas if they exist (custom logic could go here)
  return renderCache(mentionedAreas);
}

/**
 * Helper to render the structured data into the final string with optional pruning.
 */
function renderCache(focusAreas?: string[]): string {
  if (!lastFloorAreas || !lastGroupedData || !lastAreaToFloor) return '';

  const floorNames = [...lastFloorAreas.keys()].sort((a, b) => {
    if (a === 'Kein Stockwerk') return 1;
    if (b === 'Kein Stockwerk') return -1;
    return a.localeCompare(b, 'de');
  });

  const lines: string[] = [];

  for (const floor of floorNames) {
    const areasInFloor = lastFloorAreas.get(floor)!.sort((a, b) => {
      if (a === 'Ohne Bereich') return 1;
      if (b === 'Ohne Bereich') return -1;
      return a.localeCompare(b, 'de');
    });

    // Pruning logic: only keep floor header if at least one area is in focus OR no focus specified
    const floorHasFocus = focusAreas ? areasInFloor.some(a => focusAreas.includes(a)) : true;
    if (!floorHasFocus && focusAreas) {
      // Show just floor name and area names as summary
      lines.push(`# ${floor}: ${areasInFloor.join(', ')}`);
      continue;
    }

    lines.push(`# ${floor}`);

    for (const area of areasInFloor) {
      const domainMap = lastGroupedData.get(area)!;
      const isFocused = focusAreas ? focusAreas.includes(area) : true;

      if (!isFocused) {
        // Summary only for unfocused area
        const actionableCount = [...domainMap.keys()].filter(d => ACTIONABLE_DOMAINS.has(d)).length;
        if (actionableCount > 0) {
          lines.push(
            `## ${area} (${actionableCount} Gerätetypen verfügbar – für Details explizit nach "${area}" fragen)`,
          );
        }
        continue;
      }

      // FULL DETAIL for focused area
      const relevantDomains = [...domainMap.keys()].filter(d => ACTIONABLE_DOMAINS.has(d)).sort();
      const importantSensors = (domainMap.get('binary_sensor') ?? []).filter(e =>
        IMPORTANT_SENSOR_CLASSES.has(e.deviceClass),
      );

      if (relevantDomains.length === 0 && importantSensors.length === 0) continue;

      lines.push(`## ${area}`);

      for (const domain of relevantDomains) {
        const entities = domainMap.get(domain)!;
        if (entities.length >= 3) {
          const byState = new Map<string, EntityInfo[]>();
          for (const e of entities) {
            if (!byState.has(e.state)) byState.set(e.state, []);
            byState.get(e.state)!.push(e);
          }
          for (const [state, group] of byState) {
            if (group.length >= 3) {
              lines.push(
                `- ${group.length}× ${domain} (alle ${state}): ${group.map(e => `\`${e.id}\``).join(', ')}`,
              );
            } else {
              for (const e of group) lines.push(`- ${e.name || e.id} → \`${e.id}\` (${e.state})`);
            }
          }
        } else {
          for (const e of entities) lines.push(`- ${e.name || e.id} → \`${e.id}\` (${e.state})`);
        }
      }

      if (importantSensors.length > 0) {
        const TYPE_ICONS: Record<string, string> = {
          window: '🪟',
          door: '🚪',
          motion: '🏃',
          smoke: '🔥',
          moisture: '💧',
          garage_door: '🏠',
          lock: '🔒',
          presence: '👤',
        };
        for (const e of importantSensors) {
          const stateDE = e.state === 'on' ? 'offen' : e.state === 'off' ? 'zu' : e.state;
          lines.push(
            `- ${TYPE_ICONS[e.deviceClass] || '📡'} ${e.name || e.id} → \`${e.id}\` (${stateDE})`,
          );
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Get the cached entity summary.
 */
export function getEntityCache(): string {
  return cachedFullSummary;
}
