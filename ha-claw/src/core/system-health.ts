/**
 * system-health.ts – Live health checks for the Home Assistant installation.
 *
 * WHY THIS IS NOT PART OF THE BACKLOG:
 * Device availability, dead sensors and low batteries are recurring *conditions*,
 * not improvement proposals. A backlog task has a lifecycle that ends in "done";
 * a condition that stays true until hardware is fixed never reaches it. Worse,
 * the old implementation put the live count into the task title
 * ("59 Geräte nicht erreichbar"), so every fluctuation produced a brand new
 * task – and because the device check is high priority, also an hourly Telegram
 * push. Health is therefore computed on demand here and only reported when it
 * actually deteriorates.
 *
 * The snapshot on disk exists solely to answer "has this gotten worse?".
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import * as ha from './ha-client.js';

const log = createLogger('health');

const SNAPSHOT_PATH = join(appConfig.dataPath, 'store', 'system-health.json');

/** How many affected entities to name in a report before truncating. */
const MAX_EXAMPLES = 8;

// ── Types ─────────────────────────────────────────────────

export type Severity = 'ok' | 'warn' | 'critical';

export interface HealthCheck {
  /** Stable identifier – safe to persist and compare across runs. */
  key: 'unavailable' | 'stale_sensors' | 'low_battery';
  /** Short German label for the UI. */
  label: string;
  severity: Severity;
  /** Number of affected entities. */
  count: number;
  /** One-line explanation including a few examples. */
  detail: string;
  /** Every affected entity id, so the UI can list them. */
  entities: string[];
  /** What the user can do about it. */
  hint: string;
}

export interface SystemHealth {
  checkedAt: string;
  /** Worst severity across all checks. */
  severity: Severity;
  /** Total number of entities in Home Assistant, for context. */
  totalEntities: number;
  checks: HealthCheck[];
}

interface SnapshotEntry {
  severity: Severity;
  /** Count at the time the user was last notified about this check. */
  notifiedCount: number;
  notifiedAt: string;
}

type Snapshot = Record<string, SnapshotEntry>;

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
}

// ── Thresholds ────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = { ok: 0, warn: 1, critical: 2 };

/** Hours without a state change after which a sensor counts as stale. */
const STALE_HOURS = 48;

/** Battery percentage below which a device counts as low. */
const LOW_BATTERY_PCT = 20;

function severityFor(count: number, warnAt: number, criticalAt: number): Severity {
  if (count >= criticalAt) return 'critical';
  if (count >= warnAt) return 'warn';
  return 'ok';
}

function examples(entities: string[]): string {
  const shown = entities.slice(0, MAX_EXAMPLES).join(', ');
  const rest = entities.length - MAX_EXAMPLES;
  return rest > 0 ? `${shown} (+${rest} weitere)` : shown;
}

// ── Checks ────────────────────────────────────────────────

function checkUnavailable(states: HAState[]): HealthCheck {
  const affected = states.filter(s => s.state === 'unavailable').map(s => s.entity_id);
  return {
    key: 'unavailable',
    label: 'Geräte nicht erreichbar',
    severity: severityFor(affected.length, 3, 15),
    count: affected.length,
    detail: affected.length > 0 ? examples(affected) : 'Alle Geräte antworten.',
    entities: affected,
    hint: 'Strom, WLAN/Zigbee-Verbindung und Integration-Status prüfen. Geräte, die es nicht mehr gibt, aus Home Assistant entfernen – sonst bleiben sie dauerhaft in dieser Liste.',
  };
}

function checkStaleSensors(states: HAState[], now: Date): HealthCheck {
  const affected = states
    .filter(s => {
      if (!s.entity_id.startsWith('sensor.') && !s.entity_id.startsWith('binary_sensor.')) {
        return false;
      }
      if (s.state === 'unavailable' || s.state === 'unknown') return false;
      const hoursAgo = (now.getTime() - new Date(s.last_changed).getTime()) / 3_600_000;
      return hoursAgo > STALE_HOURS;
    })
    .map(s => s.entity_id);

  return {
    key: 'stale_sensors',
    label: `Sensoren seit ${STALE_HOURS}h unverändert`,
    severity: severityFor(affected.length, 5, 25),
    count: affected.length,
    detail: affected.length > 0 ? examples(affected) : 'Alle Sensoren melden aktuelle Werte.',
    entities: affected,
    hint: 'Batterie leer oder Verbindung verloren? Dauerhaft tote Sensoren aus Home Assistant entfernen. Achtung: manche Sensoren ändern sich legitim selten.',
  };
}

