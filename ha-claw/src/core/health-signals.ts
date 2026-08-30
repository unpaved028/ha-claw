/**
 * health-signals.ts – Extra standing-condition inputs for system health.
 *
 * Broken references, failed traces and failed config entries need the
 * websocket registry snapshot plus a pass over UI automation/script configs.
 * Kept out of system-health.ts so that file stays about thresholds and cards.
 */

import { createLogger } from './logger.js';
import * as ha from './ha-client.js';
import type { HealthItem } from './system-health.js';
import { HA_PATH, hrefForEntity } from './health-links.js';

const log = createLogger('health-signals');

const CONFIG_CONCURRENCY = 6;

const ENTITY_ID_RE = /\b([a-z][a-z0-9_]+)\.([a-z0-9_]+)\b/g;

const FAILED_ENTRY_STATES = new Set([
  'setup_error',
  'setup_retry',
  'migration_error',
  'failed_unload',
]);

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

function friendly(s: HAState): string {
  const name = s.attributes['friendly_name'];
  return typeof name === 'string' && name.trim() ? name.trim() : s.entity_id;
}

function internalId(s: HAState): string {
  const id = s.attributes['id'];
  return typeof id === 'string' && id ? id : (s.entity_id.split('.')[1] ?? s.entity_id);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

function collectRefs(
  value: unknown,
  entities: Set<string>,
  devices: Set<string>,
  key?: string,
): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if ((key === 'device_id' || key === 'device_ids' || key === 'device') && value.length >= 16) {
      devices.add(value);
    }
    if (key === 'entity_id' || key === 'entity_ids' || key === 'entity') {
      if (value.includes('.')) entities.add(value);
    }
    if (value.includes('{{') || value.includes('states(') || key === undefined) {
      for (const m of value.matchAll(ENTITY_ID_RE)) entities.add(m[0]);
    }
    return;
  }
  if (Array.isArray(value)) {
    const childKey =
      key === 'entity_id' || key === 'entity_ids'
        ? 'entity_id'
        : key === 'device_id' || key === 'device_ids'
          ? 'device_id'
          : key;
    for (const v of value) collectRefs(v, entities, devices, childKey);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectRefs(v, entities, devices, k);
    }
  }
}

function knownDomains(states: HAState[]): Set<string> {
  const domains = new Set<string>([
    'automation',
    'binary_sensor',
    'button',
    'calendar',
    'camera',
    'climate',
    'cover',
    'device_tracker',
    'fan',
    'group',
    'input_boolean',
    'input_button',
    'input_datetime',
    'input_number',
    'input_select',
    'input_text',
    'light',
    'lock',
    'media_player',
    'number',
    'person',
    'remote',
    'scene',
    'script',
    'select',
    'sensor',
    'siren',
    'sun',
    'switch',
    'timer',
    'update',
    'vacuum',
    'water_heater',
    'weather',
    'zone',
    'alarm_control_panel',
    'notify',
    'tts',
    'conversation',
    'event',
    'image',
    'lawn_mower',
    'valve',
    'humidifier',
    'text',
    'date',
    'time',
    'datetime',
    'stt',
    'todo',
    'wake_word',
  ]);
  for (const s of states) {
    const dot = s.entity_id.indexOf('.');
    if (dot > 0) domains.add(s.entity_id.slice(0, dot));
  }
  return domains;
}

export interface BrokenRefResult {
  items: HealthItem[];
  uiScanned: number;
  yamlOnly: number;
}

/**
 * Automations, scripts and scenes that still name an entity or device that
 * Home Assistant no longer has. YAML-only automations are scanned for
 * `entity_id` attributes only — the full config API does not serve them.
 */
