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
import { checkBackup, isBackupStatusEntity } from './backup-health.js';
import {
  findBrokenReferences,
  findDisabledEntities,
  findFailedAutomations,
  findFailedIntegrations,
  findStoppedAddons,
} from './health-signals.js';
import { HA_PATH, haFrontendBase, hrefForEntity } from './health-links.js';

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
    | 'failed_integrations'
    | 'radio_quiet'
    | 'stopped_addons'
    | 'recorder'
    | 'restored'
    | 'disabled_entities'
    | 'backup'
    | 'storage';
  /** Short German label for the UI. */
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
    `Sensoren seit ${STALE_HOURS}h ohne Meldung`,
    groupByDevice(entityIds, info),
    'Die Sensoren, die sich regelmässig melden sollten, tun das.',
    'Nur Temperatur, Luftfeuchte, Luftdruck und Luftqualität. Ein Fenster das tagelang zu bleibt, ist kein Defekt. Batterie und Integration prüfen, oder das Gerät aus Home Assistant entfernen.',
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

function checkOrphans(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  return buildCheck(
    'orphans',
    `Seit ${ORPHAN_DAYS} Tagen nicht erreichbar`,
    groupByDevice(entityIds, info),
    'Keine Altlasten – nichts hängt seit Wochen auf unavailable.',
    'Das Gerät gibt es vermutlich nicht mehr. In Home Assistant entfernen, sonst bleibt es für immer in der Liste der Unerreichbaren.',
    1,
    8,
  );
}

function checkBrokenRefs(items: HealthItem[]): HealthCheck {
  return buildCheck(
    'broken_refs',
    'Kaputte Referenzen',
    items,
    'Automationen, Skripte und Szenen zeigen auf Entities, die es noch gibt.',
    'Entity umbenannt oder gelöscht. Die Automation, das Skript oder die Szene auf die neue ID umstellen, oder den Eintrag entfernen.',
    1,
    8,
  );
}

function checkFailedAutomations(items: HealthItem[]): HealthCheck {
  return buildCheck(
    'failed_automations',
    'Automationen und Skripte mit Fehler',
    items,
    'Kein Automation- oder Skript-Trace mit Fehler.',
    'Letzten Trace öffnen. Meist eine kaputte Bedingung oder eine Entity, die es nicht mehr gibt.',
    1,
    5,
  );
}

function checkStoppedAddons(items: HealthItem[]): HealthCheck {
  return buildCheck(
    'stopped_addons',
    'Add-ons laufen nicht',
    items,
    'Alle Add-ons mit Autostart laufen.',
    'Add-on starten oder die Logs prüfen. Gestoppte Add-ons mit manuellem Boot werden nicht gezählt.',
    1,
    3,
  );
}

function checkRestored(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  return buildCheck(
    'restored',
    'Nur wiederhergestellt',
    groupByDevice(entityIds, info),
    'Keine Entities, die nur aus einem Restore stammen und seit dem Start nicht gesehen wurden.',
    'Nach einem Restore oder einem neuen Datenträger: Integration neu laden oder die Entity entfernen, wenn das Gerät nicht mehr existiert.',
    1,
    15,
  );
}

const DISABLED_LIST_CAP = 40;

function checkDisabled(items: HealthItem[]): HealthCheck {
  const check = buildCheck(
    'disabled_entities',
    'Deaktivierte Entities',
    items,
    'Keine deaktivierten Entities in der Registry.',
    'Einstellungen → Geräte & Dienste → Entities. Altlasten löschen oder wieder aktivieren.',
    15,
    60,
  );
  if (items.length > DISABLED_LIST_CAP) {
    check.items = items.slice(0, DISABLED_LIST_CAP);
    check.note = `Erste ${DISABLED_LIST_CAP} von ${items.length} angezeigt.`;
  }
  return check;
}

function checkPendingUpdates(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  return buildCheck(
    'pending_updates',
    'Updates liegen bereit',
    groupByDevice(entityIds, info),
    'Keine ausstehenden Updates.',
    'Core, OS und Add-ons zuerst. Firmware an Geräten, die du noch benutzt.',
    1,
    8,
  );
}

