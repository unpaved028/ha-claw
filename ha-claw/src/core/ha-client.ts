/**
 * ha-client.ts – Home Assistant API Client.
 *
 * Communicates with HA Core via the Supervisor API (inside add-on container)
 * or via a Long-Lived Token (local development).
 *
 * Inside Add-on:  http://supervisor/core/api  + SUPERVISOR_TOKEN
 * Standalone:     http://ha.local:8123/api    + Long-Lived Token
 */

import { appConfig } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('ha-api');

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface HAServiceResponse {
  success: boolean;
  data?: unknown;
}

// ── HA Template API response types ───────────────────────────
interface AreaTemplateEntry {
  id: string;
  name: string;
  entities: string[];
}
interface FloorTemplateEntry {
  name: string;
  areas: string[];
}

/**
 * Check if HA API is available (supervisor token + url present).
 */
export function isHAAvailable(): boolean {
  return !!(appConfig.supervisorToken && appConfig.haApiUrl);
}

/**
 * Call the HA REST API.
 */
async function haFetch<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!appConfig.supervisorToken) {
    throw new Error('No SUPERVISOR_TOKEN – HA API unavailable');
  }

  const url = `${appConfig.haApiUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${appConfig.supervisorToken}`,
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HA API ${res.status}: ${errText.slice(0, 300)}`);
    }

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Call the Supervisor API (not Core). Add-on only: http://supervisor/...
 * Responses are wrapped as `{ result, data }`.
 */
async function supervisorFetch<T>(path: string): Promise<T> {
  if (!appConfig.isAddon || !appConfig.supervisorToken) {
    throw new Error('Supervisor API only available inside the add-on');
  }

  const url = `http://supervisor${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${appConfig.supervisorToken}`,
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supervisor API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as { result?: string; data?: T; message?: string };
    if (json.result && json.result !== 'ok') {
      throw new Error(json.message || `Supervisor result: ${json.result}`);
    }
    return (json.data ?? json) as T;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export interface SupervisorBackup {
  slug: string;
  name: string;
  date: string;
  type: string;
  size?: string | number;
  location: string | null;
  locations?: Array<string | null>;
  content?: {
    homeassistant?: boolean;
    addons?: unknown[];
    apps?: unknown[];
    folders?: string[];
  };
}

export interface SupervisorBackupInfo {
  backups: SupervisorBackup[];
  days_until_stale?: number;
}

/** List backups + stale threshold. Add-on only (needs hassio_api). */
export async function getBackupInfo(): Promise<SupervisorBackupInfo> {
  log.debug('Fetching supervisor backups');
  return supervisorFetch<SupervisorBackupInfo>('/backups/info');
}

export interface CoreBackupAgentCopy {
  protected?: boolean;
  size?: number;
}

export interface CoreBackup {
  backup_id: string;
  name?: string | null;
  date: string;
  homeassistant_included?: boolean;
  agents?: Record<string, CoreBackupAgentCopy>;
  failed_agent_ids?: string[];
}

export interface CoreBackupInfo {
  backups: CoreBackup[];
  last_completed_automatic_backup?: string | null;
  last_attempted_automatic_backup?: string | null;
  state?: string;
  agent_errors?: Record<string, string>;
}

function haWebsocketUrl(): string {
  const rest = appConfig.haApiUrl.replace(/\/$/, '');
  if (/\/core\/api$/i.test(rest)) {
    return rest.replace(/^http/i, 'ws').replace(/\/core\/api$/i, '/core/websocket');
  }
  if (/\/api$/i.test(rest)) {
    return `${rest.replace(/^http/i, 'ws')}/websocket`;
  }
  return `${rest.replace(/^http/i, 'ws')}/api/websocket`;
}

interface HaWsMessage<T> {
  id?: number;
  type: string;
  success?: boolean;
  result?: T;
  error?: { code?: string; message?: string };
}

export type WsOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Several authenticated HA websocket commands on one connection.
 * Each command is independent — one failure does not abort the others.
 */
