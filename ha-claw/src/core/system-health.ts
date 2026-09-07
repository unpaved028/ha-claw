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
 * push. Health is therefore computed in the background (shortly after start
 * and hourly) or when the user clicks Refresh, and only reported when it
 * actually deteriorates. Opening Status serves the last report so the
 * screen does not wait on Home Assistant.
 *
 * The snapshot on disk answers "has this gotten worse?". The last full
 * report is stored separately so a restart still has something to show.
 */

import { readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteJson, withPathLock } from '../storage/atomic-write.js';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import * as ha from './ha-client.js';
import { checkBackup, isBackupStatusEntity } from './backup-health.js';
import { resetAutomationIndexCache } from './automation-index.js';
import {
  findBrokenReferences,
  findFailedAutomations,
  findFailedIntegrations,
  findStoppedAddons,
} from './health-signals.js';
import {
  ENERGY_META_CRITICAL,
  ENERGY_META_WARN,
  STUCK_UPDATE_DAYS,
  entityDeviceStem,
  findEnergyMetaEntityIds,
  findOutageClusters,
  findStuckUpdates,
  formatRepairNote,
  isHaStackUpdate,
  outageClusterSeverity,
  parseRepairIssues,
} from './health-extra.js';
import {
  lastDifferentHourSample,
  loadHealthHistory,
  recordHealthHistory,
} from './health-history.js';
import { HA_PATH, haFrontendBase, hrefForEntity } from './health-links.js';
import type { HealthCheckKey } from './notify-matrix.js';
import { dateLocale } from './strings.js';
import { fill, formatLocaleNumber, healthCopy } from './health-copy.js';

export { entityDeviceStem };

const log = createLogger('health');

const SNAPSHOT_PATH = join(appConfig.dataPath, 'store', 'system-health.json');
const REPORT_PATH = join(appConfig.dataPath, 'store', 'system-health-report.json');

/** How many affected entities to name in a report before truncating. */
const MAX_EXAMPLES = 8;

// ── Types ─────────────────────────────────────────────────

export type Severity = 'ok' | 'warn' | 'critical';

export interface HealthItem {
  /** Device id, or a synthetic key when the entity has no device. */
  id: string;
  /** Device name for the UI; falls back to a readable stem of the entity id. */
  label: string;
  /** All unavailable/stale/low-battery entities that belong to this device. */
  entities: string[];
  /** HA frontend path (opened with target=_top from Ingress). */
  href?: string;
}

export interface HealthCheck {
  /** Stable identifier – safe to persist and compare across runs. */
  key:
    | 'unavailable'
    | 'orphans'
    | 'stale_sensors'
    | 'low_battery'
    | 'broken_refs'
    | 'failed_automations'
    | 'pending_updates'
    | 'stuck_updates'
    | 'failed_integrations'
    | 'outage_cluster'
    | 'energy_meta'
    | 'radio_quiet'
    | 'stopped_addons'
    | 'recorder'
    | 'restored'
    | 'backup'
    | 'storage';
  /** Short UI label. */
  label: string;
  /** What this card measures — always shown, expandable. */
  about?: string;
  /** HA frontend path for the whole card (Backups, Updates, …). */
  href?: string;
  /** Last different reading, when the value actually moved. */
  previous?: { severity: Severity; count: number; checkedAt: string };
  /** True when severity rose or the count moved the wrong way. */
  worse?: boolean;
  /** Footnote, e.g. YAML automations the ref scan could not open. */
  note?: string;
  severity: Severity;
  /**
   * Device checks: affected devices. Backup: days since last HA backup.
   * Storage: free space in GB (rounded) – lower is worse, so regressions
   * ignore the "doubled count" rule for this key.
   */
  count: number;
  /** One-line explanation including a few device names. */
  detail: string;
  /** Compact status for Telegram /status (falls back to count). */
  short?: string;
  /** Device labels (same order as items) – kept so older UI still has a flat list. */
  entities: string[];
  items: HealthItem[];
  /** What the user can do about it. */
  hint: string;
}

export interface SystemHealth {
  checkedAt: string;
  /** Worst severity across all checks. */
  severity: Severity;
  /** Total number of entities in Home Assistant, for context. */
  totalEntities: number;
  /** Empty in the add-on; HA origin in standalone so links resolve. */
  haBase: string;
  checks: HealthCheck[];
}