function checkFailedIntegrations(items: HealthItem[]): HealthCheck {
  return buildCheck(
    'failed_integrations',
    'Integrationen laden nicht',
    items,
    'Alle Integrationen sind geladen.',
    'Unter Einstellungen → Geräte & Dienste die Integration neu laden oder die Anmeldung prüfen. Home Assistant Repairs zeigt oft denselben Fehler einzeln.',
    1,
    3,
  );
}

function checkRadioQuiet(entityIds: string[], info: ha.EntityDeviceInfo[]): HealthCheck {
  return buildCheck(
    'radio_quiet',
    'Funk wird leise',
    groupByDevice(entityIds, info),
    'Keine Zigbee-Geräte mit altem last_seen oder sehr schwachem LQI.',
    'Nur last_seen / Linkquality. Gerät näher an einen Router, Batterie prüfen, oder Mesh aufräumen. Nicht dasselbe wie „unerreichbar“.',
    3,
    10,
  );
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

function isHaStackUpdate(s: HAState): boolean {
  const id = s.entity_id.toLowerCase();
  const title = String(s.attributes['title'] ?? '').toLowerCase();
  return (
    id.includes('core_update') ||
    id.includes('supervisor_update') ||
    id.includes('os_update') ||
    id.includes('operating_system') ||
    title.includes('operating system') ||
    title.includes('supervisor') ||
    title === 'home assistant core'
  );
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

  const parts: string[] = [];
  if (dead) parts.push('Der Recorder schreibt gerade nicht.');
  else parts.push('Der Recorder läuft.');
  if (info.migration) parts.push('Eine Migration ist offen.');
  if (info.backlog != null) parts.push(`Rückstau: ${info.backlog}.`);

  return {
    key: 'recorder',
    label: 'Recorder / Historie',
    severity,
    count: dead ? 1 : backlog,
    short: dead ? 'aus' : info.backlog != null ? String(info.backlog) : 'ok',
    detail: parts.join(' '),
    entities: [],
    items: [],
    hint: dead
      ? 'Einstellungen → System → Protokolle und die Recorder-Integration prüfen. Oft eine volle oder gesperrte Datenbank.'
      : 'Historie unter Entwicklerwerkzeuge → Statistik. Rückstau baut sich nach einem Neustart oft von selbst ab.',
  };
}

const CHECK_META: Record<HealthCheck['key'], { about: string; href?: string }> = {
  unavailable: {
    about:
      'Geräte, die seit weniger als 30 Tagen auf unavailable stehen. Ein physisches Gerät zählt einmal, auch mit vielen Entities.',
    href: HA_PATH.entities,
  },
  orphans: {
    about:
      'Geräte, die seit 30 Tagen oder länger unavailable sind. Meist Hardware, die es nicht mehr gibt.',
    href: HA_PATH.entities,
  },
  stale_sensors: {
    about:
      'Nur Periodicsensoren (Temperatur, Luftfeuchte, Luftdruck, Luftqualität), die sich 48 Stunden nicht gemeldet haben. Ein geschlossenes Fenster ist kein Defekt.',
    href: HA_PATH.entities,
  },
  low_battery: {
    about: 'Geräte, deren Batterie unter 20 % gemeldet wird.',
    href: HA_PATH.entities,
  },
  broken_refs: {
    about:
      'Automationen, Skripte und Szenen, die eine Entity oder ein Gerät nennen, das Home Assistant nicht mehr kennt. Klassiker nach dem Umbenennen.',
    href: '/config/automation/dashboard',
  },
  failed_automations: {
    about:
      'Automationen und Skripte, deren letzter Trace einen Fehler hat, oder die selbst unavailable sind.',
    href: '/config/automation/dashboard',
  },
  pending_updates: {
    about: 'update.*-Entities mit verfügbarem Update. Core, OS und Supervisor zählen kritisch.',
    href: HA_PATH.updates,
  },
  failed_integrations: {
    about:
      'Config Entries im Setup-Fehler oder Retry. Overlap mit Home Assistant Repairs — hier die Summe.',
    href: '/config/integrations',
  },
  radio_quiet: {
    about:
      'Zigbee last_seen älter als 48 Stunden oder Linkqualität 20 oder weniger. Schon unavailable zählt hier nicht nochmal.',
    href: HA_PATH.entities,
  },
  stopped_addons: {
    about:
      'Add-ons mit Autostart, die nicht laufen, oder im Fehlerzustand. Manuell gestoppte zählen nicht.',
    href: HA_PATH.addons,
  },
  recorder: {
    about:
      'Ob der Recorder Historie schreibt und wie groß der Rückstau ist. Unabhängig vom freien Speicherplatz.',
    href: HA_PATH.recorder,
  },
  restored: {
    about:
      'Entities mit restored=true — nach einem Restore gesehen, seit diesem Start aber nie wieder. Weder unavailable noch 30-Tage-Waise.',
    href: HA_PATH.entities,
  },
  disabled_entities: {
    about:
      'Alle in der Registry deaktivierten Entities. Ein wachsender Haufen, kein einzelner Defekt.',
    href: HA_PATH.entities,
  },
  backup: {
    about:
      'Alter des neuesten Backups, das Home Assistant enthält. Eine Offsite-Kopie reicht; nur lokal bleibt gelb.',
    href: HA_PATH.backup,
  },
  storage: {
    about:
      'Freier Platz auf der HA-Datenpartition. SD/eMMC in Gigabyte, SSD in Prozent. Optional die gemeldete Laufwerk-Lebensdauer.',
    href: HA_PATH.storage,
  },
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
    return sd !== 0 ? sd : a.label.localeCompare(b.label, 'de');
  });
}