export function haWebsocketBatch(
  commands: Array<{ type: string } & Record<string, unknown>>,
  timeoutMs = 15_000,
): Promise<WsOutcome<unknown>[]> {
  if (!appConfig.supervisorToken) {
    return Promise.reject(new Error('No SUPERVISOR_TOKEN – HA API unavailable'));
  }
  if (commands.length === 0) return Promise.resolve([]);

  const url = haWebsocketUrl();
  const token = appConfig.supervisorToken;

  return new Promise(resolve => {
    const outcomes: Array<WsOutcome<unknown> | undefined> = Array.from({
      length: commands.length,
    });
    let settled = false;
    let authed = false;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => finish(new Error('HA websocket timeout (batch)')), timeoutMs);

    function doneCount(): number {
      return outcomes.filter(o => o !== undefined).length;
    }

    function finish(err: Error | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      resolve(
        outcomes.map(
          (o, i) =>
            o ?? {
              ok: false,
              error: err?.message || `No result for ${commands[i]?.type ?? i}`,
            },
        ),
      );
    }

    ws.addEventListener('error', () => finish(new Error('HA websocket error (batch)')));
    ws.addEventListener('close', () => {
      if (!settled) finish(new Error('HA websocket closed (batch)'));
    });
    ws.addEventListener('message', event => {
      let msg: HaWsMessage<unknown>;
      try {
        msg = JSON.parse(String(event.data)) as HaWsMessage<unknown>;
      } catch {
        finish(new Error('HA websocket: invalid JSON'));
        return;
      }
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        return;
      }
      if (msg.type === 'auth_invalid') {
        finish(new Error('HA websocket auth failed'));
        return;
      }
      if (msg.type === 'auth_ok') {
        authed = true;
        commands.forEach((cmd, i) => {
          ws.send(JSON.stringify({ id: i + 1, ...cmd }));
        });
        return;
      }
      if (!authed || msg.type !== 'result' || msg.id == null) return;
      const idx = msg.id - 1;
      if (idx < 0 || idx >= commands.length || outcomes[idx]) return;
      outcomes[idx] =
        msg.success === false
          ? { ok: false, error: msg.error?.message || `HA websocket ${commands[idx]!.type} failed` }
          : { ok: true, value: msg.result };
      if (doneCount() === commands.length) finish(null);
    });
  });
}

/**
 * One-shot authenticated HA websocket command. Used for Core backup/info
 * (REST has no equivalent). Supervisor token is an admin token in the add-on.
 */
function haWebsocketCommand<T>(
  commandType: string,
  extra: Record<string, unknown> = {},
  timeoutMs = 10_000,
): Promise<T> {
  return haWebsocketBatch([{ type: commandType, ...extra }], timeoutMs).then(results => {
    const r = results[0];
    if (!r || !r.ok) throw new Error(r?.error || `HA websocket ${commandType} failed`);
    return r.value as T;
  });
}

/**
 * Official Backup integration list (agents: local, HA Cloud, Google Drive,
 * OneDrive, Synology, WebDAV, Supervisor mounts). HAOS 2025.1+.
 */
export async function getCoreBackupInfo(): Promise<CoreBackupInfo> {
  log.debug('Fetching core backup info');
  const raw = await haWebsocketCommand<CoreBackupInfo>('backup/info');
  return {
    backups: Array.isArray(raw?.backups) ? raw.backups : [],
    last_completed_automatic_backup: raw?.last_completed_automatic_backup ?? null,
    last_attempted_automatic_backup: raw?.last_attempted_automatic_backup ?? null,
    state: raw?.state,
    agent_errors: raw?.agent_errors,
  };
}

export interface HostDiskInfo {
  freeGb: number;
  totalGb: number;
  usedGb: number;
  chassis: string | null;
  /** Estimated lifetime used, 0–100. Null when the disk does not report it. */
  diskLifeTime: number | null;
}

