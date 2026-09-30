/**
 * ha-time.ts – The installation's time zone, from Home Assistant.
 *
 * Falls back to UTC when Core is unreachable. A hardcoded zone would be
 * wrong for every installation that is not in that zone.
 */

import { getConfig, isHAAvailable } from './ha-client.js';

let cached: { zone: string; at: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function homeTimeZone(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.zone;
  if (!isHAAvailable()) return 'UTC';
  try {
    const config = await getConfig();
    const zone = typeof config['time_zone'] === 'string' && config['time_zone'] ? config['time_zone'] : 'UTC';
    cached = { zone, at: Date.now() };
    return zone;
  } catch {
    return cached?.zone ?? 'UTC';
  }
}

export function formatInHomeZone(date: Date, zone: string, locale: string): string {
  try {
    return date.toLocaleString(locale, { timeZone: zone });
  } catch {
    return date.toISOString();
  }
}

/** Last zone learned from Home Assistant, or UTC before the first successful read. */
export function knownHomeTimeZone(): string {
  return cached?.zone ?? 'UTC';
}

/** Test hook. */
export function resetHomeTimeZoneCache(): void {
  cached = null;
}
