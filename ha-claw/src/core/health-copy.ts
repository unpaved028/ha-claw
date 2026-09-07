/**
 * health-copy.ts – User-facing System Health / backup strings.
 */

import { getLanguage, type UiLang } from './locale.js';
import { dateLocale } from './strings.js';

export interface CheckCopy {
  label: string;
  ok: string;
  hint: string;
  about: string;
}

export interface HealthCopy {
  unavailable: CheckCopy;
  stale_sensors: CheckCopy;
  low_battery: CheckCopy;
  orphans: CheckCopy;
  broken_refs: CheckCopy;
  failed_automations: CheckCopy;
  stopped_addons: CheckCopy;
  restored: CheckCopy;
  pending_updates: CheckCopy;
  stuck_updates: CheckCopy;
  failed_integrations: CheckCopy;
  outage_cluster: CheckCopy;
  energy_meta: CheckCopy;
  radio_quiet: CheckCopy;
  stuckStackHint: string;
  outageRecovered: (n: number) => string;
  repairsOpen: (n: number, list: string) => string;
  repairsSame: string;
  storage: { label: string; about: string };
  recorder: { label: string; about: string };
  backup: { label: string; about: string };
  storageWarnFlash: (warnGb: number, critGb: number) => string;
  storageWarnSsd: string;
  storageFree: (free: string, total: string, pct: string, kind: string) => string;
  storageThresholds: (threshold: string) => string;
  storageLife: (pct: number) => string;
  storageHintFlash: string;
  storageHintSsd: string;
  storageHintLife: string;
  storageHintOk: (threshold: string, kind: string) => string;
  recorderDead: string;
  recorderOk: string;
  recorderMigration: string;
  recorderBacklog: (n: number) => string;
  recorderHintDead: string;
  recorderHintOk: string;
  recorderShortOff: string;
  recorderShortOk: string;
}

