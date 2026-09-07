/**
 * health-signals.ts – Extra standing-condition inputs for system health.
 *
 * Broken references, failed traces and failed config entries need the
 * websocket registry snapshot plus a pass over UI automation/script configs.
 * The config walk lives in automation-index.ts so coverage can share it.
 * Kept out of system-health.ts so that file stays about thresholds and cards.
 */

import { createLogger } from './logger.js';
import * as ha from './ha-client.js';
import {
  friendlyName,
  getAutomationIndex,
  internalId,
  type HaLikeState,
} from './automation-index.js';
import type { HealthItem } from './system-health.js';
import { HA_PATH, hrefForEntity } from './health-links.js';

const log = createLogger('health-signals');

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

export function knownDomains(states: HaLikeState[]): Set<string> {
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

export interface RefOwner {
  entityId: string;
  label: string;
  entityRefs: Iterable<string>;
  deviceRefs: Iterable<string>;
  href?: string;
}

/** Missing entity/device refs on a set of owners. Pure; used by tests. */
export function findMissingRefs(
  owners: RefOwner[],
  knownIds: Set<string>,
  knownDevices: Set<string>,
  domains: Set<string>,
): HealthItem[] {
  const items: HealthItem[] = [];
  for (const owner of owners) {
    const missingEntities = [...owner.entityRefs].filter(id => {
      const domain = id.split('.')[0] ?? '';
      if (!domains.has(domain)) return false;
      if (id === owner.entityId) return false;
      return !knownIds.has(id);
    });
    const missingDevices =
      knownDevices.size > 0 ? [...owner.deviceRefs].filter(id => !knownDevices.has(id)) : [];
    const missing = [...missingEntities, ...missingDevices.map(id => `device:${id.slice(0, 8)}`)];
    if (missing.length === 0) continue;
    items.push({
      id: owner.entityId,
      label: owner.label,
      entities: missing.sort(),
      href: owner.href,
    });
  }
  return items.sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/**
 * Automations, scripts and scenes that still name an entity or device that
 * Home Assistant no longer has. YAML-only automations are scanned for
 * `entity_id` attributes only — the config API does not serve them.
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

  const index = await getAutomationIndex(states);
  const owners: RefOwner[] = [];

  for (const s of states.filter(row => row.entity_id.startsWith('scene.'))) {
    const members = s.attributes['entity_id'];
    const entityRefs = new Set<string>();
    if (Array.isArray(members)) {
      for (const m of members) if (typeof m === 'string') entityRefs.add(m);
    } else if (typeof members === 'string' && members.includes('.')) {
      entityRefs.add(members);
    }
    owners.push({
      entityId: s.entity_id,
      label: friendlyName(s),
      entityRefs,
      deviceRefs: [],
      href: HA_PATH.scene,
    });
  }

  for (const rec of index.records) {
    owners.push({
      entityId: rec.entityId,
      label: rec.label,
      entityRefs: rec.entityRefs,
      deviceRefs: rec.deviceRefs,
      href: hrefForEntity(rec.entityId, null, rec.internalId),
    });
  }
  if (index.yamlOnly > 0) {
    log.debug('Broken-ref scan: YAML automations/scripts without UI config', {
      yamlOnly: index.yamlOnly,
    });
  }

  return {
    items: findMissingRefs(owners, knownIds, knownDevices, domains),
    uiScanned: index.uiScanned,
    yamlOnly: index.yamlOnly,
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
      items.push({ id: s.entity_id, label: friendlyName(s), entities: [err], href });
    } else if (s.state === 'unavailable' || s.state === 'unknown') {
      items.push({ id: s.entity_id, label: friendlyName(s), entities: [s.entity_id], href });
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
