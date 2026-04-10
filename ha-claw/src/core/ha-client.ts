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

export type { HAState, HAServiceResponse };
