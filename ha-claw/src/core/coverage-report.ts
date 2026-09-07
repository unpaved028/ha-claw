/**
 * coverage-report.ts – Area-aware automation gaps as one report.
 *
 * A room is covered when a UI automation actually references the relevant
 * entities (and, for sun/leak/climate, the matching trigger or service).
 * Matching the automation's name used to hide real gaps and invent others.
 */

import * as ha from './ha-client.js';
import { t } from './strings.js';
import {
  callsClimateSet,
  callsNotifyService,
  getAutomationIndex,
  hasSunSignal,
  type AutomationIndex,
  type HaLikeState,
} from './automation-index.js';

export type CoverageKind =
  | 'motion_light'
  | 'cover_sun'
  | 'leak_notify'
  | 'climate_window'
  | 'climate_away';

export interface CoverageAction {
  trigger: string[];
  targets: string[];
  mode: string;
  sketch: string;
}

export interface CoverageGap {
  key: string;
  kind: CoverageKind;
  area: string;
  detail: string;
  entities: string[];
  suggestedBlueprint: string;
  action: CoverageAction;
}

export interface CoverageReport {
  checkedAt: string;
  areasScanned: number;
  gaps: CoverageGap[];
  uiScanned: number;
  yamlOnly: number;
  note?: string;
}

const BLUEPRINT: Record<CoverageKind, string> = {
  motion_light: 'Official: Motion-activated Light (homeassistant/motion_light). mode: restart.',
  cover_sun: 'Sun elevation trigger + cover.set_cover_position. No official blueprint required.',
  leak_notify:
    'moisture/leak binary_sensor → notify / persistent_notification. Keep the action native.',
  climate_window:
    'Native state trigger on the contact, for: 00:02:00 → climate.turn_off. No template.',
  climate_away:
    'Native state on person/device_tracker not_home → climate.set_temperature / set_hvac_mode.',
};

function deviceClass(s: HaLikeState): string {
  return String(s.attributes?.['device_class'] ?? '').toLowerCase();
}

function refsAny(rec: { entityRefs: readonly string[] }, ids: readonly string[]): boolean {
  return ids.some(id => rec.entityRefs.includes(id));
}

function isMotionLike(s: HaLikeState): boolean {
  if (!s.entity_id.startsWith('binary_sensor.')) return false;
  const dc = deviceClass(s);
  return dc === 'motion' || dc === 'occupancy' || dc === 'presence';
}

function isWindowOrDoor(s: HaLikeState): boolean {
  if (!s.entity_id.startsWith('binary_sensor.')) return false;
  const dc = deviceClass(s);
  return dc === 'window' || dc === 'door';
}

function isHousePresence(s: HaLikeState): boolean {
  if (s.entity_id.startsWith('person.') || s.entity_id.startsWith('device_tracker.')) return true;
  return s.entity_id.startsWith('binary_sensor.') && deviceClass(s) === 'presence';
}

function first(ids: string[], fallback: string): string {
  return ids[0] ?? fallback;
}

function actionFor(kind: CoverageKind, trigger: string[], targets: string[]): CoverageAction {
  const trig = first(trigger, '…');
  const tgt = first(targets, '…');
  const sketchKey: Record<CoverageKind, string> = {
    motion_light: 'coverage.sketchMotion',
    cover_sun: 'coverage.sketchCover',
    leak_notify: 'coverage.sketchLeak',
    climate_window: 'coverage.sketchClimateWindow',
    climate_away: 'coverage.sketchClimateAway',
  };
  const mode = kind === 'motion_light' || kind === 'climate_window' ? 'restart' : 'single';
  return {
    trigger,
    targets,
    mode,
    sketch: t(sketchKey[kind], { trigger: trig, target: tgt }),
  };
}

function gap(
  kind: CoverageKind,
  area: string,
  detail: string,
  trigger: string[],
  targets: string[],
): CoverageGap {
  const entities = [...new Set([...trigger, ...targets])].slice(0, 12);
  return {
    key: `${kind}:${area}`,
    kind,
    area,
    detail,
    entities,
    suggestedBlueprint: BLUEPRINT[kind],
    action: actionFor(kind, trigger, targets),
  };
}

