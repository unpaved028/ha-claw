/**
 * automation-index.ts – One walk of UI automation/script configs.
 *
 * Health (broken refs), coverage and later the quality linter all need the
 * same question answered: what does this automation actually reference?
 * Name-matching produced false gaps (flur_nachtlicht has no "motion" in the
 * id) and false coverage (any automation named "cover" marked every room).
 *
 * YAML-only configs are not served by the UI config API. Those records keep
 * only the entity_id attributes Home Assistant exposes on the state object.
 */

import * as ha from './ha-client.js';
import { createLogger } from './logger.js';

const log = createLogger('automation-index');

const CONFIG_CONCURRENCY = 6;
const CACHE_TTL_MS = 60 * 60 * 1000;

const ENTITY_ID_RE = /\b([a-z][a-z0-9_]+)\.([a-z0-9_]+)\b/g;
const SERVICE_RE = /^[a-z][a-z0-9_]+\.[a-z][a-z0-9_]+$/;
const SERVICE_KEYS = new Set(['service', 'action', 'service_template']);

export interface HaLikeState {
  entity_id: string;
  state?: string;
  attributes?: Record<string, unknown>;
}

export type ConfigKind = 'automation' | 'script';

export type ConfigFetcher = (
  kind: ConfigKind,
  id: string,
) => Promise<Record<string, unknown> | null>;

export interface ConfigWalk {
  entityRefs: string[];
  deviceRefs: string[];
  triggerPlatforms: string[];
  mode: string | null;
  services: string[];
}

export interface IndexedConfig extends ConfigWalk {
  entityId: string;
  label: string;
  kind: ConfigKind;
  internalId: string;
  yamlOnly: boolean;
  config: Record<string, unknown>;
}

export interface AutomationIndex {
  builtAt: string;
  records: IndexedConfig[];
  automations: IndexedConfig[];
  scripts: IndexedConfig[];
  uiScanned: number;
  yamlOnly: number;
  byEntity: Map<string, IndexedConfig[]>;
}

export interface IndexOptions {
  fetchConfig?: ConfigFetcher;
  force?: boolean;
}

let cached: AutomationIndex | null = null;
let cachedAt = 0;
let inFlight: Promise<AutomationIndex> | null = null;

export function resetAutomationIndexCache(): void {
  cached = null;
  cachedAt = 0;
}

export function friendlyName(s: HaLikeState): string {
  const name = s.attributes?.['friendly_name'];
  return typeof name === 'string' && name.trim() ? name.trim() : s.entity_id;
}

export function internalId(s: HaLikeState): string {
  const id = s.attributes?.['id'];
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

/**
 * Collect entity_id / device_id references. Same rules as the former
 * health-signals walker — templates and bare strings are scanned for ids.
 */
export function collectRefs(
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

export function collectServices(value: unknown, out: Set<string>, key?: string): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (key && SERVICE_KEYS.has(key) && SERVICE_RE.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectServices(v, out, key);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectServices(v, out, k);
    }
  }
}

export function collectTriggerPlatforms(config: Record<string, unknown>): string[] {
  const raw = config['triggers'] ?? config['trigger'];
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const platforms = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const platform = row['trigger'] ?? row['platform'];
    if (typeof platform === 'string' && platform.trim()) {
      platforms.add(platform.trim().toLowerCase());
    }
  }
  return [...platforms].sort();
}

export function walkConfig(config: Record<string, unknown>): ConfigWalk {
  const entities = new Set<string>();
  const devices = new Set<string>();
  collectRefs(config, entities, devices);
  const services = new Set<string>();
  collectServices(config, services);
  const mode = typeof config['mode'] === 'string' ? config['mode'] : null;
  return {
    entityRefs: [...entities].sort(),
    deviceRefs: [...devices].sort(),
    triggerPlatforms: collectTriggerPlatforms(config),
    mode,
    services: [...services].sort(),
  };
}

export function hasSunSignal(rec: Pick<IndexedConfig, 'entityRefs' | 'triggerPlatforms'>): boolean {
  if (rec.triggerPlatforms.includes('sun')) return true;
  return rec.entityRefs.some(id => id === 'sun.sun' || id.startsWith('sun.'));
}

export function callsNotifyService(services: readonly string[]): boolean {
  return services.some(
    s =>
      s.startsWith('notify.') ||
      s === 'persistent_notification.create' ||
      s.startsWith('telegram_bot.'),
  );
}

