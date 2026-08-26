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

import { readFile, writeFile, rename, mkdir, statfs } from 'node:fs/promises';
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

export interface HealthItem {
  /** Device id, or a synthetic key when the entity has no device. */
  id: string;
  /** Device name for the UI; falls back to a readable stem of the entity id. */
  label: string;
  /** All unavailable/stale/low-battery entities that belong to this device. */
  entities: string[];
}

export interface HealthCheck {
  /** Stable identifier – safe to persist and compare across runs. */
  key: 'unavailable' | 'stale_sensors' | 'low_battery' | 'backup' | 'storage';
  /** Short German label for the UI. */
  label: string;
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

/** Days without a Home Assistant backup before the check turns yellow / red. */
const BACKUP_WARN_DAYS = 7;
const BACKUP_CRITICAL_DAYS = 14;

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

/**
 * Diagnostic / satellite suffixes that must not split one physical device
 * into many rows when the device registry is unavailable.
 * Longest match first.
 */
const DIAGNOSTIC_SUFFIXES = [
  'batteriespannung',
  'batterietyp',
  'battery_voltage',
  'battery_type',
  'identifizieren',
  'linkquality',
  'last_seen',
  'firmware',
  'identify',
  'batterie',
  'battery',
  'update',
  'contact',
  'opening',
  'tamper',
  'tur',
  'lqi',
];

/** Collapse `sensor.foo_bar_batterie_12` → `foo_bar` for fallback grouping. */
export function entityDeviceStem(entityId: string): string {
  let name = (entityId.split('.')[1] ?? entityId).toLowerCase();
  name = name.replace(/_\d+$/, '');
  for (const suffix of DIAGNOSTIC_SUFFIXES) {
    if (name.endsWith(`_${suffix}`)) {
      name = name.slice(0, -(suffix.length + 1));
      break;
    }
  }
  return name;
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
      byStem.set(stem, { id: `stem:${stem}`, label: group.label, entities: [...group.entities] });
      continue;
    }
    const named = /[A-ZÄÖÜ ]/.test(group.label);
    const alreadyNamed = /[A-ZÄÖÜ ]/.test(existing.label);
    if (named && !alreadyNamed) existing.label = group.label;
    existing.entities.push(...group.entities);
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
  return buildCheck(
    'unavailable',
    'Geräte nicht erreichbar',
    groupByDevice(entityIds, info),
    'Alle Geräte antworten.',
    'Ein Gerät erscheint einmal, auch wenn es viele Entities mitbringt (Batterie, Firmware, Identifizieren, …). Strom, Funk und Integration prüfen. Geräte, die es nicht mehr gibt – inklusive Altlasten vom Neu-Anlernen – aus Home Assistant entfernen.',
    3,
    15,
  );
}

function checkStaleSensors(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  return buildCheck(
    'stale_sensors',
    `Sensoren seit ${STALE_HOURS}h unverändert`,
    groupByDevice(entityIds, info),
    'Alle Sensoren melden aktuelle Werte.',
    'Batterie leer oder Verbindung verloren? Dauerhaft tote Sensoren aus Home Assistant entfernen. Achtung: manche Sensoren ändern sich legitim selten.',
    5,
    25,
  );
}

function checkLowBattery(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  return buildCheck(
    'low_battery',
    `Batterie unter ${LOW_BATTERY_PCT}%`,
    groupByDevice(entityIds, info),
    'Keine schwachen Batterien.',
    'Batterien zeitnah wechseln.',
    1,
    8,
  );
}

function backupIncludesHomeAssistant(backup: ha.SupervisorBackup): boolean {
  return backup.type === 'full' || backup.content?.homeassistant === true;
}

function backupIsOffsite(backup: ha.SupervisorBackup): boolean {
  const locs = backup.locations ?? [backup.location];
  return locs.some(loc => loc != null && loc !== '' && loc !== '.local');
}

function formatBackupAge(days: number): string {
  if (days <= 0) return 'heute';
  if (days === 1) return 'vor 1 Tag';
  return `vor ${days} Tagen`;
}

function formatBackupDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function formatBackupLabel(backup: ha.SupervisorBackup): string {
  const kind = backup.type === 'full' ? 'Vollbackup' : 'Teilbackup';
  const loc = backupIsOffsite(backup) ? (backup.location ?? 'extern') : 'lokal';
  const size = backup.size != null && backup.size !== '' ? ` · ${String(backup.size)} MB` : '';
  return `${formatBackupDate(backup.date)} · ${kind} · ${loc}${size}`;
}

function backupCheck(partial: Omit<HealthCheck, 'key' | 'label' | 'entities'>): HealthCheck {
  return {
    key: 'backup',
    label: 'Backup',
    entities: partial.items.map(i => i.label),
    ...partial,
  };
}

/**
 * Backup health is a standing condition like device reachability: it never
 * becomes a backlog task. Age is measured against the newest backup that
 * actually contains Home Assistant – an add-on-only partial yesterday does
 * not hide a 3-week-old last full backup.
 */
async function checkBackup(now: Date): Promise<HealthCheck> {
  const hint =
    'Unter Einstellungen → System → Backups einen Zeitplan einrichten. Ein Backup nur auf der SD-Karte rettet bei Hardware-Tod nicht – zusätzlich NAS oder Cloud.';

  if (!appConfig.isAddon) {
    return backupCheck({
      severity: 'ok',
      count: 0,
      short: 'n/a',
      detail: 'Backup-Prüfung läuft nur im Home Assistant Add-on (Supervisor).',
      items: [],
      hint,
    });
  }

  let info: ha.SupervisorBackupInfo;
  try {
    info = await ha.getBackupInfo();
  } catch (err) {
    log.warn('Backup list unavailable', { error: String(err) });
    return backupCheck({
      severity: 'warn',
      count: 0,
      short: 'nicht lesbar',
      detail: `Backup-Liste nicht lesbar: ${String(err).slice(0, 160)}`,
      items: [],
      hint,
    });
  }

  const backups = [...(info.backups ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const items: HealthItem[] = backups.slice(0, MAX_EXAMPLES).map(b => ({
    id: b.slug,
    label: `${b.name || 'Backup'} – ${formatBackupLabel(b)}`,
    entities: [],
  }));

  if (backups.length === 0) {
    return backupCheck({
      severity: 'critical',
      count: 0,
      short: 'keins',
      detail: 'Keine Backups vorhanden.',
      items: [],
      hint,
    });
  }

  const withHa = backups.filter(backupIncludesHomeAssistant);
  const latestHa = withHa[0];
  const latest = backups[0]!;
  const offsite = backups.some(backupIsOffsite);

  if (!latestHa) {
    const latestAge = Math.max(
      0,
      Math.floor((now.getTime() - new Date(latest.date).getTime()) / 86_400_000),
    );
    return backupCheck({
      severity: 'critical',
      count: latestAge,
      short: 'kein HA-Backup',
      detail: `Kein Backup enthält Home Assistant. Zuletzt: ${latest.name} (${formatBackupAge(latestAge)}). ${backups.length} Backups insgesamt.`,
      items,
      hint,
    });
  }

  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(latestHa.date).getTime()) / 86_400_000),
  );

  let severity: Severity = 'ok';
  if (ageDays >= BACKUP_CRITICAL_DAYS) severity = 'critical';
  else if (ageDays >= BACKUP_WARN_DAYS) severity = 'warn';
  if (info.days_until_stale && ageDays >= info.days_until_stale && severity === 'ok') {
    severity = 'warn';
  }
  if (!offsite && severity === 'ok') severity = 'warn';

  const parts = [
    `Letztes Backup mit Home Assistant ${formatBackupAge(ageDays)} (${latestHa.name}).`,
  ];
  if (latest.slug !== latestHa.slug) {
    parts.push(`Neuester Stand ist ein Teilbackup ohne HA (${latest.name}).`);
  }
  parts.push(`${backups.length} Backup${backups.length === 1 ? '' : 's'} insgesamt.`);
  if (!offsite) parts.push('Alle nur lokal – bei Platten-/SD-Tod weg.');

  return backupCheck({
    severity,
    count: ageDays,
    short: formatBackupAge(ageDays),
    detail: parts.join(' '),
    items,
    hint,
  });
}

