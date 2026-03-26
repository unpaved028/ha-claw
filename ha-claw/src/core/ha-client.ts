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
 * Get a list of all areas.
 */
export async function getAreas(): Promise<unknown[]> {
  // Uses the websocket-compatible template API
  return haFetch<unknown[]>('/template', 'POST', {
    template: '{{ areas() | list | tojson }}',
  }).catch(() => {
    log.warn('Areas API not available – using empty list');
    return [];
  });
}

/**
 * Get HA configuration info.
 */
export async function getConfig(): Promise<Record<string, unknown>> {
  return haFetch<Record<string, unknown>>('/config');
}

export type { HAState, HAServiceResponse };
