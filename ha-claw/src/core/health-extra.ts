/**
 * health-extra.ts – Extra standing-condition finders for system health.
 *
 * Energy metadata, stuck updates and integration outage clusters. Pure over
 * fixtures so the cards can be table-tested without Home Assistant.
 * Thresholds live here; system-health.ts turns the results into cards.
 */

import type { HealthItem, Severity } from './system-health.js';
import { HA_PATH } from './health-links.js';

export const ENERGY_META_WARN = 3;
export const ENERGY_META_CRITICAL = 12;
export const STUCK_UPDATE_DAYS = 14;
export const OUTAGE_CLUSTER_MIN_DEVICES = 4;
export const OUTAGE_CLUSTER_CRITICAL_COUNT = 3;
export const OUTAGE_CLUSTER_SIZE_CRITICAL = 10;

export interface ExtraState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
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

function deviceClass(s: ExtraState): string {
  return String(s.attributes['device_class'] ?? '').toLowerCase();
}

function unitOf(s: ExtraState): string {
  return String(s.attributes['unit_of_measurement'] ?? '').toLowerCase();
}

function stateClassOf(s: ExtraState): string {
  return String(s.attributes['state_class'] ?? '')
    .trim()
    .toLowerCase();
}

/** Looks like power or energy (device_class or unit). Does not look at state_class. */
export function looksLikeEnergyOrPower(s: ExtraState): boolean {
  if (!s.entity_id.startsWith('sensor.')) return false;
  const dc = deviceClass(s);
  const u = unitOf(s);
  if (dc === 'power' || u === 'w' || u === 'kw') return true;
  if (dc === 'energy' || u === 'kwh' || u === 'wh') return true;
  return false;
}

/**
 * Power/energy sensors the Energy dashboard silently ignores: they look like
 * energy but have no `state_class`. Unavailable / unknown / empty are skipped.
 */
export function findEnergyMetaEntityIds(states: ExtraState[]): string[] {
  return states
    .filter(s => {
      if (s.state === 'unavailable' || s.state === 'unknown' || s.state === '') return false;
      if (!looksLikeEnergyOrPower(s)) return false;
      return stateClassOf(s) === '';
    })
    .map(s => s.entity_id);
}

