/**
 * health-history.ts – Last 24 hourly readings per health check.
 *
 * Separate from store/system-health.json so last-seen / notify fields keep
 * their shape. Same-hour refreshes replace the latest sample instead of
 * burning a slot. Used for "used to be healthy" notes (outage clusters).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteJson, withPathLock } from '../storage/atomic-write.js';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import type { Severity } from './system-health.js';

const log = createLogger('health-history');

export const HISTORY_PATH = join(appConfig.dataPath, 'store', 'system-health-history.json');
export const HISTORY_MAX_SAMPLES = 24;
export const HISTORY_MAX_IDS = 40;

export interface HealthHistorySample {
  checkedAt: string;
  severity: Severity;
  count: number;
  ids: string[];
}

export interface HealthHistoryFile {
  samples: Record<string, HealthHistorySample[]>;
}

export function sampleHour(iso: string): string {
  return iso.slice(0, 13);
}

export function appendHistorySample(
  samples: HealthHistorySample[],
  next: HealthHistorySample,
  max = HISTORY_MAX_SAMPLES,
): HealthHistorySample[] {
  const sample: HealthHistorySample = {
    checkedAt: next.checkedAt,
    severity: next.severity,
    count: next.count,
    ids: next.ids.slice(0, HISTORY_MAX_IDS),
  };
  const last = samples[samples.length - 1];
  if (last && sampleHour(last.checkedAt) === sampleHour(sample.checkedAt)) {
    return [...samples.slice(0, -1), sample].slice(-max);
  }
  return [...samples, sample].slice(-max);
}

export function lastDifferentHourSample(
  samples: HealthHistorySample[],
  nowIso: string,
): HealthHistorySample | null {
  const hour = sampleHour(nowIso);
  for (let i = samples.length - 1; i >= 0; i--) {
    const row = samples[i];
    if (row && sampleHour(row.checkedAt) !== hour) return row;
  }
  return null;
}

function isSeverity(v: unknown): v is Severity {
  return v === 'ok' || v === 'warn' || v === 'critical';
}

function asSample(raw: unknown): HealthHistorySample | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['checkedAt'] !== 'string' || !isSeverity(o['severity'])) return null;
  if (typeof o['count'] !== 'number' || !Number.isFinite(o['count'])) return null;
  const ids = Array.isArray(o['ids'])
    ? o['ids'].filter((id): id is string => typeof id === 'string').slice(0, HISTORY_MAX_IDS)
    : [];
  return { checkedAt: o['checkedAt'], severity: o['severity'], count: o['count'], ids };
}

export function parseHealthHistory(raw: unknown): HealthHistoryFile {
  const samples: Record<string, HealthHistorySample[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { samples };
  const src = (raw as { samples?: unknown }).samples;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return { samples };
  for (const [key, rows] of Object.entries(src as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    samples[key] = rows.map(asSample).filter((s): s is HealthHistorySample => s != null);
  }
  return { samples };
}

export async function loadHealthHistory(): Promise<HealthHistoryFile> {
  try {
    const raw: unknown = JSON.parse(await readFile(HISTORY_PATH, 'utf-8'));
    return parseHealthHistory(raw);
  } catch {
    return { samples: {} };
  }
}

export interface HistoryCheck {
  key: string;
  severity: Severity;
  count: number;
  items: Array<{ id: string }>;
}

export async function recordHealthHistory(
  checkedAt: string,
  checks: HistoryCheck[],
): Promise<HealthHistoryFile> {
  const current = await loadHealthHistory();
  const next: HealthHistoryFile = { samples: { ...current.samples } };
  for (const check of checks) {
    const sample: HealthHistorySample = {
      checkedAt,
      severity: check.severity,
      count: check.count,
      ids: check.items.map(i => i.id),
    };
    next.samples[check.key] = appendHistorySample(next.samples[check.key] ?? [], sample);
  }
  try {
    await withPathLock(HISTORY_PATH, () => atomicWriteJson(HISTORY_PATH, next));
  } catch (err) {
    log.warn('Could not persist health history', { error: String(err) });
  }
  return next;
}