function decorateChecks(checks: HealthCheck[]): HealthCheck[] {
  return checks.map(c => {
    const meta = CHECK_META[c.key];
    return {
      ...c,
      about: c.about ?? meta.about,
      href: c.href ?? meta.href,
    };
  });
}

// ── Public API ────────────────────────────────────────────

/** Run all health checks against the current Home Assistant state. */
export async function getSystemHealth(): Promise<SystemHealth> {
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

  const involved = [
    ...new Set([
      ...unavailable,
      ...orphanIds,
      ...stale,
      ...lowBattery,
      ...radioQuiet,
      ...pendingUpdateIds,
      ...restoredIds,
    ]),
  ];
  const addonsPromise: Promise<ha.SupervisorAddon[] | null> = appConfig.isAddon
    ? ha.getSupervisorAddons().catch(err => {
        log.debug('Supervisor add-on list unavailable', { error: String(err) });
        return null;
      })
    : Promise.resolve(null);

  const [deviceInfo, backup, disk, snapshot, addons, recorder] = await Promise.all([
    involved.length > 0 ? ha.getEntityDeviceInfo(involved) : Promise.resolve([]),
    checkBackup(now, states),
    readDiskInfo(),
    ha.getRegistrySnapshot(),
    addonsPromise,
    ha.getRecorderInfo(),
  ]);

  const [brokenRefs, failedAutos, failedIntegrations, disabled] = await Promise.all([
    findBrokenReferences(states, snapshot),
    Promise.resolve(findFailedAutomations(states, snapshot)),
    Promise.resolve(findFailedIntegrations(snapshot)),
    Promise.resolve(findDisabledEntities(snapshot)),
  ]);

  const updates = checkPendingUpdates(pendingUpdateIds, deviceInfo);
  if (stackUpdateWaiting && updates.severity !== 'critical') {
    updates.severity = updates.count > 0 ? 'critical' : updates.severity;
    if (updates.count > 0) {
      updates.hint = 'Home Assistant Core, OS oder Supervisor wartet. Das zuerst, dann Geräte.';
    }
  }

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
    checkFailedIntegrations(failedIntegrations),
    checkRadioQuiet(radioQuiet, deviceInfo),
    ...(addons ? [checkStoppedAddons(findStoppedAddons(addons))] : []),
    checkRestored(restoredIds, deviceInfo),
    checkDisabled(disabled),
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
  health.checks = sortChecks(health.checks);
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
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  const tmp = `${SNAPSHOT_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf-8');
  await rename(tmp, SNAPSHOT_PATH);
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