/**
 * Host data-disk usage from Supervisor `/host/info` (same partition HA OS
 * stores recorder, backups and add-on data on). Throws when unavailable;
 * callers fall back to fs.statfs on the add-on data path.
 */
export async function getHostDiskInfo(): Promise<HostDiskInfo> {
  const raw = await supervisorFetch<{
    disk_free?: number;
    disk_total?: number;
    disk_used?: number;
    chassis?: string | null;
    disk_life_time?: number | null;
  }>('/host/info');

  const freeGb = Number(raw.disk_free);
  const totalGb = Number(raw.disk_total);
  if (!Number.isFinite(freeGb) || !Number.isFinite(totalGb) || totalGb <= 0) {
    throw new Error('Supervisor /host/info returned no usable disk figures');
  }

  const usedGb = Number.isFinite(Number(raw.disk_used)) ? Number(raw.disk_used) : totalGb - freeGb;
  const life = Number(raw.disk_life_time);

  return {
    freeGb,
    totalGb,
    usedGb,
    chassis: raw.chassis ?? null,
    diskLifeTime: Number.isFinite(life) ? life : null,
  };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Get all entity states from Home Assistant.
 */
export async function getStates(): Promise<HAState[]> {
  log.debug('Fetching all states');
  return haFetch<HAState[]>('/states');
}

/**
 * Get the state of a single entity.
 */
export async function getState(entityId: string): Promise<HAState> {
  log.debug('Fetching state', { entityId });
  return haFetch<HAState>(`/states/${entityId}`);
}

/**
 * Call a Home Assistant service (e.g. turn on a light).
 */
export async function callService(
  domain: string,
  service: string,
  data: Record<string, unknown> = {},
): Promise<HAServiceResponse> {
  log.info('Calling HA service', { domain, service, data });
  const result = await haFetch<unknown>(`/services/${domain}/${service}`, 'POST', data);
  return { success: true, data: result };
}

/**
 * Render a Jinja2 template via HA's /api/template endpoint.
 * Returns the rendered string.
 */
export async function renderTemplate(template: string): Promise<string> {
  const url = `${appConfig.haApiUrl}/template`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${appConfig.supervisorToken}`,
    'Content-Type': 'application/json',
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ template }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Template API ${res.status}`);
    return res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Known entity-ID abbreviations for fallback parsing ───────
const FLOOR_ABBREVS: Record<string, string> = {
  eg: 'EG',
  og: 'OG',
  dg: 'DG',
  kg: 'KG',
  ug: 'UG',
};
const ROOM_ABBREVS: Record<string, string> = {
  wz: 'Wohnzimmer',
  sz: 'Schlafzimmer',
  ku: 'Kueche',
  bad: 'Bad',
  fl: 'Flur',
  kizi: 'Kinderzimmer',
  az: 'Arbeitszimmer',
  gz: 'Gaestezimmer',
  hwr: 'HWR',
  th: 'Treppenhaus',
};

// ── Tier 1: Jinja2 Template API ──────────────────────────────
// Uses the array-concat pattern (namespace + list append) which is
// compatible with HA 2026.x Jinja2. The old REST-based registry
// endpoints (/config/*_registry/list POST) are WebSocket-only and
// the old namespace.data.update({}) pattern returns 400 errors.

async function getAreaEntityMapFromTemplate(): Promise<Record<string, string[]>> {
  const tpl = [
    '{% set ns = namespace(out=[]) %}',
    '{% for a in areas() %}',
    '{% set ns.out = ns.out + [{"name": area_name(a), "entities": area_entities(a)}] %}',
    '{% endfor %}',
    '{{ ns.out | tojson }}',
  ].join('');
  const raw = await renderTemplate(tpl);
  const entries = JSON.parse(raw) as AreaTemplateEntry[];
  const result: Record<string, string[]> = {};
  for (const e of entries) {
    if (e.entities.length > 0) result[e.name] = e.entities;
  }
  return result;
}

async function getFloorAreaMapFromTemplate(): Promise<Record<string, string[]>> {
  const tpl = [
    '{% set ns = namespace(out=[]) %}',
    '{% for fid in floors() %}',
    '{% set fname = floor_name(fid) %}',
    '{% set fa = floor_areas(fid) | map("area_name") | list %}',
    '{% set ns.out = ns.out + [{"name": fname, "areas": fa}] %}',
    '{% endfor %}',
    '{{ ns.out | tojson }}',
  ].join('');
  const raw = await renderTemplate(tpl);
  const entries = JSON.parse(raw) as FloorTemplateEntry[];
  const result: Record<string, string[]> = {};
  for (const e of entries) {
    if (e.areas.length > 0) result[e.name] = e.areas;
  }
  return result;
}

// ── Tier 2: Entity-ID pattern parsing ────────────────────────

async function inferAreasFromEntityIds(): Promise<Record<string, string[]>> {
  const states = await getStates();
  const result: Record<string, string[]> = {};

  // Pattern: domain.prefix_floor_room or domain.prefix_floor_room_number
  const re = /^[a-z_]+\.[a-z]{2,4}_([a-z]{2,3})_([a-z]{2,5})(?:_\d+)?$/i;
  for (const s of states) {
    const m = s.entity_id.match(re);
    if (!m) continue;
    const floorCode = m[1]!.toLowerCase();
    const roomCode = m[2]!.toLowerCase();
    const floor = FLOOR_ABBREVS[floorCode];
    const room = ROOM_ABBREVS[roomCode];
    if (!floor || !room) continue;
    const areaName = `${floor} ${room}`;
    if (!result[areaName]) result[areaName] = [];
    result[areaName].push(s.entity_id);
  }
  return result;
}

async function inferFloorsFromEntityIds(): Promise<Record<string, string[]>> {
  const areaMap = await inferAreasFromEntityIds();
  const result: Record<string, string[]> = {};
  for (const areaName of Object.keys(areaMap)) {
    const floorCode = areaName.split(' ')[0]!;
    if (!result[floorCode]) result[floorCode] = [];
    if (!result[floorCode].includes(areaName)) result[floorCode].push(areaName);
  }
  return result;
}

// ── Public API with 2-tier fallback ──────────────────────────

/**
 * Get area → entity mapping. Returns a map of area_name → entity_id[].
 * Tries: 1) Jinja2 Template API  2) Entity-ID parsing fallback
 */
export async function getAreaEntityMap(): Promise<Record<string, string[]>> {
  // Tier 1: Jinja2 Template API (reliable in HA 2024.x+)
  try {
    const result = await getAreaEntityMapFromTemplate();
    if (Object.keys(result).length > 0) {
      log.info('Area mapping via template', { areas: Object.keys(result).length });
      return result;
    }
    log.debug('Template returned 0 areas, trying entity-ID parsing');
  } catch (err) {
    log.warn('Area mapping via template failed, trying entity-ID parsing', {
      error: String(err),
    });
  }

  // Tier 2: Entity-ID pattern parsing (best-effort fallback)
  try {
    const result = await inferAreasFromEntityIds();
    if (Object.keys(result).length > 0) {
      log.info('Area mapping via entity-ID parsing', { areas: Object.keys(result).length });
      return result;
    }
  } catch (err) {
    log.warn('Area mapping via entity-ID parsing failed', { error: String(err) });
  }

  log.warn('No area mapping available from any source');
  return {};
}

/**
 * Get floor → area mapping. Returns a map of floor_name → area_name[].
 * Tries: 1) Jinja2 Template API  2) Entity-ID parsing fallback
 */
export async function getFloorAreaMap(): Promise<Record<string, string[]>> {
  // Tier 1: Jinja2 Template API
  try {
    const result = await getFloorAreaMapFromTemplate();
    if (Object.keys(result).length > 0) {
      log.info('Floor mapping via template', { floors: Object.keys(result).length });
      return result;
    }
    log.debug('Template returned 0 floors, trying entity-ID parsing');
  } catch (err) {
    log.warn('Floor mapping via template failed, trying entity-ID parsing', {
      error: String(err),
    });
  }

  // Tier 2: Entity-ID pattern parsing
  try {
    const result = await inferFloorsFromEntityIds();
    if (Object.keys(result).length > 0) {
      log.info('Floor mapping via entity-ID parsing', { floors: Object.keys(result).length });
      return result;
    }
  } catch (err) {
    log.warn('Floor mapping via entity-ID parsing failed', { error: String(err) });
  }

  log.warn('No floor mapping available from any source');
  return {};
}

/**
 * Get members of a group entity. Returns entity_id[] of group members.
 */
export async function getGroupMembers(entityId: string): Promise<string[]> {
  try {
    const state = await getState(entityId);
    const members = state.attributes['entity_id'];
    if (Array.isArray(members)) return members as string[];
    return [];
  } catch (err) {
    log.warn('Group member resolution failed', { entityId, error: String(err) });
    return [];
  }
}

/**
 * Get internal ID from entity state. Useful for config APIs.
 */
async function getInternalId(entityId: string): Promise<string> {
  const state = await getState(entityId);
  const id = state.attributes['id'] as string | undefined;
  if (id) return id;
  // Fallback to suffix
  return entityId.split('.')[1]!;
}

/**
 * Get full automation configuration (triggers, conditions, actions).
 */
export async function getAutomationConfig(entityId: string): Promise<Record<string, unknown>> {
  try {
    const id = await getInternalId(entityId);
    return await haFetch<Record<string, unknown>>(`/config/automation/config/${id}`);
  } catch (err) {
    log.warn('Automation config fetch failed, falling back to state', {
      entityId,
      error: String(err),
    });
    try {
      const state = await getState(entityId);
      return {
        entity_id: entityId,
        state: state.state,
        friendly_name: state.attributes['friendly_name'] ?? null,
        last_triggered: state.attributes['last_triggered'] ?? null,
        note: 'Full config unavailable – showing basic state info only (Is this automation defined in YAML instead of UI?)',
      };
    } catch {
      return { error: 'Automation not found', entity_id: entityId };
    }
  }
}

/**
 * Save automation configuration.
 */
export async function saveAutomationConfig(
  id: string,
  config: Record<string, unknown>,
): Promise<HAServiceResponse> {
  log.info('Saving automation config', { id });
  await haFetch<unknown>(`/config/automation/config/${id}`, 'POST', config);
  return { success: true };
}

/**
 * Get full script configuration.
 */
export async function getScriptConfig(entityId: string): Promise<Record<string, unknown>> {
  try {
    const id = await getInternalId(entityId);
    return await haFetch<Record<string, unknown>>(`/config/script/config/${id}`);
  } catch (err) {
    log.warn('Script config fetch failed, falling back to state', {
      entityId,
      error: String(err),
    });
    try {
      const state = await getState(entityId);
      return {
        entity_id: entityId,
        state: state.state,
        friendly_name: state.attributes['friendly_name'] ?? null,
        note: 'Full config unavailable – showing basic state info only',
      };
    } catch {
      return { error: 'Script not found', entity_id: entityId };
    }
  }
}

/**
 * Save script configuration.
 */
export async function saveScriptConfig(
  id: string,
  config: Record<string, unknown>,
): Promise<HAServiceResponse> {
  log.info('Saving script config', { id });
  await haFetch<unknown>(`/config/script/config/${id}`, 'POST', config);
  return { success: true };
}

/**
 * Get HA configuration info.
 */
export async function getConfig(): Promise<Record<string, unknown>> {
  return haFetch<Record<string, unknown>>('/config');
}

/**
 * Get all entities that have labels assigned.
 * Returns { entity_id: string, labels: string[] }[]
 */
export async function getEntitiesWithLabels(): Promise<{ entity_id: string; labels: string[] }[]> {
  const tpl = [
    '{% set ns = namespace(out=[]) %}',
    '{% for s in states %}',
    '{% set l = labels(s.entity_id) %}',
    '{% if l %}',
    '{% set ns.out = ns.out + [{"entity_id": s.entity_id, "labels": l}] %}',
    '{% endif %}',
    '{% endfor %}',
    '{{ ns.out | tojson }}',
  ].join('');
  const raw = await renderTemplate(tpl);
  return JSON.parse(raw);
}

/**
 * Resolve Home Assistant device id + name for a list of entities.
 *
 * A physical device (one Zigbee sensor, one bulb) exposes many entities.
 * Health checks must group by device, otherwise one dead window sensor
 * looks like a dozen independent failures. Registry REST endpoints are
 * WebSocket-only, so this goes through the template API (`device_id` /
 * `device_attr`) in chunks.
 */
export interface EntityDeviceInfo {
  entityId: string;
  deviceId: string | null;
  deviceName: string | null;
}

const DEVICE_INFO_CHUNK = 80;
const SAFE_ENTITY_ID = /^[a-z0-9_.]+$/i;

export async function getEntityDeviceInfo(entityIds: string[]): Promise<EntityDeviceInfo[]> {
  const safe = [...new Set(entityIds.filter(id => SAFE_ENTITY_ID.test(id)))];
  if (safe.length === 0) return [];

  const results: EntityDeviceInfo[] = [];
  for (let i = 0; i < safe.length; i += DEVICE_INFO_CHUNK) {
    const chunk = safe.slice(i, i + DEVICE_INFO_CHUNK);
    try {
      results.push(...(await fetchDeviceInfoChunk(chunk)));
    } catch (err) {
      log.warn('Device info template failed for chunk – entities stay ungrouped', {
        size: chunk.length,
        error: String(err),
      });
      for (const entityId of chunk) {
        results.push({ entityId, deviceId: null, deviceName: null });
      }
    }
  }
  return results;
}

async function fetchDeviceInfoChunk(entityIds: string[]): Promise<EntityDeviceInfo[]> {
  const quoted = entityIds.map(id => `"${id}"`).join(', ');
  const tpl = [
    `{% set ids = [${quoted}] %}`,
    '{% set ns = namespace(out=[]) %}',
    '{% for eid in ids %}',
    '{% set did = device_id(eid) %}',
    '{% if did %}',
    '{% set dname = device_attr(eid, "name_by_user") or device_attr(eid, "name") %}',
    '{% set ns.out = ns.out + [{"entity": eid, "device": did, "name": dname}] %}',
    '{% else %}',
    '{% set ns.out = ns.out + [{"entity": eid, "device": none, "name": none}] %}',
    '{% endif %}',
    '{% endfor %}',
    '{{ ns.out | tojson }}',
  ].join('');

  const raw = await renderTemplate(tpl);
  const parsed = JSON.parse(raw) as {
    entity: string;
    device: string | null;
    name: string | null;
  }[];

  return parsed.map(row => ({
    entityId: row.entity,
    deviceId: row.device,
    deviceName: row.name,
  }));
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  disabled_by: string | null;
  name?: string | null;
  original_name?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
}

export interface ConfigEntryInfo {
  entry_id: string;
  domain: string;
  title: string;
  state: string;
}

export interface TraceSummary {
  item_id: string;
  timestamp?: string;
  error?: string | null;
  state?: string;
}

export interface HaRegistrySnapshot {
  entities: EntityRegistryEntry[];
  devices: DeviceRegistryEntry[];
  entries: ConfigEntryInfo[];
  automationTraces: TraceSummary[];
  scriptTraces: TraceSummary[];
}

/**
 * Entity/device registry, config entries and recent automation traces in one
 * websocket session. Missing commands come back as empty lists.
 */
export async function getRegistrySnapshot(): Promise<HaRegistrySnapshot> {
  const empty: HaRegistrySnapshot = {
    entities: [],
    devices: [],
    entries: [],
    automationTraces: [],
    scriptTraces: [],
  };
  try {
    const results = await haWebsocketBatch([
      { type: 'config/entity_registry/list' },
      { type: 'config/device_registry/list' },
      { type: 'config_entries/get' },
      { type: 'trace/list', domain: 'automation' },
      { type: 'trace/list', domain: 'script' },
    ]);
    const [entities, devices, entries, traces, scriptTraces] = results;
    if (entities && !entities.ok)
      log.debug('entity_registry/list failed', { error: entities.error });
    if (devices && !devices.ok) log.debug('device_registry/list failed', { error: devices.error });
    if (entries && !entries.ok) log.debug('config_entries/get failed', { error: entries.error });
    if (traces && !traces.ok) log.debug('trace/list failed', { error: traces.error });
    if (scriptTraces && !scriptTraces.ok)
      log.debug('script trace/list failed', { error: scriptTraces.error });
    return {
      entities: asArray<EntityRegistryEntry>(entities),
      devices: asArray<DeviceRegistryEntry>(devices),
      entries: asArray<ConfigEntryInfo>(entries),
      automationTraces: asArray<TraceSummary>(traces),
      scriptTraces: asArray<TraceSummary>(scriptTraces),
    };
  } catch (err) {
    log.warn('Registry snapshot unavailable', { error: String(err) });
    return empty;
  }
}

function asArray<T>(outcome: WsOutcome<unknown> | undefined): T[] {
  if (!outcome || !outcome.ok) return [];
  const v = outcome.value;
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    const inner =
      (v as { entries?: unknown; traces?: unknown }).entries ?? (v as { traces?: unknown }).traces;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

/**
 * UI automation/script config, or null when it lives in YAML or is missing.
 * Health checks must not log a warning per YAML automation.
 */
export interface SupervisorAddon {
  slug: string;
  name: string;
  state: string;
  boot?: string;
}

/** Installed add-ons and their run state. Add-on only. */
export async function getSupervisorAddons(): Promise<SupervisorAddon[]> {
  const raw = await supervisorFetch<{ addons?: SupervisorAddon[] }>('/addons');
  return Array.isArray(raw.addons) ? raw.addons : [];
}

export interface RecorderInfo {
  recording: boolean | null;
  threadRunning: boolean | null;
  backlog: number | null;
  migration: boolean;
}

/** Recorder thread / backlog. Missing command → all-null, caller skips the card. */
export async function getRecorderInfo(): Promise<RecorderInfo> {
  try {
    const raw = await haWebsocketCommand<Record<string, unknown>>('recorder/info');
    const backlog = Number(raw['backlog']);
    return {
      recording: typeof raw['recording'] === 'boolean' ? raw['recording'] : null,
      threadRunning: typeof raw['thread_running'] === 'boolean' ? raw['thread_running'] : null,
      backlog: Number.isFinite(backlog) ? backlog : null,
      migration: raw['migration_in_progress'] === true || raw['migration_in_queue'] === true,
    };
  } catch (err) {
    log.debug('recorder/info unavailable', { error: String(err) });
    return { recording: null, threadRunning: null, backlog: null, migration: false };
  }
}

export async function getUiConfig(
  kind: 'automation' | 'script',
  id: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await haFetch<Record<string, unknown>>(`/config/${kind}/config/${id}`);
  } catch {
    return null;
  }
}

export async function removeDevice(deviceId: string): Promise<void> {
  await haWebsocketCommand('config/device_registry/remove', { device_id: deviceId });
}

export async function removeEntity(entityId: string): Promise<void> {
  await haWebsocketCommand('config/entity_registry/remove', { entity_id: entityId });
}

export async function updateEntityName(entityId: string, name: string): Promise<void> {
  await haWebsocketCommand('config/entity_registry/update', { entity_id: entityId, name });
}

export type { HAState, HAServiceResponse };