interface SnapshotEntry {
  severity: Severity;
  count: number;
  checkedAt: string;
  priorSeverity?: Severity;
  priorCount?: number;
  priorCheckedAt?: string;
  notifiedSeverity?: Severity;
  notifiedCount?: number;
  notifiedAt?: string;
}

type Snapshot = Record<string, SnapshotEntry>;

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

// ── Thresholds ────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = { ok: 0, warn: 1, critical: 2 };

/**
 * Hours without a report (`last_updated`) after which a *periodic* sensor
 * counts as stale. `last_changed` is the wrong clock: a closed window or a
 * dry rain sensor can keep the same state for weeks and still be healthy.
 */
const STALE_HOURS = 48;

/**
 * device_class values that are expected to keep talking even when the reading
 * stays the same. Binary sensors (door, motion, leak, rain) and event-driven
 * classes (battery, energy pulse, precipitation) are deliberately absent.
 * Source of truth for the system-health stale check.
 */
const PERIODIC_SENSOR_CLASSES = new Set([
  'temperature',
  'humidity',
  'atmospheric_pressure',
  'carbon_dioxide',
  'carbon_monoxide',
  'volatile_organic_compounds',
  'volatile_organic_compounds_parts',
  'pm1',
  'pm10',
  'pm25',
  'nitrogen_dioxide',
  'nitrogen_monoxide',
  'nitrous_oxide',
  'ozone',
  'sulphur_dioxide',
  'aqi',
]);

function isPeriodicSensor(s: HAState): boolean {
  if (!s.entity_id.startsWith('sensor.')) return false;
  const deviceClass = String(s.attributes['device_class'] ?? '').toLowerCase();
  return PERIODIC_SENSOR_CLASSES.has(deviceClass);
}

/** Battery percentage below which a device counts as low. */
const LOW_BATTERY_PCT = 20;

/** Unavailable this long is "gone", not "offline today". */
const ORPHAN_DAYS = 30;

/** Zigbee last_seen older than this, or LQI at or below LQI_WEAK, counts as quiet radio. */
const RADIO_QUIET_HOURS = 48;
const LQI_WEAK = 20;

/**
 * Disks under 128 GiB are treated as SD/eMMC (Pi, HA Green, HA Yellow).
 * Larger volumes get percentage thresholds (SSD / NVMe).
 */
const FLASH_TOTAL_GB = 128;
const FLASH_WARN_GB = 5;
const FLASH_CRITICAL_GB = 3;
const SSD_WARN_RATIO = 0.1;
const SSD_CRITICAL_RATIO = 0.05;
/** Estimated lifetime used (0–100) from Supervisor, when the disk reports it. */
const DISK_LIFE_WARN = 90;
const DISK_LIFE_CRITICAL = 95;
const GIB = 1024 ** 3;

function severityFor(count: number, warnAt: number, criticalAt: number): Severity {
  if (count >= criticalAt) return 'critical';
  if (count >= warnAt) return 'warn';
  return 'ok';
}

function examples(labels: string[]): string {
  const shown = labels.slice(0, MAX_EXAMPLES).join(', ');
  const rest = labels.length - MAX_EXAMPLES;
  return rest > 0 ? `${shown} (+${rest} weitere)` : shown;
}

