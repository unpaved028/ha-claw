/**
 * coverage-report.ts – Area-aware automation gaps as one report.
 *
 * The analysis modules already hint at motion lights, sun covers and leak
 * notifications. They write backlog tasks. This report answers the question
 * in one place and points at a well-known blueprint instead of inventing YAML.
 */

import * as ha from './ha-client.js';

export type CoverageKind = 'motion_light' | 'cover_sun' | 'leak_notify';

export interface CoverageGap {
  key: string;
  kind: CoverageKind;
  area: string;
  detail: string;
  entities: string[];
  suggestedBlueprint: string;
}

export interface CoverageReport {
  checkedAt: string;
  areasScanned: number;
  gaps: CoverageGap[];
}

const BLUEPRINT = {
  motion_light: 'Official: Motion-activated Light (homeassistant/motion_light). mode: restart.',
  cover_sun: 'Sun elevation trigger + cover.set_cover_position. No official blueprint required.',
  leak_notify:
    'moisture/leak binary_sensor → notify / persistent_notification. Keep the action native.',
} as const;

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

function deviceClass(s: HAState): string {
  return String(s.attributes['device_class'] ?? '').toLowerCase();
}

function mentions(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some(n => h.includes(n));
}

function automationTouches(auto: HAState, entityIds: string[]): boolean {
  const blob = `${auto.entity_id} ${String(auto.attributes['friendly_name'] ?? '')}`;
  if (entityIds.some(id => blob.includes(id.split('.')[1] ?? id))) return true;
  const members = auto.attributes['entity_id'];
  if (Array.isArray(members) && members.some(m => entityIds.includes(String(m)))) return true;
  return false;
}

export async function buildCoverageReport(): Promise<CoverageReport> {
  const [states, areaMap] = await Promise.all([
    ha.getStates() as Promise<HAState[]>,
    ha.getAreaEntityMap(),
  ]);
  const byId = new Map(states.map(s => [s.entity_id, s]));
  const automations = states.filter(s => s.entity_id.startsWith('automation.'));
  const gaps: CoverageGap[] = [];

  const areaNames = Object.keys(areaMap).sort((a, b) => a.localeCompare(b, 'de'));
  for (const area of areaNames) {
    const ids = areaMap[area] ?? [];
    const inArea = ids.map(id => byId.get(id)).filter((s): s is HAState => Boolean(s));

    const motion = inArea.filter(
      s =>
        s.entity_id.startsWith('binary_sensor.') &&
        (deviceClass(s) === 'motion' ||
          deviceClass(s) === 'occupancy' ||
          deviceClass(s) === 'presence'),
    );
    const lights = inArea.filter(s => s.entity_id.startsWith('light.'));
    if (motion.length > 0 && lights.length > 0) {
      const involved = [...motion, ...lights].map(s => s.entity_id);
      const covered = automations.some(
        a =>
          automationTouches(a, involved) ||
          mentions(`${a.entity_id} ${String(a.attributes['friendly_name'] ?? '')}`, [
            'motion',
            'bewegung',
            area.toLowerCase(),
          ]),
      );
      if (!covered) {
        gaps.push({
          key: `motion_light:${area}`,
          kind: 'motion_light',
          area,
          detail: `${motion.length} Bewegungsmelder und ${lights.length} Lichter, aber keine Automation die sie verbindet.`,
          entities: involved.slice(0, 12),
          suggestedBlueprint: BLUEPRINT.motion_light,
        });
      }
    }

    const covers = inArea.filter(s => s.entity_id.startsWith('cover.'));
    if (covers.length > 0) {
      const covered = automations.some(a =>
        mentions(`${a.entity_id} ${String(a.attributes['friendly_name'] ?? '')}`, [
          'sonne',
          'sun',
          'azimut',
          'elevation',
          'beschatt',
          'rollo',
          'cover',
        ]),
      );
      if (!covered) {
        gaps.push({
          key: `cover_sun:${area}`,
          kind: 'cover_sun',
          area,
          detail: `${covers.length} Cover ohne Sonnen-/Beschattungs-Automation.`,
          entities: covers.map(s => s.entity_id).slice(0, 12),
          suggestedBlueprint: BLUEPRINT.cover_sun,
        });
      }
    }

    const leaks = inArea.filter(
      s =>
        s.entity_id.startsWith('binary_sensor.') &&
        (deviceClass(s) === 'moisture' || deviceClass(s) === 'leak'),
    );
    if (leaks.length > 0) {
      const covered = automations.some(a =>
        mentions(`${a.entity_id} ${String(a.attributes['friendly_name'] ?? '')}`, [
          'leck',
          'leak',
          'wasser',
          'moisture',
          'notify',
          'benachricht',
        ]),
      );
      if (!covered) {
        gaps.push({
          key: `leak_notify:${area}`,
          kind: 'leak_notify',
          area,
          detail: `${leaks.length} Leck-/Feuchtesensoren ohne Benachrichtigungs-Automation.`,
          entities: leaks.map(s => s.entity_id).slice(0, 12),
          suggestedBlueprint: BLUEPRINT.leak_notify,
        });
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    areasScanned: areaNames.length,
    gaps,
  };
}
