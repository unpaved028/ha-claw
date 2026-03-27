/**
 * entity-cache.ts – Fetches all HA entities at startup and builds a compact
 * summary for injection into the agent system prompt.
 *
 * The cache is a simple string grouped by area/domain, designed to give the
 * LLM enough context to pick the right entity_id without searching first.
 */

import * as ha from './ha-client.js';
import { createLogger } from './logger.js';

const log = createLogger('entity-cache');

let cachedSummary = '';

/**
 * Fetch all entities and build a compact summary string.
 * Called once at startup. Failures are non-fatal (returns empty string).
 */
export async function buildEntityCache(): Promise<string> {
  try {
    const states = await ha.getStates();
    log.info('Entity cache: fetched states', { count: states.length });

    // Group by domain
    const byDomain = new Map<string, { id: string; name: string; state: string }[]>();

    for (const s of states) {
      const dot = s.entity_id.indexOf('.');
      const domain = s.entity_id.slice(0, dot);
      const name = String(s.attributes['friendly_name'] ?? '');

      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain)!.push({
        id: s.entity_id,
        name,
        state: s.state,
      });
    }

    // Build compact text – one line per entity, grouped by domain
    const lines: string[] = [];
    const sortedDomains = [...byDomain.keys()].sort();

    for (const domain of sortedDomains) {
      const entities = byDomain.get(domain)!;
      lines.push(`### ${domain} (${entities.length})`);
      for (const e of entities) {
        const label = e.name ? `${e.name} → ` : '';
        lines.push(`- ${label}\`${e.id}\` (${e.state})`);
      }
      lines.push('');
    }

    cachedSummary = lines.join('\n');
    log.info('Entity cache built', {
      domains: sortedDomains.length,
      entities: states.length,
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