function groupByDevice(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthItem[] {
  const byEntity = new Map(info.map(row => [row.entityId, row]));
  const groups = new Map<string, HealthItem>();

  for (const entityId of entityIds) {
    const meta = byEntity.get(entityId);
    const stem = entityDeviceStem(entityId);
    const id = meta?.deviceId ? `dev:${meta.deviceId}` : `stem:${stem}`;
    const existing = groups.get(id);
    if (existing) {
      existing.entities.push(entityId);
      continue;
    }
    groups.set(id, {
      id,
      label: meta?.deviceName?.trim() || stem.replace(/_/g, ' '),
      entities: [entityId],
      href: hrefForEntity(entityId, meta?.deviceId),
    });
  }

  return mergeByStem([...groups.values()]).sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/**
 * Re-paired Zigbee devices often leave old entities under a second device_id.
 * If the entity-id stem is the same, it is still one physical device.
 */
function mergeByStem(groups: HealthItem[]): HealthItem[] {
  const byStem = new Map<string, HealthItem>();
  for (const group of groups) {
    const stem = entityDeviceStem(group.entities[0]!);
    const existing = byStem.get(stem);
    if (!existing) {
      byStem.set(stem, {
        id: `stem:${stem}`,
        label: group.label,
        entities: [...group.entities],
        href: group.href,
      });
      continue;
    }
    const named = /[A-ZÄÖÜ ]/.test(group.label);
    const alreadyNamed = /[A-ZÄÖÜ ]/.test(existing.label);
    if (named && !alreadyNamed) existing.label = group.label;
    existing.entities.push(...group.entities);
    if (group.href?.includes('/devices/device/') && !existing.href?.includes('/devices/device/')) {
      existing.href = group.href;
    }
  }
  return [...byStem.values()];
}

function buildCheck(
  key: HealthCheck['key'],
  label: string,
  items: HealthItem[],
  okDetail: string,
  hint: string,
  warnAt: number,
  criticalAt: number,
): HealthCheck {
  const labels = items.map(item => item.label);
  return {
    key,
    label,
    severity: severityFor(items.length, warnAt, criticalAt),
    count: items.length,
    detail: items.length > 0 ? examples(labels) : okDetail,
    entities: labels,
    items,
    hint,
  };
}

// ── Checks ────────────────────────────────────────────────

function checkUnavailable(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().unavailable;
  return buildCheck('unavailable', c.label, groupByDevice(entityIds, info), c.ok, c.hint, 3, 15);
}

function checkStaleSensors(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().stale_sensors;
  return buildCheck(
    'stale_sensors',
    fill(c.label, { hours: STALE_HOURS }),
    groupByDevice(entityIds, info),
    c.ok,
    c.hint,
    5,
    25,
  );
}

function checkLowBattery(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().low_battery;
  return buildCheck(
    'low_battery',
    fill(c.label, { pct: LOW_BATTERY_PCT }),
    groupByDevice(entityIds, info),
    c.ok,
    c.hint,
    1,
    8,
  );
}

function checkOrphans(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().orphans;
  return buildCheck(
    'orphans',
    fill(c.label, { days: ORPHAN_DAYS }),
    groupByDevice(entityIds, info),
    c.ok,
    c.hint,
    1,
    8,
  );
}

function checkBrokenRefs(items: HealthItem[]): HealthCheck {
  const c = healthCopy().broken_refs;
  return buildCheck('broken_refs', c.label, items, c.ok, c.hint, 1, 8);
}

function checkFailedAutomations(items: HealthItem[]): HealthCheck {
  const c = healthCopy().failed_automations;
  return buildCheck('failed_automations', c.label, items, c.ok, c.hint, 1, 5);
}

function checkStoppedAddons(items: HealthItem[]): HealthCheck {
  const c = healthCopy().stopped_addons;
  return buildCheck('stopped_addons', c.label, items, c.ok, c.hint, 1, 3);
}

function checkRestored(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().restored;
  return buildCheck('restored', c.label, groupByDevice(entityIds, info), c.ok, c.hint, 1, 15);
}

function checkPendingUpdates(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().pending_updates;
  return buildCheck('pending_updates', c.label, groupByDevice(entityIds, info), c.ok, c.hint, 1, 8);
}

function checkFailedIntegrations(items: HealthItem[]): HealthCheck {
  const c = healthCopy().failed_integrations;
  return buildCheck('failed_integrations', c.label, items, c.ok, c.hint, 1, 3);
}

function checkRadioQuiet(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().radio_quiet;
  return buildCheck('radio_quiet', c.label, groupByDevice(entityIds, info), c.ok, c.hint, 3, 10);
}

function checkEnergyMeta(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().energy_meta;
  return buildCheck(
    'energy_meta',
    c.label,
    groupByDevice(entityIds, info),
    c.ok,
    c.hint,
    ENERGY_META_WARN,
    ENERGY_META_CRITICAL,
  );
}

function checkStuckUpdates(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  const c = healthCopy().stuck_updates;
  return buildCheck(
    'stuck_updates',
    fill(c.label, { days: STUCK_UPDATE_DAYS }),
    groupByDevice(entityIds, info),
    c.ok,
    c.hint,
    1,
    8,
  );
}

function checkOutageClusters(result: ReturnType<typeof findOutageClusters>): HealthCheck {
  const c = healthCopy().outage_cluster;
  const labels = result.items.map(item => item.label);
  const check: HealthCheck = {
    key: 'outage_cluster',
    label: c.label,
    severity: outageClusterSeverity(result.items.length, result.maxClusterSize),
    count: result.items.length,
    detail: result.items.length > 0 ? examples(labels) : c.ok,
    entities: labels,
    items: result.items,
    hint: c.hint,
  };
  if (result.recoveredDeviceCount > 0) {
    check.note = healthCopy().outageRecovered(result.recoveredDeviceCount);
  }
  return check;
}

function hoursSince(iso: string, now: Date): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

function parseLastSeenAgeHours(s: HAState, now: Date): number | null {
  const raw = s.state;
  if (raw === 'unavailable' || raw === 'unknown' || raw === '') return null;
  const num = Number(raw);
  if (Number.isFinite(num) && num > 1e12) return (now.getTime() - num) / 3_600_000;
  if (Number.isFinite(num) && num > 1e9) return (now.getTime() - num * 1000) / 3_600_000;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return (now.getTime() - parsed.getTime()) / 3_600_000;
  return hoursSince(s.last_updated || s.last_changed, now);
}

function isLinkQualityEntity(s: HAState): boolean {
  const id = s.entity_id.toLowerCase();
  return id.endsWith('_linkquality') || id.endsWith('_lqi') || id.endsWith('_link_quality');
}

function isLastSeenEntity(s: HAState): boolean {
  const id = s.entity_id.toLowerCase();
  return id.endsWith('_last_seen') || id.endsWith('_lastseen');
}

function isPendingUpdate(s: HAState): boolean {
  return s.entity_id.startsWith('update.') && s.state === 'on';
}

type StorageKind = 'flash' | 'ssd';

function classifyStorage(totalGb: number): StorageKind {
  return totalGb > 0 && totalGb < FLASH_TOTAL_GB ? 'flash' : 'ssd';
}

function formatGb(n: number): string {
  const digits = n < 10 ? 1 : 0;
  return `${formatLocaleNumber(n, digits)} GB`;
}

function worseSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

async function readDiskInfo(): Promise<ha.HostDiskInfo | null> {
  if (appConfig.isAddon) {
    try {
      return await ha.getHostDiskInfo();
    } catch (err) {
      log.debug('Supervisor host disk info unavailable, falling back to statfs', {
        error: String(err),
      });
    }
  }
  try {
    const s = await statfs(appConfig.dataPath);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    if (total <= 0) return null;
    return {
      freeGb: free / GIB,
      totalGb: total / GIB,
      usedGb: (total - free) / GIB,
      chassis: null,
      diskLifeTime: null,
    };
  } catch (err) {
    log.debug('statfs disk info unavailable', { error: String(err) });
    return null;
  }
}

function storageSpaceSeverity(kind: StorageKind, freeGb: number, totalGb: number): Severity {
  if (kind === 'flash') {
    if (freeGb < FLASH_CRITICAL_GB) return 'critical';
    if (freeGb < FLASH_WARN_GB) return 'warn';
    return 'ok';
  }
  const ratio = totalGb > 0 ? freeGb / totalGb : 1;
  if (ratio < SSD_CRITICAL_RATIO) return 'critical';
  if (ratio < SSD_WARN_RATIO) return 'warn';
  return 'ok';
}

function storageLifeSeverity(life: number | null): Severity {
  if (life == null) return 'ok';
  if (life >= DISK_LIFE_CRITICAL) return 'critical';
  if (life >= DISK_LIFE_WARN) return 'warn';
  return 'ok';
}

/**
 * Standing condition: a full data disk never becomes a backlog task.
 * Thresholds follow the medium – absolute GB on SD/eMMC, percent on SSD –
 * because 10 % of 32 GB is already a crisis and 10 % of 2 TB is still plenty.
 */
function checkStorage(disk: ha.HostDiskInfo): HealthCheck {
  const kind = classifyStorage(disk.totalGb);
  const kindLabel = kind === 'flash' ? 'SD/eMMC' : 'SSD';
  const freePct = disk.totalGb > 0 ? (disk.freeGb / disk.totalGb) * 100 : 0;
  const spaceSev = storageSpaceSeverity(kind, disk.freeGb, disk.totalGb);
  const lifeSev = storageLifeSeverity(disk.diskLifeTime);
  const severity = worseSeverity(spaceSev, lifeSev);

  const copy = healthCopy();
  const threshold =
    kind === 'flash'
      ? copy.storageWarnFlash(FLASH_WARN_GB, FLASH_CRITICAL_GB)
      : copy.storageWarnSsd;

  const parts: string[] = [
    copy.storageFree(
      formatGb(disk.freeGb),
      formatGb(disk.totalGb),
      formatLocaleNumber(freePct, 0),
      kindLabel,
    ),
  ];
  if (spaceSev !== 'ok') parts.push(copy.storageThresholds(threshold));
  if (disk.diskLifeTime != null) {
    parts.push(copy.storageLife(Math.round(disk.diskLifeTime)));
  }

  const hintBits: string[] = [];
  if (spaceSev !== 'ok') {
    hintBits.push(kind === 'flash' ? copy.storageHintFlash : copy.storageHintSsd);
  }
  if (lifeSev !== 'ok') {
    hintBits.push(copy.storageHintLife);
  }

  return {
    key: 'storage',
    label: copy.storage.label,
    severity,
    count: Math.round(disk.freeGb),
    short: formatGb(disk.freeGb),
    detail: parts.join(' '),
    entities: [],
    items: [],
    hint: hintBits.join(' ') || copy.storageHintOk(threshold, kindLabel),
  };
}

const RECORDER_BACKLOG_WARN = 1_000;
const RECORDER_BACKLOG_CRITICAL = 10_000;

function checkRecorder(info: ha.RecorderInfo): HealthCheck {
  const dead = info.recording === false || info.threadRunning === false;
  const backlog = info.backlog ?? 0;
  let severity: Severity = 'ok';
  if (dead) severity = 'critical';
  else if (info.migration) severity = 'warn';
  else if (backlog >= RECORDER_BACKLOG_CRITICAL) severity = 'critical';
  else if (backlog >= RECORDER_BACKLOG_WARN) severity = 'warn';

  const copy = healthCopy();
  const parts: string[] = [];
  if (dead) parts.push(copy.recorderDead);
  else parts.push(copy.recorderOk);
  if (info.migration) parts.push(copy.recorderMigration);
  if (info.backlog != null) parts.push(copy.recorderBacklog(info.backlog));

  return {
    key: 'recorder',
    label: copy.recorder.label,
    severity,
    count: dead ? 1 : backlog,
    short: dead
      ? copy.recorderShortOff
      : info.backlog != null
        ? String(info.backlog)
        : copy.recorderShortOk,
    detail: parts.join(' '),
    entities: [],
    items: [],
    hint: dead ? copy.recorderHintDead : copy.recorderHintOk,
  };
}

const CHECK_HREF: Record<HealthCheckKey, string | undefined> = {
  unavailable: HA_PATH.entities,
  orphans: HA_PATH.entities,
  stale_sensors: HA_PATH.entities,
  low_battery: HA_PATH.entities,
  broken_refs: '/config/automation/dashboard',
  failed_automations: '/config/automation/dashboard',
  pending_updates: HA_PATH.updates,
  stuck_updates: HA_PATH.updates,
  failed_integrations: '/config/integrations',
  outage_cluster: '/config/integrations',
  energy_meta: HA_PATH.energy,
  radio_quiet: HA_PATH.entities,
  stopped_addons: HA_PATH.addons,
  recorder: HA_PATH.recorder,
  restored: HA_PATH.entities,
  backup: HA_PATH.backup,
  storage: HA_PATH.storage,
};

function isCountInverted(key: HealthCheck['key']): boolean {
  return key === 'storage';
}

function checkGotWorse(check: HealthCheck, prev: { severity: Severity; count: number }): boolean {
  if (SEVERITY_ORDER[check.severity] > SEVERITY_ORDER[prev.severity]) return true;
  if (check.severity === 'ok') return false;
  if (isCountInverted(check.key)) return check.count < prev.count;
  return check.count > prev.count;
}

function sortChecks(checks: HealthCheck[]): HealthCheck[] {
  return [...checks].sort((a, b) => {
    const sd = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    return sd !== 0 ? sd : a.label.localeCompare(b.label, dateLocale());
  });
}

function checkAbout(key: HealthCheck['key']): string {
  const copy = healthCopy();
  const block = (copy as Record<HealthCheck['key'], { about: string }>)[key];
  return block.about;
}

function decorateChecks(checks: HealthCheck[]): HealthCheck[] {
  return checks.map(c => ({
    ...c,
    about: c.about ?? checkAbout(c.key),
    href: c.href ?? CHECK_HREF[c.key],
  }));
}

// ── Report cache ──────────────────────────────────────────

let cachedHealth: SystemHealth | null = null;
let hydrateReport: Promise<void> | null = null;
let refreshInFlight: Promise<SystemHealth> | null = null;

function isSystemHealth(value: unknown): value is SystemHealth {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o['checkedAt'] === 'string' && Array.isArray(o['checks']);
}

async function readLastReport(): Promise<SystemHealth | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(REPORT_PATH, 'utf-8'));
    return isSystemHealth(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLastReport(health: SystemHealth): Promise<void> {
  await withPathLock(REPORT_PATH, () => atomicWriteJson(REPORT_PATH, health));
}

async function hydrateCachedHealth(): Promise<void> {
  if (cachedHealth) return;
  if (!hydrateReport) {
    hydrateReport = readLastReport()
      .then(report => {
        if (report && !cachedHealth) cachedHealth = report;
      })
      .finally(() => {
        hydrateReport = null;
      });
  }
  await hydrateReport;
}

export function isHealthRefreshInFlight(): boolean {
  return refreshInFlight != null;
}

/** Last completed report from memory, or from disk after a restart. */
export async function getCachedSystemHealth(): Promise<SystemHealth | null> {
  await hydrateCachedHealth();
  return cachedHealth;
}

/** Drop the in-memory cache so the next read hydrates from disk again. */
export function resetHealthCache(): void {
  cachedHealth = null;
  hydrateReport = null;
  refreshInFlight = null;
}

// ── Public API ────────────────────────────────────────────

/** Run all health checks against the current Home Assistant state. */
export async function getSystemHealth(): Promise<SystemHealth> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = computeSystemHealth().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function computeSystemHealth(): Promise<SystemHealth> {
  resetAutomationIndexCache();
  const states = (await ha.getStates()) as HAState[];
  const now = new Date();

  const unavailableStates = states.filter(
    s => s.state === 'unavailable' && !isBackupStatusEntity(s.entity_id, s.attributes),
  );
  const orphanIds = unavailableStates
    .filter(s => {
      const hours = hoursSince(s.last_updated || s.last_changed, now);
      return hours != null && hours >= ORPHAN_DAYS * 24;
    })
    .map(s => s.entity_id);
  const orphanSet = new Set(orphanIds);
  const restoredIds = states
    .filter(
      s =>
        s.attributes['restored'] === true &&
        !isBackupStatusEntity(s.entity_id, s.attributes) &&
        !orphanSet.has(s.entity_id),
    )
    .map(s => s.entity_id);
  const restoredSet = new Set(restoredIds);
  const unavailable = unavailableStates
    .filter(s => !orphanSet.has(s.entity_id) && !restoredSet.has(s.entity_id))
    .map(s => s.entity_id);

  const stale = states
    .filter(s => {
      if (!isPeriodicSensor(s)) return false;
      if (s.state === 'unavailable' || s.state === 'unknown') return false;
      if (isBackupStatusEntity(s.entity_id, s.attributes)) return false;
      const reportedAt = s.last_updated || s.last_changed;
      const hoursAgo = (now.getTime() - new Date(reportedAt).getTime()) / 3_600_000;
      return hoursAgo > STALE_HOURS;
    })
    .map(s => s.entity_id);
  const lowBattery = states
    .filter(s => {
      const level = Number(s.attributes['battery_level'] ?? s.attributes['battery'] ?? -1);
      return level >= 0 && level < LOW_BATTERY_PCT;
    })
    .map(s => s.entity_id);

  const unavailableSet = new Set(unavailableStates.map(s => s.entity_id));
  const radioQuiet = states
    .filter(s => {
      if (unavailableSet.has(s.entity_id)) return false;
      if (isLastSeenEntity(s)) {
        const age = parseLastSeenAgeHours(s, now);
        return age != null && age > RADIO_QUIET_HOURS;
      }
      if (isLinkQualityEntity(s)) {
        if (s.state === 'unavailable' || s.state === 'unknown') return false;
        const n = Number(s.state);
        return Number.isFinite(n) && n >= 0 && n <= LQI_WEAK;
      }
      return false;
    })
    .map(s => s.entity_id);

  const pendingUpdates = states.filter(isPendingUpdate);
  const pendingUpdateIds = pendingUpdates.map(s => s.entity_id);
  const stackUpdateWaiting = pendingUpdates.some(isHaStackUpdate);
  const energyMetaIds = findEnergyMetaEntityIds(states);
  const stuck = findStuckUpdates(states, now);

  const involved = [
    ...new Set([
      ...unavailable,
      ...orphanIds,
      ...stale,
      ...lowBattery,
      ...radioQuiet,
      ...pendingUpdateIds,
      ...stuck.entityIds,
      ...energyMetaIds,
      ...restoredIds,
    ]),
  ];
  const addonsPromise: Promise<ha.SupervisorAddon[] | null> = appConfig.isAddon
    ? ha.getSupervisorAddons().catch(err => {
        log.debug('Supervisor add-on list unavailable', { error: String(err) });
        return null;
      })
    : Promise.resolve(null);

  const [deviceInfo, backup, disk, snapshot, addons, recorder, repairsRaw, history] =
    await Promise.all([
      involved.length > 0 ? ha.getEntityDeviceInfo(involved) : Promise.resolve([]),
      checkBackup(now, states),
      readDiskInfo(),
      ha.getRegistrySnapshot(),
      addonsPromise,
      ha.getRecorderInfo(),
      ha.getRepairIssues(),
      loadHealthHistory(),
    ]);

  const [brokenRefs, failedAutos, failedIntegrations] = await Promise.all([
    findBrokenReferences(states, snapshot),
    Promise.resolve(findFailedAutomations(states, snapshot)),
    Promise.resolve(findFailedIntegrations(snapshot)),
  ]);

  const updates = checkPendingUpdates(pendingUpdateIds, deviceInfo);
  if (stackUpdateWaiting && updates.severity !== 'critical') {
    updates.severity = updates.count > 0 ? 'critical' : updates.severity;
    if (updates.count > 0) {
      updates.hint = 'Home Assistant Core, OS oder Supervisor wartet. Das zuerst, dann Geräte.';
    }
  }

  const stuckCheck = checkStuckUpdates(stuck.entityIds, deviceInfo);
  if (stuck.stackStuck && stuckCheck.count > 0) {
    stuckCheck.severity = 'critical';
    stuckCheck.hint = healthCopy().stuckStackHint;
  }

  const prevUnavail = lastDifferentHourSample(
    history.samples['unavailable'] ?? [],
    now.toISOString(),
  );
  const clusters = findOutageClusters(unavailable, snapshot, prevUnavail ? prevUnavail.ids : null);

  const integrations = checkFailedIntegrations(failedIntegrations);
  const failedDomains = new Set(
    snapshot.entries
      .filter(e => failedIntegrations.some(item => item.id === e.entry_id))
      .map(e => e.domain),
  );
  const copy = healthCopy();
  const repairNote = formatRepairNote(parseRepairIssues(repairsRaw), failedDomains, copy);
  if (repairNote) integrations.note = repairNote;

  const refs = checkBrokenRefs(brokenRefs.items);
  if (brokenRefs.yamlOnly > 0 || brokenRefs.uiScanned > 0) {
    refs.note = `${brokenRefs.uiScanned} UI-Automationen/Skripte vollständig, ${brokenRefs.yamlOnly} nur YAML (kein voller Scan).`;
    if (refs.severity === 'ok' && brokenRefs.yamlOnly > 0) {
      refs.detail = `Keine kaputten Referenzen in den UI-Einträgen. ${refs.note}`;
    }
  }

  const checks: HealthCheck[] = [
    checkUnavailable(unavailable, deviceInfo),
    checkOrphans(orphanIds, deviceInfo),
    checkStaleSensors(stale, deviceInfo),
    checkLowBattery(lowBattery, deviceInfo),
    refs,
    checkFailedAutomations(failedAutos),
    updates,
    stuckCheck,
    integrations,
    checkOutageClusters(clusters),
    checkEnergyMeta(energyMetaIds, deviceInfo),
    checkRadioQuiet(radioQuiet, deviceInfo),
    ...(addons ? [checkStoppedAddons(findStoppedAddons(addons))] : []),
    checkRestored(restoredIds, deviceInfo),
    backup,
  ];
  if (recorder.recording != null || recorder.threadRunning != null || recorder.backlog != null) {
    checks.push(checkRecorder(recorder));
  }
  if (disk) checks.push(checkStorage(disk));

  const decorated = decorateChecks(checks);
  const health: SystemHealth = {
    checkedAt: now.toISOString(),
    severity: decorated.reduce<Severity>(
      (worst, c) => (SEVERITY_ORDER[c.severity] > SEVERITY_ORDER[worst] ? c.severity : worst),
      'ok',
    ),
    totalEntities: states.length,
    haBase: haFrontendBase(),
    checks: decorated,
  };
  await rememberChecks(health);
  try {
    await recordHealthHistory(health.checkedAt, health.checks);
  } catch (err) {
    log.warn('Could not record health history', { error: String(err) });
  }
  health.checks = sortChecks(health.checks);
  cachedHealth = health;
  try {
    await writeLastReport(health);
  } catch (err) {
    log.warn('Could not persist last health report', { error: String(err) });
  }
  return health;
}

async function readSnapshot(): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf-8')) as Snapshot;
  } catch {
    return {};
  }
}