export function findCoverageGaps(
  states: HaLikeState[],
  areaMap: Record<string, string[]>,
  index: AutomationIndex,
): CoverageGap[] {
  const byId = new Map(states.map(s => [s.entity_id, s]));
  const gaps: CoverageGap[] = [];
  const automations = index.automations;
  const presenceIds = states.filter(isHousePresence).map(s => s.entity_id);

  const areaNames = Object.keys(areaMap).sort((a, b) => a.localeCompare(b, 'de'));
  for (const area of areaNames) {
    const ids = areaMap[area] ?? [];
    const inArea = ids.map(id => byId.get(id)).filter((s): s is HaLikeState => Boolean(s));

    const motion = inArea.filter(isMotionLike);
    const lights = inArea.filter(s => s.entity_id.startsWith('light.'));
    if (motion.length > 0 && lights.length > 0) {
      const motionIds = motion.map(s => s.entity_id);
      const lightIds = lights.map(s => s.entity_id);
      const covered = automations.some(rec => refsAny(rec, motionIds) && refsAny(rec, lightIds));
      if (!covered) {
        gaps.push(
          gap(
            'motion_light',
            area,
            t('coverage.motion', { motion: motion.length, lights: lights.length }),
            motionIds,
            lightIds,
          ),
        );
      }
    }

    const covers = inArea.filter(s => s.entity_id.startsWith('cover.'));
    if (covers.length > 0) {
      const coverIds = covers.map(s => s.entity_id);
      const covered = automations.some(rec => refsAny(rec, coverIds) && hasSunSignal(rec));
      if (!covered) {
        gaps.push(
          gap(
            'cover_sun',
            area,
            t('coverage.cover', { covers: covers.length }),
            coverIds,
            coverIds,
          ),
        );
      }
    }

    const leaks = inArea.filter(
      s =>
        s.entity_id.startsWith('binary_sensor.') &&
        (deviceClass(s) === 'moisture' || deviceClass(s) === 'leak'),
    );
    if (leaks.length > 0) {
      const leakIds = leaks.map(s => s.entity_id);
      const covered = automations.some(
        rec => refsAny(rec, leakIds) && callsNotifyService(rec.services),
      );
      if (!covered) {
        gaps.push(
          gap('leak_notify', area, t('coverage.leak', { leaks: leaks.length }), leakIds, leakIds),
        );
      }
    }

    const contacts = inArea.filter(isWindowOrDoor);
    const climates = inArea.filter(s => s.entity_id.startsWith('climate.'));
    if (contacts.length > 0 && climates.length > 0) {
      const contactIds = contacts.map(s => s.entity_id);
      const climateIds = climates.map(s => s.entity_id);
      const covered = automations.some(
        rec =>
          refsAny(rec, contactIds) && refsAny(rec, climateIds) && callsClimateSet(rec.services),
      );
      if (!covered) {
        gaps.push(
          gap(
            'climate_window',
            area,
            t('coverage.climateWindow', { contacts: contacts.length, climates: climates.length }),
            contactIds,
            climateIds,
          ),
        );
      }
    }

    if (presenceIds.length > 0 && climates.length > 0) {
      const climateIds = climates.map(s => s.entity_id);
      const covered = automations.some(
        rec =>
          refsAny(rec, presenceIds) && refsAny(rec, climateIds) && callsClimateSet(rec.services),
      );
      if (!covered) {
        gaps.push(
          gap(
            'climate_away',
            area,
            t('coverage.climateAway', { climates: climates.length }),
            presenceIds.slice(0, 8),
            climateIds,
          ),
        );
      }
    }
  }

  return gaps;
}

export async function buildCoverageReport(): Promise<CoverageReport> {
  const [states, areaMap] = await Promise.all([
    ha.getStates() as Promise<HaLikeState[]>,
    ha.getAreaEntityMap(),
  ]);
  const index = await getAutomationIndex(states);
  const gaps = findCoverageGaps(states, areaMap, index);
  return {
    checkedAt: new Date().toISOString(),
    areasScanned: Object.keys(areaMap).length,
    gaps,
    uiScanned: index.uiScanned,
    yamlOnly: index.yamlOnly,
    note:
      index.yamlOnly > 0
        ? t('coverage.yamlNote', { ui: index.uiScanned, yaml: index.yamlOnly })
        : undefined,
  };
}
