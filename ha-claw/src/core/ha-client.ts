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

/**
 * Check if HA API is available (supervisor token + url present).
 */
export function isHAAvailable(): boolean {
  return !!(appConfig.supervisorToken && appConfig.haApiUrl);
}

/**
 * Call the HA REST API.
 */
async function haFetch<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
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
  const result = await haFetch<unknown>(
    `/services/${domain}/${service}`,
    'POST',
    data,
  );
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
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ template }),
  });
  if (!res.ok) throw new Error(`Template API ${res.status}`);
  return res.text();
}

/**
 * Get area → entity mapping. Returns a map of area_name → entity_id[].
 */
export async function getAreaEntityMap(): Promise<Record<string, string[]>> {
  try {
    const tpl = `{% set result = namespace(data={}) %}{% for area_id in areas() %}{% set area_name = area_name(area_id) %}{% set entities = area_entities(area_id) %}{% set _ = result.data.update({area_name: entities}) %}{% endfor %}{{ result.data | tojson }}`;
    const raw = await renderTemplate(tpl);
    return JSON.parse(raw) as Record<string, string[]>;
  } catch (err) {
    log.warn('Area-entity mapping failed', { error: String(err) });
    return {};
  }
}

/**
 * Get floor → area mapping. Returns a map of floor_name → area_name[].
 * Requires HA 2023.12+ (floors() Jinja2 function). Returns {} on older versions.
 */
export async function getFloorAreaMap(): Promise<Record<string, string[]>> {
  try {
    const tpl = `{% set result = namespace(data={}) %}{% for floor_id in floors() %}{% set fname = floor_name(floor_id) %}{% set area_ids = floor_areas(floor_id) %}{% set area_names = area_ids | map('area_name') | list %}{% set _ = result.data.update({fname: area_names}) %}{% endfor %}{{ result.data | tojson }}`;
    const raw = await renderTemplate(tpl);
    return JSON.parse(raw) as Record<string, string[]>;
  } catch (err) {
    log.warn('Floor-area mapping failed (HA < 2023.12?)', { error: String(err) });
    return {};
  }
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
 * Get full automation configuration (triggers, conditions, actions).
 */
export async function getAutomationConfig(entityId: string): Promise<Record<string, unknown>> {
  try {
    const objectId = entityId.replace(/^automation\./, '');
    return await haFetch<Record<string, unknown>>(`/config/automation/config/${objectId}`);
  } catch (err) {
    log.warn('Automation config fetch failed, falling back to state', { entityId, error: String(err) });
    try {
      const state = await getState(entityId);
      return {
        entity_id: entityId,
        state: state.state,
        friendly_name: state.attributes['friendly_name'] ?? null,
        last_triggered: state.attributes['last_triggered'] ?? null,
        note: 'Full config unavailable – showing basic state info only',
      };
    } catch {
      return { error: 'Automation not found', entity_id: entityId };
    }
  }
}

/**
 * Get HA configuration info.
 */
export async function getConfig(): Promise<Record<string, unknown>> {
  return haFetch<Record<string, unknown>>('/config');
}

export type { HAState, HAServiceResponse };