function de(): HealthCopy {
  return {
    unavailable: {
      label: 'Geräte nicht erreichbar',
      ok: 'Alle Geräte antworten.',
      hint: 'Ein Gerät erscheint einmal, auch wenn es viele Entities mitbringt (Batterie, Firmware, Identifizieren, …). Strom, Funk und Integration prüfen. Geräte, die es nicht mehr gibt – inklusive Altlasten vom Neu-Anlernen – aus Home Assistant entfernen.',
      about:
        'Geräte, die seit weniger als 30 Tagen auf unavailable stehen. Ein physisches Gerät zählt einmal, auch mit vielen Entities.',
    },
    stale_sensors: {
      label: 'Sensoren seit {hours}h ohne Meldung',
      ok: 'Die Sensoren, die sich regelmässig melden sollten, tun das.',
      hint: 'Nur Temperatur, Luftfeuchte, Luftdruck und Luftqualität. Ein Fenster das tagelang zu bleibt, ist kein Defekt. Batterie und Integration prüfen, oder das Gerät aus Home Assistant entfernen.',
      about:
        'Nur Periodicsensoren (Temperatur, Luftfeuchte, Luftdruck, Luftqualität), die sich 48 Stunden nicht gemeldet haben. Ein geschlossenes Fenster ist kein Defekt.',
    },
    low_battery: {
      label: 'Batterie unter {pct}%',
      ok: 'Keine schwachen Batterien.',
      hint: 'Batterien zeitnah wechseln.',
      about: 'Geräte, deren Batterie unter 20 % gemeldet wird.',
    },
    orphans: {
      label: 'Seit {days} Tagen nicht erreichbar',
      ok: 'Keine Altlasten – nichts hängt seit Wochen auf unavailable.',
      hint: 'Das Gerät gibt es vermutlich nicht mehr. In Home Assistant entfernen, sonst bleibt es für immer in der Liste der Unerreichbaren.',
      about:
        'Geräte, die seit 30 Tagen oder länger unavailable sind. Meist Hardware, die es nicht mehr gibt.',
    },
    broken_refs: {
      label: 'Kaputte Referenzen',
      ok: 'Automationen, Skripte und Szenen zeigen auf Entities, die es noch gibt.',
      hint: 'Entity umbenannt oder gelöscht. Die Automation, das Skript oder die Szene auf die neue ID umstellen, oder den Eintrag entfernen.',
      about:
        'Automationen, Skripte und Szenen, die eine Entity oder ein Gerät nennen, das Home Assistant nicht mehr kennt. Klassiker nach dem Umbenennen.',
    },
    failed_automations: {
      label: 'Automationen und Skripte mit Fehler',
      ok: 'Kein Automation- oder Skript-Trace mit Fehler.',
      hint: 'Letzten Trace öffnen. Meist eine kaputte Bedingung oder eine Entity, die es nicht mehr gibt.',
      about:
        'Automationen und Skripte, deren letzter Trace einen Fehler hat, oder die selbst unavailable sind.',
    },
    stopped_addons: {
      label: 'Add-ons laufen nicht',
      ok: 'Alle Add-ons mit Autostart laufen.',
      hint: 'Add-on starten oder die Logs prüfen. Gestoppte Add-ons mit manuellem Boot werden nicht gezählt.',
      about:
        'Add-ons mit Autostart, die nicht laufen, oder im Fehlerzustand. Manuell gestoppte zählen nicht.',
    },
    restored: {
      label: 'Nur wiederhergestellt',
      ok: 'Keine Entities, die nur aus einem Restore stammen und seit dem Start nicht gesehen wurden.',
      hint: 'Nach einem Restore oder einem neuen Datenträger: Integration neu laden oder die Entity entfernen, wenn das Gerät nicht mehr existiert.',
      about:
        'Entities mit restored=true — nach einem Restore gesehen, seit diesem Start aber nie wieder. Weder unavailable noch 30-Tage-Waise.',
    },
    pending_updates: {
      label: 'Updates liegen bereit',
      ok: 'Keine ausstehenden Updates.',
      hint: 'Core, OS und Add-ons zuerst. Firmware an Geräten, die du noch benutzt.',
      about: 'update.*-Entities mit verfügbarem Update. Core, OS und Supervisor zählen kritisch.',
    },
    stuck_updates: {
      label: 'Updates seit {days} Tagen offen',
      ok: 'Kein Update hängt seit zwei Wochen auf „verfügbar“.',
      hint: 'Wenn das Update nicht gewollt ist, ablehnen oder das Gerät prüfen. Sonst einspielen — offen gelassene Updates bleiben sonst für immer gelb.',
      about:
        'update.*-Entities, die seit 14 Tagen oder länger auf on stehen. Nicht dasselbe wie „Updates liegen bereit“ — hier nur die, die niemand anfasst.',
    },
    failed_integrations: {
      label: 'Integrationen laden nicht',
      ok: 'Alle Integrationen sind geladen.',
      hint: 'Unter Einstellungen → Geräte & Dienste die Integration neu laden oder die Anmeldung prüfen. Home Assistant Repairs zeigt oft denselben Fehler einzeln.',
      about:
        'Config Entries im Setup-Fehler oder Retry. Offene Home Assistant Repairs stehen als Fussnote, keine zweite Karte.',
    },
    outage_cluster: {
      label: 'Ausfälle einer Integration',
      ok: 'Keine Integration hat mehrere Geräte gleichzeitig verloren.',
      hint: 'Wenn viele Geräte derselben Integration weg sind, zuerst die Integration neu laden — nicht jedes Gerät einzeln. Strom am Hub / Stick prüfen.',
      about:
        'Unerreichbare Geräte, gruppiert nach Config Entry. Ein Cluster sind mindestens 4 Geräte derselben Integration. Zählt Cluster, nicht einzelne Geräte.',
    },
    energy_meta: {
      label: 'Energiesensoren ohne state_class',
      ok: 'Jeder Leistungs- und Energiesensor hat eine state_class.',
      hint: 'In den Entity-Einstellungen state_class setzen (measurement bei W, total_increasing bei kWh). Sonst ignoriert das Energy-Dashboard den Sensor still.',
      about:
        'Sensoren mit Einheit W/kWh oder device_class power/energy, aber ohne state_class. Das Energy-Dashboard nimmt sie dann nicht auf — ohne Fehlermeldung.',
    },
    stuckStackHint:
      'Home Assistant Core, OS oder Supervisor wartet seit 14 Tagen. Das zuerst, dann Geräte.',
    outageRecovered: n =>
      n === 1
        ? '1 Gerät war in der letzten stündlichen Prüfung noch erreichbar.'
        : `${n} dieser Geräte waren in der letzten stündlichen Prüfung noch erreichbar.`,
    repairsOpen: (n, list) => {
      const where = list ? ` (${list})` : '';
      return n === 1
        ? `Home Assistant Repairs: 1 offener Hinweis${where}.`
        : `Home Assistant Repairs: ${n} offene Hinweise${where}.`;
    },
    repairsSame: 'Dieselben Integrationen wie auf dieser Karte, einzeln aufgelistet.',
    radio_quiet: {
      label: 'Funk wird leise',
      ok: 'Keine Zigbee-Geräte mit altem last_seen oder sehr schwachem LQI.',
      hint: 'Nur last_seen / Linkquality. Gerät näher an einen Router, Batterie prüfen, oder Mesh aufräumen. Nicht dasselbe wie „unerreichbar“.',
      about:
        'Zigbee last_seen älter als 48 Stunden oder Linkqualität 20 oder weniger. Schon unavailable zählt hier nicht nochmal.',
    },
    storage: {
      label: 'Speicherplatz',
      about:
        'Freier Platz auf der HA-Datenpartition. SD/eMMC in Gigabyte, SSD in Prozent. Optional die gemeldete Laufwerk-Lebensdauer.',
    },
    recorder: {
      label: 'Recorder / Historie',
      about:
        'Ob der Recorder Historie schreibt und wie groß der Rückstau ist. Unabhängig vom freien Speicherplatz.',
    },
    backup: {
      label: 'Backup',
      about:
        'Alter des neuesten Backups, das Home Assistant enthält. Eine Offsite-Kopie reicht; nur lokal bleibt gelb.',
    },
    storageWarnFlash: (warnGb, critGb) => `Warnung unter ${warnGb} GB, kritisch unter ${critGb} GB`,
    storageWarnSsd: 'Warnung unter 10 % frei, kritisch unter 5 %',
    storageFree: (free, total, pct, kind) => `${free} von ${total} frei (${pct} %, ${kind}).`,
    storageThresholds: threshold => `Schwellen: ${threshold}.`,
    storageLife: pct => `Geschaetzte Laufwerk-Lebensdauer zu ${pct} % verbraucht.`,
    storageHintFlash:
      'Backups, Recorder-DB und Updates brauchen Luft. Alte Backups loeschen, History bereinigen, oder groessere Karte.',
    storageHintSsd: 'Recorder-Historie kuerzen, alte Backups entfernen, oder Speicher erweitern.',
    storageHintLife:
      'Das Laufwerk naehert sich dem Ende seiner Schreibzyklen. Austausch einplanen.',
    storageHintOk: (threshold, kind) => `${threshold} (${kind}).`,
    recorderDead: 'Der Recorder schreibt gerade nicht.',
    recorderOk: 'Der Recorder läuft.',
    recorderMigration: 'Eine Migration ist offen.',
    recorderBacklog: n => `Rückstau: ${n}.`,
    recorderHintDead:
      'Einstellungen → System → Protokolle und die Recorder-Integration prüfen. Oft eine volle oder gesperrte Datenbank.',
    recorderHintOk:
      'Historie unter Entwicklerwerkzeuge → Statistik. Rückstau baut sich nach einem Neustart oft von selbst ab.',
    recorderShortOff: 'aus',
    recorderShortOk: 'ok',
  };
}

