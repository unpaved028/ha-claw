/**
 * notify-matrix.ts – Which proactive event goes to which channel.
 *
 * Persisted at store/notify-matrix.json. Defaults keep Telegram on for the
 * events that already went there before the matrix existed. Per-check health
 * rows start off so they do not double a health_bundle Telegram message.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import { atomicWriteJson, withPathLock } from '../storage/atomic-write.js';

const log = createLogger('notify-matrix');

const MATRIX_PATH = join(appConfig.dataPath, 'store', 'notify-matrix.json');

export const NOTIFY_CHANNELS = ['telegram', 'chat', 'ha_notify', 'persistent'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const HEALTH_CHECK_KEYS = [
  'unavailable',
  'orphans',
  'stale_sensors',
  'low_battery',
  'broken_refs',
  'failed_automations',
  'pending_updates',
  'stuck_updates',
  'failed_integrations',
  'outage_cluster',
  'energy_meta',
  'radio_quiet',
  'stopped_addons',
  'recorder',
  'restored',
  'backup',
  'storage',
] as const;
export type HealthCheckKey = (typeof HEALTH_CHECK_KEYS)[number];

export const TOP_LEVEL_EVENTS = [
  'digest',
  'new_task',
  'task_done',
  'task_fail',
  'other_jobs',
  'health_bundle',
] as const;
export type TopLevelNotifyEvent = (typeof TOP_LEVEL_EVENTS)[number];

export type NotifyEventId = TopLevelNotifyEvent | `health.${HealthCheckKey}`;

export interface NotifyChannelFlags {
  telegram: boolean;
  chat: boolean;
  ha_notify: boolean;
  persistent: boolean;
}

export type NotifyMatrix = Record<NotifyEventId, NotifyChannelFlags>;

export const NOTIFY_EVENT_IDS: NotifyEventId[] = [
  ...TOP_LEVEL_EVENTS,
  ...HEALTH_CHECK_KEYS.map(k => `health.${k}` as const),
];

const TELEGRAM_DEFAULT_ON = new Set<NotifyEventId>(TOP_LEVEL_EVENTS);

const EVENT_ID_SET = new Set<string>(NOTIFY_EVENT_IDS);
const CHANNEL_SET = new Set<string>(NOTIFY_CHANNELS);

let cached: NotifyMatrix | null = null;

export function isNotifyEventId(raw: string): raw is NotifyEventId {
  return EVENT_ID_SET.has(raw);
}

export function isNotifyChannel(raw: string): raw is NotifyChannel {
  return CHANNEL_SET.has(raw);
}

export function healthEventId(key: HealthCheckKey): NotifyEventId {
  return `health.${key}`;
}

export function defaultChannelFlags(event: NotifyEventId): NotifyChannelFlags {
  return {
    telegram: TELEGRAM_DEFAULT_ON.has(event),
    chat: false,
    ha_notify: false,
    persistent: false,
  };
}

export function defaultNotifyMatrix(): NotifyMatrix {
  const matrix = {} as NotifyMatrix;
  for (const id of NOTIFY_EVENT_IDS) {
    matrix[id] = defaultChannelFlags(id);
  }
  return matrix;
}

function coerceFlags(event: NotifyEventId, raw: unknown): NotifyChannelFlags {
  const fallback = defaultChannelFlags(event);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const o = raw as Record<string, unknown>;
  return {
    telegram: typeof o.telegram === 'boolean' ? o.telegram : fallback.telegram,
    chat: typeof o.chat === 'boolean' ? o.chat : fallback.chat,
    ha_notify: typeof o.ha_notify === 'boolean' ? o.ha_notify : fallback.ha_notify,
    persistent: typeof o.persistent === 'boolean' ? o.persistent : fallback.persistent,
  };
}

export function mergeNotifyMatrix(raw: unknown): NotifyMatrix {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const next = defaultNotifyMatrix();
  for (const id of NOTIFY_EVENT_IDS) {
    if (id in src) next[id] = coerceFlags(id, src[id]);
  }
  return next;
}

/** Accept a raw PUT body (`{ matrix }` or the matrix itself). */
export function parseNotifyMatrixBody(raw: unknown): NotifyMatrix | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if ('matrix' in o) {
    if (!o.matrix || typeof o.matrix !== 'object' || Array.isArray(o.matrix)) return null;
    return mergeNotifyMatrix(o.matrix);
  }
  return mergeNotifyMatrix(o);
}

export function shouldNotify(
  matrix: NotifyMatrix,
  event: NotifyEventId,
  channel: NotifyChannel,
): boolean {
  return matrix[event]?.[channel] === true;
}

async function readFromDisk(): Promise<NotifyMatrix> {
  try {
    const raw = JSON.parse(await readFile(MATRIX_PATH, 'utf-8')) as unknown;
    return mergeNotifyMatrix(raw);
  } catch {
    return defaultNotifyMatrix();
  }
}

export async function getNotifyMatrix(): Promise<NotifyMatrix> {
  if (!cached) cached = await readFromDisk();
  return cached;
}

export async function saveNotifyMatrix(next: NotifyMatrix): Promise<NotifyMatrix> {
  const merged = mergeNotifyMatrix(next);
  cached = merged;
  await withPathLock(MATRIX_PATH, () => atomicWriteJson(MATRIX_PATH, merged));
  log.info('Notify matrix saved');
  return merged;
}

/** Tests. */
export function resetNotifyMatrixCache(): void {
  cached = null;
}
