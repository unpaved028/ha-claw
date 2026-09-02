/**
 * backup-health.ts – Backup standing condition for System Health.
 *
 * Sources (either/or – one offsite copy is enough, nobody needs all of them):
 * 1. Official Backup integration (HA 2025.1+): websocket backup/info with agents
 *    (local, Home Assistant Cloud, Google Drive, OneDrive, Synology, WebDAV, NAS mounts)
 * 2. Supervisor GET /backups/info – local files and backup mounts
 * 3. sabeechen Google Drive Backup add-on sensors (copies often deleted locally)
 * 4. Samba Backup add-on sensor (NAS share, same local-delete pattern)
 */

import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import * as ha from './ha-client.js';
import type { HealthCheck, HealthItem, Severity } from './system-health.js';
import { HA_PATH } from './health-links.js';
import { backupCopy, healthCopy } from './health-copy.js';
import { dateLocale } from './strings.js';

const log = createLogger('health');

const MAX_EXAMPLES = 8;
const BACKUP_WARN_DAYS = 7;
const BACKUP_CRITICAL_DAYS = 14;
const LOCAL_PLACE = 'lokal';

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
}

interface UnifiedBackup {
  slug: string;
  name: string;
  date: string;
  type: string;
  size?: string | number;
  sizeBytes?: number;
  includesHa: boolean;
  places: string[];
}

interface DriveAddonStatus {
  lastBackup: string | null;
  lastUpload: string | null;
  inDrive: number;
  sizeDrive: string;
  sensorState: string;
  stale: boolean;
  backups: Array<{
    slug: string;
    name: string;
    date: string;
    state: string;
    size?: string | number;
  }>;
}

interface SambaAddonStatus {
  lastBackup: string | null;
  remote: number;
  local: number;
  failed: boolean;
}

interface OfficialBackupSensors {
  lastSuccess: string | null;
  lastAttempt: string | null;
  failed: boolean;
}

export function isBackupStatusEntity(entityId: string, attrs?: Record<string, unknown>): boolean {
  if (
    entityId === 'sensor.backup_state' ||
    entityId === 'sensor.snapshot_backup' ||
    entityId === 'binary_sensor.backups_stale' ||
    entityId === 'binary_sensor.snapshots_stale' ||
    entityId === 'sensor.samba_backup'
  ) {
    return true;
  }
  if (
    entityId.includes('last_successful_automatic_backup') ||
    entityId.includes('last_attempted_automatic_backup') ||
    entityId.includes('next_scheduled_automatic_backup') ||
    entityId.includes('backup_manager_state') ||
    entityId.includes('backup_automatic_backup')
  ) {
    return true;
  }
  return !!attrs && ('backups_in_google_drive' in attrs || 'snapshots_in_google_drive' in attrs);
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || iso === 'None' || iso === 'unknown' || iso === 'unavailable') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(now: Date, then: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

function isRecent(now: Date, iso: string | null | undefined): boolean {
  const d = parseIsoDate(iso);
  return !!d && daysSince(now, d) < BACKUP_CRITICAL_DAYS;
}

function newestDate(...isos: Array<string | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const iso of isos) {
    const d = parseIsoDate(iso);
    if (d && (!best || d.getTime() > best.getTime())) best = d;
  }
  return best;
}

function usableState(s: HAState | undefined): s is HAState {
  return !!s && s.state !== 'unavailable' && s.state !== 'unknown';
}

function attrString(attrs: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'None' || trimmed === 'unknown' || trimmed === 'unavailable') {
      continue;
    }
    return trimmed;
  }
  return '';
}