function en(): HealthCopy {
  return {
    unavailable: {
      label: 'Devices unreachable',
      ok: 'All devices respond.',
      hint: 'A device appears once even if it brings many entities (battery, firmware, identify, …). Check power, radio and the integration. Remove devices that no longer exist — including leftovers from re-pairing — from Home Assistant.',
      about:
        'Devices that have been unavailable for less than 30 days. One physical device counts once, even with many entities.',
    },
    stale_sensors: {
      label: 'Sensors silent for {hours}h',
      ok: 'Sensors that should report regularly are doing so.',
      hint: 'Temperature, humidity, pressure and air quality only. A window that stays closed for days is not a fault. Check battery and integration, or remove the device from Home Assistant.',
      about:
        'Periodic sensors only (temperature, humidity, pressure, air quality) that have not reported for 48 hours. A closed window is not a fault.',
    },
    low_battery: {
      label: 'Battery under {pct}%',
      ok: 'No weak batteries.',
      hint: 'Replace batteries soon.',
      about: 'Devices whose battery is reported under 20 %.',
    },
    orphans: {
      label: 'Unreachable for {days} days',
      ok: 'No leftovers — nothing has been unavailable for weeks.',
      hint: 'The device probably no longer exists. Remove it in Home Assistant or it stays on the unreachable list forever.',
      about: 'Devices unavailable for 30 days or more. Usually hardware that is gone.',
    },
    broken_refs: {
      label: 'Broken references',
      ok: 'Automations, scripts and scenes point at entities that still exist.',
      hint: 'Entity renamed or deleted. Point the automation, script or scene at the new ID, or remove the entry.',
      about:
        'Automations, scripts and scenes that name an entity or device Home Assistant no longer knows. Classic after a rename.',
    },
    failed_automations: {
      label: 'Automations and scripts with errors',
      ok: 'No automation or script trace with an error.',
      hint: 'Open the last trace. Usually a broken condition or an entity that no longer exists.',
      about:
        'Automations and scripts whose last trace has an error, or that are themselves unavailable.',
    },
    stopped_addons: {
      label: 'Add-ons not running',
      ok: 'All add-ons with autostart are running.',
      hint: 'Start the add-on or check its logs. Add-ons stopped with manual boot are not counted.',
      about:
        'Add-ons with autostart that are not running, or in an error state. Manually stopped ones do not count.',
    },
    restored: {
      label: 'Restore-only',
      ok: 'No entities that only come from a restore and have not been seen since startup.',
      hint: 'After a restore or a new disk: reload the integration or remove the entity if the device is gone.',
      about:
        'Entities with restored=true — seen after a restore, never again since this start. Neither unavailable nor a 30-day orphan.',
    },
    pending_updates: {
      label: 'Updates waiting',
      ok: 'No pending updates.',
      hint: 'Core, OS and add-ons first. Firmware on devices you still use.',
      about:
        'update.* entities with an available update. Core, OS and Supervisor count as critical.',
    },
    stuck_updates: {
      label: 'Updates open for {days} days',
      ok: 'No update has sat on “available” for two weeks.',
      hint: 'If the update is unwanted, skip it or check the device. Otherwise install it — leftover updates stay yellow forever.',
      about:
        'update.* entities that have been on for 14 days or more. Not the same as “Updates waiting” — only the ones nobody is touching.',
    },
    failed_integrations: {
      label: 'Integrations not loading',
      ok: 'All integrations are loaded.',
      hint: 'Under Settings → Devices & services reload the integration or check the login. Home Assistant Repairs often shows the same error one by one.',
      about:
        'Config entries in setup error or retry. Open Home Assistant Repairs issues are a footnote, not a second card.',
    },
    outage_cluster: {
      label: 'Integration outages',
      ok: 'No integration has lost several devices at once.',
      hint: 'When many devices of the same integration are gone, reload the integration first — not each device. Check power at the hub / stick.',
      about:
        'Unreachable devices grouped by config entry. A cluster is at least 4 devices of the same integration. Counts clusters, not individual devices.',
    },
    energy_meta: {
      label: 'Energy sensors without state_class',
      ok: 'Every power and energy sensor has a state_class.',
      hint: 'Set state_class on the entity (measurement for W, total_increasing for kWh). Otherwise the Energy dashboard silently ignores the sensor.',
      about:
        'Sensors with unit W/kWh or device_class power/energy, but no state_class. The Energy dashboard then skips them — with no error.',
    },
    stuckStackHint:
      'Home Assistant Core, OS or Supervisor has been waiting for 14 days. That first, then devices.',
    outageRecovered: n =>
      n === 1
        ? '1 device was still reachable in the last hourly check.'
        : `${n} of these devices were still reachable in the last hourly check.`,
    repairsOpen: (n, list) => {
      const where = list ? ` (${list})` : '';
      return n === 1
        ? `Home Assistant Repairs: 1 open issue${where}.`
        : `Home Assistant Repairs: ${n} open issues${where}.`;
    },
    repairsSame: 'The same integrations as on this card, listed one by one.',
    radio_quiet: {
      label: 'Radio going quiet',
      ok: 'No Zigbee devices with old last_seen or very weak LQI.',
      hint: 'last_seen / linkquality only. Move the device closer to a router, check the battery, or clean up the mesh. Not the same as “unreachable”.',
      about:
        'Zigbee last_seen older than 48 hours or link quality 20 or less. Already-unavailable devices are not counted again here.',
    },
    storage: {
      label: 'Storage',
      about:
        'Free space on the HA data partition. SD/eMMC in gigabytes, SSD in percent. Optionally the reported drive life.',
    },
    recorder: {
      label: 'Recorder / history',
      about:
        'Whether the recorder is writing history and how large the backlog is. Independent of free disk space.',
    },
    backup: {
      label: 'Backup',
      about:
        'Age of the newest backup that contains Home Assistant. One offsite copy is enough; local-only stays yellow.',
    },
    storageWarnFlash: (warnGb, critGb) => `Warn below ${warnGb} GB, critical below ${critGb} GB`,
    storageWarnSsd: 'Warn below 10 % free, critical below 5 %',
    storageFree: (free, total, pct, kind) => `${free} of ${total} free (${pct} %, ${kind}).`,
    storageThresholds: threshold => `Thresholds: ${threshold}.`,
    storageLife: pct => `Estimated drive life ${pct} % used.`,
    storageHintFlash:
      'Backups, the recorder DB and updates need headroom. Delete old backups, trim history, or use a larger card.',
    storageHintSsd: 'Shorten recorder history, remove old backups, or add storage.',
    storageHintLife: 'The drive is approaching the end of its write cycles. Plan a replacement.',
    storageHintOk: (threshold, kind) => `${threshold} (${kind}).`,
    recorderDead: 'The recorder is not writing right now.',
    recorderOk: 'The recorder is running.',
    recorderMigration: 'A migration is pending.',
    recorderBacklog: n => `Backlog: ${n}.`,
    recorderHintDead:
      'Check Settings → System → Logs and the Recorder integration. Often a full or locked database.',
    recorderHintOk:
      'History under Developer tools → Statistics. Backlog often clears itself after a restart.',
    recorderShortOff: 'off',
    recorderShortOk: 'ok',
  };
}