async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await withPathLock(SNAPSHOT_PATH, () => atomicWriteJson(SNAPSHOT_PATH, snapshot));
}

function lastSeenOf(
  prev?: SnapshotEntry,
): { severity: Severity; count: number; checkedAt: string } | null {
  if (!prev || typeof prev.count !== 'number' || !prev.checkedAt) return null;
  return { severity: prev.severity, count: prev.count, checkedAt: prev.checkedAt };
}

/**
 * Persist last-seen values so the UI can say "war 1" after a reload, and so
 * the next change still has a prior to compare against. Notify fields stay
 * untouched — findHealthRegressions owns those.
 */
async function rememberChecks(health: SystemHealth): Promise<void> {
  const snapshot = await readSnapshot();
  const next: Snapshot = { ...snapshot };

  for (const check of health.checks) {
    const prev = snapshot[check.key];
    const last = lastSeenOf(prev);
    const unchanged =
      last != null && last.severity === check.severity && last.count === check.count;

    if (
      unchanged &&
      prev?.priorSeverity != null &&
      prev.priorCount != null &&
      prev.priorCheckedAt
    ) {
      if (prev.priorSeverity !== check.severity || prev.priorCount !== check.count) {
        check.previous = {
          severity: prev.priorSeverity,
          count: prev.priorCount,
          checkedAt: prev.priorCheckedAt,
        };
        check.worse = checkGotWorse(check, {
          severity: prev.priorSeverity,
          count: prev.priorCount,
        });
      }
    } else if (last && !unchanged) {
      check.previous = {
        severity: last.severity,
        count: last.count,
        checkedAt: last.checkedAt,
      };
      check.worse = checkGotWorse(check, last);
    }

    const migrating = Boolean(
      prev?.notifiedAt && prev.notifiedSeverity == null && typeof prev.count !== 'number',
    );

    next[check.key] = {
      severity: check.severity,
      count: check.count,
      checkedAt: health.checkedAt,
      priorSeverity: unchanged ? prev?.priorSeverity : last?.severity,
      priorCount: unchanged ? prev?.priorCount : last?.count,
      priorCheckedAt: unchanged ? prev?.priorCheckedAt : last?.checkedAt,
      notifiedSeverity: prev?.notifiedSeverity ?? (migrating ? prev?.severity : undefined),
      notifiedCount: prev?.notifiedCount,
      notifiedAt: prev?.notifiedAt,
    };
  }

  await writeSnapshot(next);
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
      if (previous) {
        next[check.key] = {
          ...previous,
          notifiedSeverity: undefined,
          notifiedCount: undefined,
          notifiedAt: undefined,
        };
      }
      continue;
    }

    const notifiedSev = previous?.notifiedSeverity;
    const notifiedCount = previous?.notifiedCount;
    const neverNotified = !previous?.notifiedAt;
    const worsenedSeverity =
      neverNotified ||
      (notifiedSev != null && SEVERITY_ORDER[check.severity] > SEVERITY_ORDER[notifiedSev]);
    // Free disk / recorder backlog shrink as the problem grows — doubling
    // the count would never fire. Severity is the signal.
    const skipDouble = check.key === 'storage' || check.key === 'recorder';
    const doubled =
      !skipDouble && notifiedCount != null && notifiedCount > 0
        ? check.count >= notifiedCount * 2
        : false;

    if (worsenedSeverity || doubled) {
      regressions.push(check);
      next[check.key] = {
        ...(previous ?? {
          severity: check.severity,
          count: check.count,
          checkedAt: health.checkedAt,
        }),
        notifiedSeverity: check.severity,
        notifiedCount: check.count,
        notifiedAt: health.checkedAt,
      };
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
    .map(c => `${icon[c.severity]} ${c.label}: ${c.short ?? String(c.count)}`)
    .join('\n');
}