export function isHaStackUpdate(s: ExtraState): boolean {
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

function hoursSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

export interface StuckUpdates {
  entityIds: string[];
  stackStuck: boolean;
}

/**
 * `update.*` that has been `on` for at least STUCK_UPDATE_DAYS.
 * Distinct from pending_updates (any `on`).
 */
export function findStuckUpdates(states: ExtraState[], now: Date): StuckUpdates {
  const minHours = STUCK_UPDATE_DAYS * 24;
  const entityIds: string[] = [];
  let stackStuck = false;
  for (const s of states) {
    if (!s.entity_id.startsWith('update.') || s.state !== 'on') continue;
    const age = hoursSince(s.last_changed, now);
    if (age == null || age < minHours) continue;
    entityIds.push(s.entity_id);
    if (isHaStackUpdate(s)) stackStuck = true;
  }
  return { entityIds, stackStuck };
}

export interface OutageRegistry {
  entities: Array<{
    entity_id: string;
    device_id: string | null;
    config_entry_id?: string | null;
  }>;
  devices: Array<{
    id: string;
    name: string | null;
    name_by_user: string | null;
    config_entries?: string[];
  }>;
  entries: Array<{ entry_id: string; domain: string; title: string }>;
}

export interface OutageClusterResult {
  items: HealthItem[];
  maxClusterSize: number;
  /** Devices in a cluster that were not unavailable on the previous hourly sample. */
  recoveredDeviceCount: number;
}

function historyDeviceId(entityId: string): string {
  return `stem:${entityDeviceStem(entityId)}`;
}

/**
 * Unavailable devices grouped by config entry. A cluster is ≥ 4 devices on
 * the same integration. Empty registry → no clusters (nothing to group by).
 */
export function findOutageClusters(
  unavailableEntityIds: string[],
  snapshot: OutageRegistry,
  /** `null` / omitted = no hourly sample yet (do not claim devices just dropped). */
  previousUnavailableIds?: string[] | null,
): OutageClusterResult {
  if (unavailableEntityIds.length === 0 || snapshot.entities.length === 0) {
    return { items: [], maxClusterSize: 0, recoveredDeviceCount: 0 };
  }

  const entityById = new Map(snapshot.entities.map(e => [e.entity_id, e]));
  const deviceById = new Map(snapshot.devices.map(d => [d.id, d]));
  const entryById = new Map(snapshot.entries.map(e => [e.entry_id, e]));

  type DeviceRow = { historyId: string; label: string };
  const byEntry = new Map<string, Map<string, DeviceRow>>();

  for (const entityId of unavailableEntityIds) {
    const ent = entityById.get(entityId);
    const device = ent?.device_id ? deviceById.get(ent.device_id) : undefined;
    const entryId =
      (ent?.config_entry_id && ent.config_entry_id.trim()) || device?.config_entries?.[0] || '';
    if (!entryId) continue;

    const deviceKey = ent?.device_id
      ? `dev:${ent.device_id}`
      : `stem:${entityDeviceStem(entityId)}`;
    const label =
      device?.name_by_user?.trim() ||
      device?.name?.trim() ||
      entityDeviceStem(entityId).replace(/_/g, ' ');
    const historyId = historyDeviceId(entityId);
    const devices = byEntry.get(entryId) ?? new Map<string, DeviceRow>();
    if (!devices.has(deviceKey)) devices.set(deviceKey, { historyId, label });
    byEntry.set(entryId, devices);
  }

  const havePrev = previousUnavailableIds != null;
  const prev = new Set(previousUnavailableIds ?? []);
  const items: HealthItem[] = [];
  let maxClusterSize = 0;
  let recoveredDeviceCount = 0;

  for (const [entryId, devices] of byEntry) {
    if (devices.size < OUTAGE_CLUSTER_MIN_DEVICES) continue;
    const rows = [...devices.values()];
    maxClusterSize = Math.max(maxClusterSize, rows.length);
    if (havePrev) {
      for (const row of rows) {
        if (!prev.has(row.historyId)) recoveredDeviceCount += 1;
      }
    }
    const entry = entryById.get(entryId);
    const domain = entry?.domain || 'unknown';
    const names = rows.map(r => r.label).sort((a, b) => a.localeCompare(b, 'de'));
    items.push({
      id: `entry:${entryId}`,
      label: entry?.title || domain,
      entities: names,
      href: HA_PATH.integration(domain),
    });
  }

  items.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return { items, maxClusterSize, recoveredDeviceCount };
}

export function outageClusterSeverity(clusterCount: number, maxClusterSize: number): Severity {
  if (clusterCount <= 0) return 'ok';
  if (
    clusterCount >= OUTAGE_CLUSTER_CRITICAL_COUNT ||
    maxClusterSize >= OUTAGE_CLUSTER_SIZE_CRITICAL
  ) {
    return 'critical';
  }
  return 'warn';
}

export interface RepairIssue {
  domain: string;
  issue_id: string;
  severity: string;
}

function asIssue(raw: unknown): RepairIssue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o['dismissed_version'] != null && o['dismissed_version'] !== '') return null;
  const domain = typeof o['domain'] === 'string' ? o['domain'] : '';
  const issueId = typeof o['issue_id'] === 'string' ? o['issue_id'] : '';
  if (!domain && !issueId) return null;
  const severity = typeof o['severity'] === 'string' ? o['severity'] : '';
  return { domain, issue_id: issueId, severity };
}

/** `repairs/list_issues` is `{ issues: [...] }` on current HA; a bare list is accepted. */
export function parseRepairIssues(raw: unknown): RepairIssue[] {
  if (raw == null) return [];
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'object') {
    const inner = (raw as { issues?: unknown }).issues;
    if (Array.isArray(inner)) list = inner;
  }
  const out: RepairIssue[] = [];
  for (const row of list) {
    const issue = asIssue(row);
    if (issue) out.push(issue);
  }
  return out;
}

export function formatRepairNote(
  issues: RepairIssue[],
  failedDomains: Set<string>,
  copy: { repairsOpen: (n: number, list: string) => string; repairsSame: string },
): string | undefined {
  if (issues.length === 0) return undefined;
  const domains = [...new Set(issues.map(i => i.domain).filter(Boolean))];
  const shown = domains.slice(0, 4).join(', ');
  const list = domains.length > 4 ? `${shown}, …` : shown;
  const line = copy.repairsOpen(issues.length, list);
  const allKnown = domains.length > 0 && domains.every(d => failedDomains.has(d));
  if (allKnown && failedDomains.size > 0) return `${line} ${copy.repairsSame}`;
  return line;
}