export function healthCopy(lang: UiLang = getLanguage()): HealthCopy {
  return lang === 'en' ? en() : de();
}

export function fill(template: string, vars: Record<string, string | number>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export interface BackupCopy {
  genericHint: string;
  hintDrive: string;
  hintSamba: string;
  hintOfficial: string;
  standalone: string;
  unreadShort: string;
  unreadDetail: (err: string) => string;
  noneShort: string;
  noneDetail: string;
  noHaShort: string;
  noHaDetail: (name: string, age: string, total: number) => string;
  noHaNone: string;
  lastWithHa: (age: string, name: string) => string;
  newestPartial: (name: string) => string;
  total: (n: number) => string;
  offsite: (places: string) => string;
  localOnly: string;
  driveStale: string;
  driveError: string;
  sambaFailed: string;
  officialFailed: string;
  unknown: string;
  today: string;
  ageOne: string;
  ageMany: (n: number) => string;
  present: string;
  oneBackup: string;
  nBackups: (n: number) => string;
  driveLabel: (when: string, count: string, size: string) => string;
  sambaLabel: (when: string, count: string) => string;
  partial: string;
  full: string;
  local: string;
  remote: string;
}

function backupDe(): BackupCopy {
  const genericHint =
    'Unter Einstellungen → System → Backups einen Zeitplan und einen Speicherort ausserhalb dieses Geräts einrichten (NAS, Google Drive, OneDrive oder Home Assistant Cloud). Ein Backup nur auf der SD-Karte rettet bei Hardware-Tod nicht.';
  return {
    genericHint,
    hintDrive: `Im Add-on „Home Assistant Google Drive Backup“ Zeitplan und Uploads prüfen. ${genericHint}`,
    hintSamba: `Im Add-on „Samba Backup“ die Freigabe prüfen. ${genericHint}`,
    hintOfficial: `Unter Einstellungen → System → Backups den letzten Lauf prüfen. ${genericHint}`,
    standalone: 'Backup-Prüfung läuft nur im Home Assistant Add-on (Supervisor).',
    unreadShort: 'nicht lesbar',
    unreadDetail: err => `Backup-Liste nicht lesbar: ${err.slice(0, 160)}`,
    noneShort: 'keins',
    noneDetail: 'Keine Backups vorhanden.',
    noHaShort: 'kein HA-Backup',
    noHaDetail: (name, age, total) =>
      `Kein Backup enthält Home Assistant. Zuletzt: ${name} (${age}). ${total} Backups insgesamt.`,
    noHaNone: 'Kein Backup enthält Home Assistant.',
    lastWithHa: (age, name) => `Letztes Backup mit Home Assistant ${age} (${name}).`,
    newestPartial: name => `Neuester Stand ist ein Teilbackup ohne HA (${name}).`,
    total: n => `${n} Backup${n === 1 ? '' : 's'} insgesamt.`,
    offsite: places => `Offsite: ${places}.`,
    localOnly: 'Alle nur lokal – bei Platten-/SD-Tod weg.',
    driveStale: 'Google Drive Backup meldet veraltete Backups.',
    driveError: 'Google Drive Backup meldet gerade einen Fehler.',
    sambaFailed: 'Samba Backup ist fehlgeschlagen.',
    officialFailed: 'Der letzte automatische Backup-Lauf ist fehlgeschlagen.',
    unknown: 'unbekannt',
    today: 'heute',
    ageOne: 'vor 1 Tag',
    ageMany: n => `vor ${n} Tagen`,
    present: 'vorhanden',
    oneBackup: '1 Backup',
    nBackups: n => `${n} Backups`,
    driveLabel: (when, count, size) =>
      `Google Drive – ${when} · ${count}${size ? ` · ${size}` : ''}`,
    sambaLabel: (when, count) => `Samba-Share – ${when} · ${count} remote`,
    partial: 'Teilbackup',
    full: 'Vollbackup',
    local: 'lokal',
    remote: 'remote',
  };
}

function backupEn(): BackupCopy {
  const genericHint =
    'Under Settings → System → Backups set a schedule and a location off this device (NAS, Google Drive, OneDrive or Home Assistant Cloud). A backup only on the SD card will not survive hardware death.';
  return {
    genericHint,
    hintDrive: `In the “Home Assistant Google Drive Backup” add-on check schedule and uploads. ${genericHint}`,
    hintSamba: `In the “Samba Backup” add-on check the share. ${genericHint}`,
    hintOfficial: `Under Settings → System → Backups check the last run. ${genericHint}`,
    standalone: 'Backup check only runs in the Home Assistant add-on (Supervisor).',
    unreadShort: 'unreadable',
    unreadDetail: err => `Backup list unreadable: ${err.slice(0, 160)}`,
    noneShort: 'none',
    noneDetail: 'No backups present.',
    noHaShort: 'no HA backup',
    noHaDetail: (name, age, total) =>
      `No backup contains Home Assistant. Last: ${name} (${age}). ${total} backups in total.`,
    noHaNone: 'No backup contains Home Assistant.',
    lastWithHa: (age, name) => `Last backup with Home Assistant ${age} (${name}).`,
    newestPartial: name => `Newest item is a partial backup without HA (${name}).`,
    total: n => `${n} backup${n === 1 ? '' : 's'} in total.`,
    offsite: places => `Offsite: ${places}.`,
    localOnly: 'All local only – gone if the disk/SD dies.',
    driveStale: 'Google Drive Backup reports stale backups.',
    driveError: 'Google Drive Backup is currently reporting an error.',
    sambaFailed: 'Samba Backup failed.',
    officialFailed: 'The last automatic backup run failed.',
    unknown: 'unknown',
    today: 'today',
    ageOne: '1 day ago',
    ageMany: n => `${n} days ago`,
    present: 'present',
    oneBackup: '1 backup',
    nBackups: n => `${n} backups`,
    driveLabel: (when, count, size) =>
      `Google Drive – ${when} · ${count}${size ? ` · ${size}` : ''}`,
    sambaLabel: (when, count) => `Samba share – ${when} · ${count} remote`,
    partial: 'Partial backup',
    full: 'Full backup',
    local: 'local',
    remote: 'remote',
  };
}

export function backupCopy(lang: UiLang = getLanguage()): BackupCopy {
  return lang === 'en' ? backupEn() : backupDe();
}

export function formatLocaleNumber(
  n: number,
  digits: number,
  lang: UiLang = getLanguage(),
): string {
  return n.toLocaleString(dateLocale(lang), {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}