function attrNumber(attrs: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const n = Number(attrs[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function formatBackupAge(days: number): string {
  const c = backupCopy();
  if (days <= 0) return c.today;
  if (days === 1) return c.ageOne;
  return c.ageMany(days);
}

function formatBackupDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' });
}

function addPlace(places: string[], place: string): void {
  if (place && !places.includes(place)) places.push(place);
}

function isLocalAgent(agentId: string): boolean {
  return agentId === 'backup.local' || agentId === 'hassio.local';
}

/** Map official backup agent ids to a short German/product label. */
function agentPlaceLabel(agentId: string): string {
  if (isLocalAgent(agentId)) return LOCAL_PLACE;
  const dot = agentId.indexOf('.');
  const domain = dot === -1 ? agentId : agentId.slice(0, dot);
  const rest = dot === -1 ? '' : agentId.slice(dot + 1);
  switch (domain) {
    case 'cloud':
      return 'Home Assistant Cloud';
    case 'google_drive':
      return 'Google Drive';
    case 'onedrive':
      return 'OneDrive';
    case 'synology_dsm':
      return 'Synology';
    case 'webdav':
      return 'WebDAV';
    case 'hassio':
      return rest && rest !== 'local' ? rest : 'NAS';
    default:
      return rest || domain || agentId;
  }
}

function supervisorPlaceLabel(loc: string | null | undefined): string {
  if (loc == null || loc === '' || loc === '.local') return LOCAL_PLACE;
  if (loc === '.cloud_backup') return 'Home Assistant Cloud';
  return loc;
}

function backupIncludesHomeAssistant(backup: ha.SupervisorBackup): boolean {
  return backup.type === 'full' || backup.content?.homeassistant === true;
}

function backupKind(type: string, name: string): string {
  const c = backupCopy();
  const blob = `${type} ${name}`.toLowerCase();
  if (blob.includes('partial') || blob.includes('teil')) return c.partial;
  if (type === 'full' || blob.includes('full') || blob.includes('voll')) return c.full;
  return 'Backup';
}

function formatSizeSuffix(b: UnifiedBackup): string {
  if (b.sizeBytes != null && Number.isFinite(b.sizeBytes)) {
    const mb = b.sizeBytes / 1_048_576;
    if (mb >= 1024) {
      return ` · ${(mb / 1024).toLocaleString(dateLocale(), { maximumFractionDigits: 1 })} GB`;
    }
    return ` · ${mb.toLocaleString(dateLocale(), { maximumFractionDigits: 0 })} MB`;
  }
  if (b.size == null || b.size === '') return '';
  const text = String(b.size);
  return /[a-zA-Z]/.test(text) ? ` · ${text}` : ` · ${text} MB`;
}

function formatUnifiedLabel(b: UnifiedBackup): string {
  const c = backupCopy();
  const loc =
    b.places.length > 0
      ? b.places.map(p => (p === LOCAL_PLACE ? c.local : p)).join(' + ')
      : c.local;
  return `${formatBackupDate(b.date)} · ${backupKind(b.type, b.name)} · ${loc}${formatSizeSuffix(b)}`;
}

function parseDriveListedBackups(raw: unknown): DriveAddonStatus['backups'] {
  if (!Array.isArray(raw)) return [];
  const out: DriveAddonStatus['backups'] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const date = typeof rec.date === 'string' ? rec.date : '';
    if (!parseIsoDate(date)) continue;
    const state = typeof rec.state === 'string' ? rec.state : '';
    if (/pending/i.test(state)) continue;
    const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : 'Backup';
    const slug = typeof rec.slug === 'string' && rec.slug ? rec.slug : `${name}|${date}`;
    const size = rec.size;
    out.push({
      slug,
      name,
      date,
      state,
      size: typeof size === 'string' || typeof size === 'number' ? size : undefined,
    });
  }
  return out;
}

function findDriveStateSensor(states: HAState[]): HAState | undefined {
  const matches = states.filter(
    s =>
      s.entity_id === 'sensor.backup_state' ||
      s.entity_id === 'sensor.snapshot_backup' ||
      (s.entity_id.startsWith('sensor.') &&
        ('backups_in_google_drive' in s.attributes || 'snapshots_in_google_drive' in s.attributes)),
  );
  return (
    matches.find(usableState) ??
    matches.find(
      s =>
        attrNumber(s.attributes, 'backups_in_google_drive', 'snapshots_in_google_drive') > 0 ||
        !!attrString(s.attributes, 'last_backup', 'last_snapshot'),
    )
  );
}

function readDriveAddonStatus(states: HAState[]): DriveAddonStatus | null {
  const sensor = findDriveStateSensor(states);
  if (!sensor) return null;

  const attrs = sensor.attributes;
  const lastBackup = attrString(attrs, 'last_backup', 'last_snapshot') || null;
  const lastUpload = attrString(attrs, 'last_upload') || null;
  const inDrive = attrNumber(attrs, 'backups_in_google_drive', 'snapshots_in_google_drive');
  const backups = parseDriveListedBackups(attrs.backups ?? attrs.snapshots);
  if (sensor.state === 'waiting' && !lastBackup && inDrive === 0 && backups.length === 0) {
    return null;
  }

  const staleEntity = states.find(
    s =>
      s.entity_id === 'binary_sensor.backups_stale' ||
      s.entity_id === 'binary_sensor.snapshots_stale',
  );

  return {
    lastBackup: parseIsoDate(lastBackup) ? lastBackup : null,
    lastUpload: parseIsoDate(lastUpload) ? lastUpload : null,
    inDrive,
    sizeDrive: attrString(attrs, 'size_in_google_drive'),
    sensorState: sensor.state,
    stale: usableState(staleEntity) && staleEntity.state === 'on',
    backups,
  };
}

function readSambaAddonStatus(states: HAState[]): SambaAddonStatus | null {
  const sensor =
    states.find(s => s.entity_id === 'sensor.samba_backup') ??
    states.find(
      s =>
        s.entity_id.startsWith('sensor.') &&
        ('backups remote' in s.attributes || 'backups_remote' in s.attributes) &&
        ('last backup' in s.attributes || 'last_backup' in s.attributes),
    );
  if (!sensor) return null;
  const lastBackup = attrString(sensor.attributes, 'last backup', 'last_backup') || null;
  const remote = attrNumber(sensor.attributes, 'backups remote', 'backups_remote');
  const local = attrNumber(sensor.attributes, 'backups local', 'backups_local');
  if (sensor.state === 'unavailable' && !lastBackup && remote === 0) return null;
  return {
    lastBackup: parseIsoDate(lastBackup) ? lastBackup : null,
    remote,
    local,
    failed: usableState(sensor) && sensor.state.toUpperCase() === 'FAILED',
  };
}

function findSensorBySuffix(states: HAState[], suffix: string): HAState | undefined {
  return (
    states.find(s => s.entity_id.endsWith(suffix) && usableState(s)) ??
    states.find(s => s.entity_id.endsWith(suffix))
  );
}

function readOfficialBackupSensors(states: HAState[]): OfficialBackupSensors {
  const success = findSensorBySuffix(states, 'last_successful_automatic_backup');
  const attempt = findSensorBySuffix(states, 'last_attempted_automatic_backup');
  const lastSuccess = success ? (parseIsoDate(success.state)?.toISOString() ?? null) : null;
  const lastAttempt = attempt ? (parseIsoDate(attempt.state)?.toISOString() ?? null) : null;
  const successDate = parseIsoDate(lastSuccess);
  const attemptDate = parseIsoDate(lastAttempt);
  const failed = !!(
    attemptDate &&
    (!successDate || attemptDate.getTime() - successDate.getTime() > 60_000)
  );
  return { lastSuccess, lastAttempt, failed };
}

function upsert(map: Map<string, UnifiedBackup>, next: UnifiedBackup): void {
  const existing = map.get(next.slug);
  if (!existing) {
    map.set(next.slug, next);
    return;
  }
  for (const p of next.places) addPlace(existing.places, p);
  existing.includesHa = existing.includesHa || next.includesHa;
  if (parseIsoDate(next.date) && next.date.localeCompare(existing.date) > 0) {
    existing.date = next.date;
    existing.name = next.name || existing.name;
  }
  if (existing.size == null && next.size != null) existing.size = next.size;
  if (existing.sizeBytes == null && next.sizeBytes != null) existing.sizeBytes = next.sizeBytes;
}

function mergeBackupLists(
  supervisor: ha.SupervisorBackup[],
  core: ha.CoreBackupInfo | null,
  drive: DriveAddonStatus | null,
): UnifiedBackup[] {
  const map = new Map<string, UnifiedBackup>();

  for (const b of supervisor) {
    const locs = b.locations ?? [b.location];
    const places: string[] = [];
    for (const loc of locs) addPlace(places, supervisorPlaceLabel(loc));
    if (places.length === 0) places.push(LOCAL_PLACE);
    upsert(map, {
      slug: b.slug,
      name: b.name || 'Backup',
      date: b.date,
      type: b.type,
      size: b.size,
      includesHa: backupIncludesHomeAssistant(b),
      places,
    });
  }

  if (core) {
    for (const b of core.backups) {
      const places: string[] = [];
      let sizeBytes: number | undefined;
      for (const [agentId, copy] of Object.entries(b.agents ?? {})) {
        addPlace(places, agentPlaceLabel(agentId));
        if (sizeBytes == null && copy?.size != null && Number.isFinite(copy.size)) {
          sizeBytes = copy.size;
        }
      }
      if (places.length === 0) places.push(LOCAL_PLACE);
      upsert(map, {
        slug: b.backup_id,
        name: b.name || 'Backup',
        date: b.date,
        type: b.homeassistant_included === false ? 'partial' : 'full',
        sizeBytes,
        includesHa: b.homeassistant_included !== false,
        places,
      });
    }
  }

  if (drive) {
    for (const b of drive.backups) {
      const places: string[] = [];
      const onDrive = /drive/i.test(b.state) || /^backed up$/i.test(b.state) || !b.state;
      const onHa = /ha only/i.test(b.state) || /backed up/i.test(b.state);
      if (onHa && !/drive only/i.test(b.state)) addPlace(places, LOCAL_PLACE);
      if (onDrive) addPlace(places, 'Google Drive');
      if (places.length === 0) addPlace(places, 'Google Drive');
      upsert(map, {
        slug: b.slug,
        name: b.name,
        date: b.date,
        type: 'full',
        size: b.size,
        includesHa: true,
        places,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function offsitePlacesOf(b: UnifiedBackup): string[] {
  return b.places.filter(p => p !== LOCAL_PLACE);
}

function backupCheck(partial: Omit<HealthCheck, 'key' | 'label' | 'entities'>): HealthCheck {
  return {
    key: 'backup',
    label: healthCopy().backup.label,
    entities: partial.items.map(i => i.label),
    ...partial,
  };
}

function genericHint(): string {
  return backupCopy().genericHint;
}

function backupHint(opts: {
  driveStale: boolean;
  sambaFailed: boolean;
  officialFailed: boolean;
}): string {
  const c = backupCopy();
  if (opts.driveStale) return c.hintDrive;
  if (opts.sambaFailed) return c.hintSamba;
  if (opts.officialFailed) return c.hintOfficial;
  return c.genericHint;
}

/**
 * Age is measured against the newest backup that contains Home Assistant.
 * Offsite is satisfied by any one remote copy – Cloud, Drive, OneDrive, NAS,
 * Samba share, or the Google Drive Backup add-on. Missing alternatives are
 * not reported.
 */
export async function checkBackup(now: Date, states: HAState[]): Promise<HealthCheck> {
  if (!appConfig.isAddon) {
    return backupCheck({
      severity: 'ok',
      count: 0,
      short: 'n/a',
      detail: backupCopy().standalone,
      items: [],
      hint: genericHint(),
    });
  }

  const drive = readDriveAddonStatus(states);
  const samba = readSambaAddonStatus(states);
  const official = readOfficialBackupSensors(states);

  const [coreOutcome, superOutcome] = await Promise.allSettled([
    ha.getCoreBackupInfo(),
    ha.getBackupInfo(),
  ]);

  const core = coreOutcome.status === 'fulfilled' ? coreOutcome.value : null;
  const info = superOutcome.status === 'fulfilled' ? superOutcome.value : null;
  if (coreOutcome.status === 'rejected') {
    log.debug('Core backup/info unavailable', { error: String(coreOutcome.reason) });
  }
  if (superOutcome.status === 'rejected') {
    log.warn('Backup list unavailable', { error: String(superOutcome.reason) });
  }

  const hasAddonSignal =
    (drive != null && (drive.inDrive > 0 || !!drive.lastBackup || !!drive.lastUpload)) ||
    (samba != null && (samba.remote > 0 || !!samba.lastBackup));
  const hasOfficialSignal = !!official.lastSuccess || !!core?.last_completed_automatic_backup;

  const usesDriveAddon = !!(
    drive &&
    (isRecent(now, drive.lastBackup) ||
      isRecent(now, drive.lastUpload) ||
      (drive.inDrive > 0 && drive.sensorState === 'backed_up' && !drive.stale))
  );
  const usesSamba = !!(
    samba &&
    (isRecent(now, samba.lastBackup) || (samba.remote > 0 && !samba.failed))
  );
  const usesOfficial =
    (core?.backups.length ?? 0) > 0 ||
    isRecent(now, official.lastSuccess) ||
    isRecent(now, official.lastAttempt) ||
    isRecent(now, core?.last_completed_automatic_backup);
  const driveStale = usesDriveAddon && !!drive?.stale;
  const sambaFailed = usesSamba && !!samba?.failed;
  const officialFailed = usesOfficial && official.failed;

  if (!core && !info && !hasAddonSignal && !hasOfficialSignal) {
    const err =
      superOutcome.status === 'rejected' ? String(superOutcome.reason) : backupCopy().unknown;
    return backupCheck({
      severity: 'warn',
      count: 0,
      short: backupCopy().unreadShort,
      detail: backupCopy().unreadDetail(err),
      items: [],
      hint: genericHint(),
    });
  }

  const supervisorBackups = [...(info?.backups ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const unified = mergeBackupLists(supervisorBackups, core, drive);
  const hint = backupHint({ driveStale, sambaFailed, officialFailed });

  const items: HealthItem[] = unified.slice(0, MAX_EXAMPLES).map(b => ({
    id: b.slug,
    label: `${b.name} – ${formatUnifiedLabel(b)}`,
    entities: [],
    href: HA_PATH.backup,
  }));

  if (items.length === 0 && drive && (drive.inDrive > 0 || drive.lastBackup || drive.lastUpload)) {
    const c = backupCopy();
    const when = drive.lastBackup ?? drive.lastUpload ?? '';
    const countLabel = drive.inDrive === 1 ? c.oneBackup : c.nBackups(drive.inDrive);
    items.push({
      id: 'google-drive',
      label: c.driveLabel(
        when ? formatBackupDate(when) : c.present,
        countLabel,
        drive.sizeDrive ?? '',
      ),
      entities: [],
      href: HA_PATH.backup,
    });
  }
  if (items.length === 0 && samba && (samba.remote > 0 || samba.lastBackup)) {
    const c = backupCopy();
    const countLabel = samba.remote === 1 ? c.oneBackup : c.nBackups(samba.remote);
    items.push({
      id: 'samba',
      label: c.sambaLabel(
        samba.lastBackup ? formatBackupDate(samba.lastBackup) : c.present,
        countLabel,
      ),
      entities: [],
      href: HA_PATH.backup,
    });
  }

  const withHa = unified.filter(b => b.includesHa);
  const latestHaListed = withHa[0];
  const latestListed = unified[0];
  const latestHaDate = newestDate(
    ...withHa.map(b => b.date),
    drive?.lastBackup,
    drive?.inDrive || drive?.lastUpload ? drive?.lastUpload : null,
    samba?.lastBackup,
    official.lastSuccess,
    core?.last_completed_automatic_backup,
  );

  const places = new Set<string>();
  for (const b of unified) {
    for (const p of offsitePlacesOf(b)) places.add(p);
  }
  if (drive && (drive.inDrive > 0 || drive.lastUpload)) places.add('Google Drive');
  if (samba && samba.remote > 0) places.add('Samba-Share');
  const offsite = places.size > 0;

  if (!latestHaDate) {
    if (unified.length === 0 && !hasAddonSignal && !hasOfficialSignal) {
      return backupCheck({
        severity: 'critical',
        count: 0,
        short: backupCopy().noneShort,
        detail: backupCopy().noneDetail,
        items: [],
        hint,
      });
    }
    const latest = latestListed;
    const latestAge = latest ? daysSince(now, parseIsoDate(latest.date) ?? now) : 0;
    const c = backupCopy();
    return backupCheck({
      severity: 'critical',
      count: latestAge,
      short: c.noHaShort,
      detail: latest
        ? c.noHaDetail(latest.name, formatBackupAge(latestAge), unified.length)
        : c.noHaNone,
      items,
      hint,
    });
  }

  const ageDays = daysSince(now, latestHaDate);
  const latestHaName = latestHaListed?.name ?? (places.size > 0 ? [...places][0]! : 'Backup');

  let severity: Severity = 'ok';
  if (ageDays >= BACKUP_CRITICAL_DAYS) severity = 'critical';
  else if (ageDays >= BACKUP_WARN_DAYS) severity = 'warn';
  if (info?.days_until_stale && ageDays >= info.days_until_stale && severity === 'ok') {
    severity = 'warn';
  }
  if (!offsite && severity === 'ok') severity = 'warn';
  if (driveStale && severity === 'ok') severity = 'warn';
  if (sambaFailed && severity === 'ok') severity = 'warn';
  if (officialFailed && severity === 'ok') severity = 'warn';

  const c = backupCopy();
  const parts = [c.lastWithHa(formatBackupAge(ageDays), latestHaName)];
  if (latestListed && latestHaListed && latestListed.slug !== latestHaListed.slug) {
    parts.push(c.newestPartial(latestListed.name));
  }
  const total = Math.max(
    unified.length,
    drive?.inDrive ?? 0,
    samba?.remote ?? 0,
    supervisorBackups.length,
    core?.backups.length ?? 0,
  );
  parts.push(c.total(total));
  if (offsite) {
    parts.push(c.offsite([...places].join(', ')));
  } else {
    parts.push(c.localOnly);
  }
  if (driveStale) parts.push(c.driveStale);
  else if (usesDriveAddon && drive?.sensorState === 'error') {
    parts.push(c.driveError);
  }
  if (sambaFailed) parts.push(c.sambaFailed);
  if (officialFailed) parts.push(c.officialFailed);

  return backupCheck({
    severity,
    count: ageDays,
    short: formatBackupAge(ageDays),
    detail: parts.join(' '),
    items,
    hint,
  });
}