function checkLowBattery(states: HAState[]): HealthCheck {
  const affected = states
    .filter(s => {
      const level = Number(s.attributes['battery_level'] ?? s.attributes['battery'] ?? -1);
      return level >= 0 && level < LOW_BATTERY_PCT;
    })
    .map(s => s.entity_id);

  return {
    key: 'low_battery',
    label: `Batterie unter ${LOW_BATTERY_PCT}%`,
    severity: severityFor(affected.length, 1, 8),
    count: affected.length,
    detail: affected.length > 0 ? examples(affected) : 'Keine schwachen Batterien.',
    entities: affected,
    hint: 'Batterien zeitnah wechseln.',
  };
}

// ── Public API ────────────────────────────────────────────

/** Run all health checks against the current Home Assistant state. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const states = (await ha.getStates()) as HAState[];
  const now = new Date();

  const checks = [
    checkUnavailable(states),
    checkStaleSensors(states, now),
    checkLowBattery(states),
  ];

  const severity = checks.reduce<Severity>(
    (worst, c) => (SEVERITY_ORDER[c.severity] > SEVERITY_ORDER[worst] ? c.severity : worst),
    'ok',
  );

  return {
    checkedAt: now.toISOString(),
    severity,
    totalEntities: states.length,
    checks,
  };
}

async function readSnapshot(): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf-8')) as Snapshot;
  } catch {
    return {};
  }
}

async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  const tmp = `${SNAPSHOT_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf-8');
  await rename(tmp, SNAPSHOT_PATH);
}

/**
 * Decide which checks deteriorated enough to be worth a push notification.
 *
 * Reported when a check moves to a worse severity, or when the count has at
 * least doubled since the last notification. The second rule catches a real
 * incident (a whole Zigbee network dropping) in an installation that already
 * sits at "critical" permanently, without notifying on every small fluctuation.
 * Recovery is recorded silently – nobody needs a push saying things improved.
 */
export async function findHealthRegressions(health: SystemHealth): Promise<HealthCheck[]> {
  const snapshot = await readSnapshot();
  const regressions: HealthCheck[] = [];
  const next: Snapshot = { ...snapshot };

  for (const check of health.checks) {
    const previous = snapshot[check.key];

    if (check.severity === 'ok') {
      // Nothing wrong – reset so the next occurrence is reported again.
      delete next[check.key];
      continue;
    }

    const worsenedSeverity =
      !previous || SEVERITY_ORDER[check.severity] > SEVERITY_ORDER[previous.severity];
    const doubled = previous ? check.count >= previous.notifiedCount * 2 : false;

    if (worsenedSeverity || doubled) {
      regressions.push(check);
      next[check.key] = {
        severity: check.severity,
        notifiedCount: check.count,
        notifiedAt: health.checkedAt,
      };
    } else if (previous) {
      // Track the current severity but keep the count we last notified about,
      // so "doubled" stays anchored to the last message the user actually saw.
      next[check.key] = { ...previous, severity: check.severity };
    }
  }

  await writeSnapshot(next);

  if (regressions.length > 0) {
    log.info('Health regressions detected', { keys: regressions.map(r => r.key) });
  }
  return regressions;
}

/** Compact one-line-per-check summary for the Telegram /status command. */
export function formatHealthSummary(health: SystemHealth): string {
  const icon: Record<Severity, string> = { ok: '✅', warn: '⚠️', critical: '🔴' };
  return health.checks
    .map(c => `${icon[c.severity]} ${c.label}: ${c.count}`)
    .join('\n')
    .concat(`\n_(von ${health.totalEntities} Entities)_`);
}