type StorageKind = 'flash' | 'ssd';

function classifyStorage(totalGb: number): StorageKind {
  return totalGb > 0 && totalGb < FLASH_TOTAL_GB ? 'flash' : 'ssd';
}

function formatGb(n: number): string {
  const digits = n < 10 ? 1 : 0;
  return `${n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} GB`;
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

  const threshold =
    kind === 'flash'
      ? `Warnung unter ${FLASH_WARN_GB} GB, kritisch unter ${FLASH_CRITICAL_GB} GB`
      : 'Warnung unter 10 % frei, kritisch unter 5 %';

  const parts: string[] = [
    `${formatGb(disk.freeGb)} von ${formatGb(disk.totalGb)} frei (${freePct.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %, ${kindLabel}).`,
  ];
  if (spaceSev !== 'ok') parts.push(`Schwellen: ${threshold}.`);
  if (disk.diskLifeTime != null) {
    parts.push(
      `Geschaetzte Laufwerk-Lebensdauer zu ${Math.round(disk.diskLifeTime)} % verbraucht.`,
    );
  }

  const hintBits: string[] = [];
  if (spaceSev !== 'ok') {
    hintBits.push(
      kind === 'flash'
        ? 'Backups, Recorder-DB und Updates brauchen Luft. Alte Backups loeschen, History bereinigen, oder groessere Karte.'
        : 'Recorder-Historie kuerzen, alte Backups entfernen, oder Speicher erweitern.',
    );
  }
  if (lifeSev !== 'ok') {
    hintBits.push('Das Laufwerk naehert sich dem Ende seiner Schreibzyklen. Austausch einplanen.');
  }

  return {
    key: 'storage',
    label: 'Speicherplatz',
    severity,
    count: Math.round(disk.freeGb),
    short: formatGb(disk.freeGb),
    detail: parts.join(' '),
    entities: [],
    items: [],
    hint: hintBits.join(' ') || `${threshold} (${kindLabel}).`,
  };
}

// ── Public API ────────────────────────────────────────────

/** Run all health checks against the current Home Assistant state. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const states = (await ha.getStates()) as HAState[];
  const now = new Date();

  const unavailable = states.filter(s => s.state === 'unavailable').map(s => s.entity_id);
  const stale = states
    .filter(s => {
      if (!s.entity_id.startsWith('sensor.') && !s.entity_id.startsWith('binary_sensor.')) {
        return false;
      }
      if (s.state === 'unavailable' || s.state === 'unknown') return false;
      const hoursAgo = (now.getTime() - new Date(s.last_changed).getTime()) / 3_600_000;
      return hoursAgo > STALE_HOURS;
    })
    .map(s => s.entity_id);
  const lowBattery = states
    .filter(s => {
      const level = Number(s.attributes['battery_level'] ?? s.attributes['battery'] ?? -1);
      return level >= 0 && level < LOW_BATTERY_PCT;
    })
    .map(s => s.entity_id);

  const involved = [...new Set([...unavailable, ...stale, ...lowBattery])];
  const [deviceInfo, backup, disk] = await Promise.all([
    involved.length > 0 ? ha.getEntityDeviceInfo(involved) : Promise.resolve([]),
    checkBackup(now),
    readDiskInfo(),
  ]);

  const checks: HealthCheck[] = [
    checkUnavailable(unavailable, deviceInfo),
    checkStaleSensors(stale, deviceInfo),
    checkLowBattery(lowBattery, deviceInfo),
    backup,
  ];
  if (disk) checks.push(checkStorage(disk));

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
    // Free disk space shrinks as the problem grows – doubling the count
    // would never fire. Severity (ok → warn → critical) is the signal.
    const doubled =
      check.key !== 'storage' && previous ? check.count >= previous.notifiedCount * 2 : false;

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
    .map(c => `${icon[c.severity]} ${c.label}: ${c.short ?? String(c.count)}`)
    .join('\n');
}