export async function findBrokenReferences(
  states: HAState[],
  snapshot: ha.HaRegistrySnapshot,
): Promise<BrokenRefResult> {
  const liveIds = new Set(states.map(s => s.entity_id));
  const registryIds = new Set(snapshot.entities.map(e => e.entity_id));
  const knownIds = new Set<string>([...liveIds, ...registryIds]);
  const knownDevices = new Set(snapshot.devices.map(d => d.id));
  const domains = knownDomains(states);

  const owners: Array<{
    entityId: string;
    label: string;
    config: Record<string, unknown>;
    href: string;
  }> = [];

  for (const s of states.filter(row => row.entity_id.startsWith('scene.'))) {
    const members = s.attributes['entity_id'];
    owners.push({
      entityId: s.entity_id,
      label: friendly(s),
      config: { entity_id: members },
      href: HA_PATH.scene,
    });
  }

  const configurable = states.filter(
    s => s.entity_id.startsWith('automation.') || s.entity_id.startsWith('script.'),
  );
  const fetched = await mapPool(configurable, CONFIG_CONCURRENCY, async s => {
    const kind = s.entity_id.startsWith('script.') ? 'script' : 'automation';
    const config = await ha.getUiConfig(kind, internalId(s));
    return { s, config };
  });

  let yamlOnly = 0;
  for (const { s, config } of fetched) {
    const href = hrefForEntity(s.entity_id, null, internalId(s));
    if (config && !config['error'] && !config['note']) {
      owners.push({ entityId: s.entity_id, label: friendly(s), config, href });
    } else {
      yamlOnly += 1;
      const members = s.attributes['entity_id'];
      if (members) {
        owners.push({
          entityId: s.entity_id,
          label: friendly(s),
          config: { entity_id: members },
          href,
        });
      }
    }
  }
  if (yamlOnly > 0) {
    log.debug('Broken-ref scan: YAML automations/scripts without UI config', { yamlOnly });
  }

  const items: HealthItem[] = [];
  for (const owner of owners) {
    const entityRefs = new Set<string>();
    const deviceRefs = new Set<string>();
    collectRefs(owner.config, entityRefs, deviceRefs);
    const missingEntities = [...entityRefs].filter(id => {
      const domain = id.split('.')[0] ?? '';
      if (!domains.has(domain)) return false;
      if (id === owner.entityId) return false;
      return !knownIds.has(id);
    });
    const missingDevices =
      knownDevices.size > 0 ? [...deviceRefs].filter(id => !knownDevices.has(id)) : [];
    const missing = [...missingEntities, ...missingDevices.map(id => `device:${id.slice(0, 8)}`)];
    if (missing.length === 0) continue;
    items.push({
      id: owner.entityId,
      label: owner.label,
      entities: missing.sort(),
      href: owner.href,
    });
  }

  return {
    items: items.sort((a, b) => a.label.localeCompare(b.label, 'de')),
    uiScanned: fetched.length - yamlOnly,
    yamlOnly,
  };
}

function ingestTraces(
  latest: Map<string, { ts: string; error: string }>,
  traces: ha.TraceSummary[],
): void {
  for (const trace of traces) {
    if (!trace.item_id || !trace.error) continue;
    const ts = trace.timestamp ?? '';
    const prev = latest.get(trace.item_id);
    if (!prev || ts > prev.ts) {
      latest.set(trace.item_id, { ts, error: String(trace.error).slice(0, 200) });
    }
  }
}

/**
 * Automations and scripts whose latest trace recorded an error, plus those
 * whose own state is `unavailable` (config will not load).
 */
export function findFailedAutomations(
  states: HAState[],
  snapshot: ha.HaRegistrySnapshot,
): HealthItem[] {
  const latest = new Map<string, { ts: string; error: string }>();
  ingestTraces(latest, snapshot.automationTraces);
  ingestTraces(latest, snapshot.scriptTraces);

  const items: HealthItem[] = [];
  for (const s of states.filter(
    row => row.entity_id.startsWith('automation.') || row.entity_id.startsWith('script.'),
  )) {
    const id = internalId(s);
    const err = latest.get(id)?.error ?? latest.get(s.entity_id)?.error;
    const href = hrefForEntity(s.entity_id, null, id);
    if (err) {
      items.push({ id: s.entity_id, label: friendly(s), entities: [err], href });
    } else if (s.state === 'unavailable' || s.state === 'unknown') {
      items.push({ id: s.entity_id, label: friendly(s), entities: [s.entity_id], href });
    }
  }

  return items.sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

export function findFailedIntegrations(snapshot: ha.HaRegistrySnapshot): HealthItem[] {
  return snapshot.entries
    .filter(e => FAILED_ENTRY_STATES.has(e.state))
    .map(e => ({
      id: e.entry_id,
      label: e.title || e.domain,
      entities: [`${e.domain} (${e.state})`],
      href: HA_PATH.integration(e.domain),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

export function findDisabledEntities(snapshot: ha.HaRegistrySnapshot): HealthItem[] {
  return snapshot.entities
    .filter(e => e.disabled_by)
    .map(e => ({
      id: e.entity_id,
      label: (e.name || e.original_name || e.entity_id).trim(),
      entities: [e.entity_id, e.disabled_by ? `disabled_by=${e.disabled_by}` : 'disabled'],
      href: HA_PATH.entities,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

export function findStoppedAddons(addons: ha.SupervisorAddon[]): HealthItem[] {
  return addons
    .filter(a => {
      const state = (a.state || '').toLowerCase();
      if (state === 'error') return true;
      if (state === 'started' || state === 'startup') return false;
      return (a.boot || 'auto') === 'auto';
    })
    .map(a => ({
      id: a.slug,
      label: a.name || a.slug,
      entities: [a.state || 'stopped'],
      href: HA_PATH.addon(a.slug),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