const CLIMATE_SET = new Set([
  'climate.turn_off',
  'climate.set_hvac_mode',
  'climate.set_temperature',
]);

export function callsClimateSet(services: readonly string[]): boolean {
  return services.some(s => CLIMATE_SET.has(s));
}

function finalizeIndex(
  records: IndexedConfig[],
  uiScanned: number,
  yamlOnly: number,
): AutomationIndex {
  const byEntity = new Map<string, IndexedConfig[]>();
  for (const rec of records) {
    for (const id of rec.entityRefs) {
      const list = byEntity.get(id);
      if (list) list.push(rec);
      else byEntity.set(id, [rec]);
    }
  }
  return {
    builtAt: new Date().toISOString(),
    records,
    automations: records.filter(r => r.kind === 'automation'),
    scripts: records.filter(r => r.kind === 'script'),
    uiScanned,
    yamlOnly,
    byEntity,
  };
}

function recordFrom(
  s: HaLikeState,
  kind: ConfigKind,
  config: Record<string, unknown>,
  yamlOnly: boolean,
): IndexedConfig {
  const walked = walkConfig(config);
  return {
    entityId: s.entity_id,
    label: friendlyName(s),
    kind,
    internalId: internalId(s),
    yamlOnly,
    config,
    ...walked,
  };
}

/** Build an index from already-walked configs. Used by tests. */
export function indexFromConfigs(
  items: Array<{
    entityId: string;
    config: Record<string, unknown>;
    yamlOnly?: boolean;
    kind?: ConfigKind;
    label?: string;
  }>,
  counts?: { uiScanned?: number; yamlOnly?: number },
): AutomationIndex {
  const records = items.map(item => {
    const s: HaLikeState = {
      entity_id: item.entityId,
      attributes: { friendly_name: item.label, id: item.entityId.split('.')[1] },
    };
    return recordFrom(s, item.kind ?? 'automation', item.config, item.yamlOnly ?? false);
  });
  const yamlOnly = counts?.yamlOnly ?? records.filter(r => r.yamlOnly).length;
  const uiScanned = counts?.uiScanned ?? records.filter(r => !r.yamlOnly).length;
  return finalizeIndex(records, uiScanned, yamlOnly);
}

export async function loadAutomationIndex(
  states: HaLikeState[],
  fetchConfig: ConfigFetcher = (kind, id) => ha.getUiConfig(kind, id),
): Promise<AutomationIndex> {
  const configurable = states.filter(
    s => s.entity_id.startsWith('automation.') || s.entity_id.startsWith('script.'),
  );
  const fetched = await mapPool(configurable, CONFIG_CONCURRENCY, async s => {
    const kind: ConfigKind = s.entity_id.startsWith('script.') ? 'script' : 'automation';
    const config = await fetchConfig(kind, internalId(s));
    return { s, kind, config };
  });

  let yamlOnly = 0;
  const records: IndexedConfig[] = [];
  for (const { s, kind, config } of fetched) {
    const ui = Boolean(config && !config['error'] && !config['note']);
    if (!ui) {
      yamlOnly += 1;
      const members = s.attributes?.['entity_id'];
      if (members) {
        records.push(recordFrom(s, kind, { entity_id: members }, true));
      }
    } else {
      records.push(recordFrom(s, kind, config as Record<string, unknown>, false));
    }
  }
  if (yamlOnly > 0) {
    log.debug('Automation index: YAML automations/scripts without UI config', { yamlOnly });
  }
  return finalizeIndex(records, fetched.length - yamlOnly, yamlOnly);
}

/**
 * Shared, hour-long cache. Health resets it at the start of each full check
 * so Status stays fresh; Care reuses the same walk instead of fetching again.
 */
export async function getAutomationIndex(
  states: HaLikeState[],
  opts: IndexOptions = {},
): Promise<AutomationIndex> {
  if (!opts.force && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  if (inFlight && !opts.force) return inFlight;
  const fetchConfig = opts.fetchConfig ?? ((kind, id) => ha.getUiConfig(kind, id));
  const pending = loadAutomationIndex(states, fetchConfig).then(index => {
    cached = index;
    cachedAt = Date.now();
    return index;
  });
  if (!opts.force) inFlight = pending;
  try {
    return await pending;
  } finally {
    if (inFlight === pending) inFlight = null;
  }
}
