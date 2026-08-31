/**
 * energy-attribution.ts – Which devices are drawing power right now.
 *
 * Uses existing power sensors (device_class power, unit W). Energy (kWh)
 * totals are listed separately when present; they are not a live wattage.
 */

import * as ha from './ha-client.js';

export interface EnergyRow {
  entityId: string;
  label: string;
  area: string;
  watts: number | null;
  kwh: number | null;
}

export interface EnergyReport {
  checkedAt: string;
  totalWatts: number;
  rows: EnergyRow[];
}

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

function num(state: string): number | null {
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

function unit(s: HAState): string {
  return String(s.attributes['unit_of_measurement'] ?? '').toLowerCase();
}

function dclass(s: HAState): string {
  return String(s.attributes['device_class'] ?? '').toLowerCase();
}

export function classifyEnergySensor(s: HAState): 'power' | 'energy' | null {
  if (!s.entity_id.startsWith('sensor.')) return null;
  if (s.state === 'unavailable' || s.state === 'unknown' || s.state === '') return null;
  const dc = dclass(s);
  const u = unit(s);
  if (dc === 'power' || u === 'w' || u === 'kw') return 'power';
  if (dc === 'energy' || u === 'kwh' || u === 'wh') return 'energy';
  return null;
}

export function wattsOf(s: HAState): number | null {
  const n = num(s.state);
  if (n == null) return null;
  return unit(s) === 'kw' ? n * 1000 : n;
}

export async function buildEnergyReport(): Promise<EnergyReport> {
  const [states, areaMap] = await Promise.all([
    ha.getStates() as Promise<HAState[]>,
    ha.getAreaEntityMap(),
  ]);
  const areaOf = new Map<string, string>();
  for (const [area, ids] of Object.entries(areaMap)) {
    for (const id of ids) areaOf.set(id, area);
  }

  const byStem = new Map<string, EnergyRow>();
  for (const s of states) {
    const kind = classifyEnergySensor(s);
    if (!kind) continue;
    const stem = s.entity_id.replace(/_?(power|energie|energy|leistung|verbrauch)_?(w|kwh)?$/i, '');
    const existing = byStem.get(stem) ?? {
      entityId: s.entity_id,
      label: String(s.attributes['friendly_name'] ?? s.entity_id),
      area: areaOf.get(s.entity_id) ?? 'Ohne Bereich',
      watts: null,
      kwh: null,
    };
    if (kind === 'power') {
      existing.watts = wattsOf(s);
      existing.entityId = s.entity_id;
      existing.label = String(s.attributes['friendly_name'] ?? existing.label);
    } else {
      const n = num(s.state);
      existing.kwh = n == null ? null : unit(s) === 'wh' ? n / 1000 : n;
    }
    byStem.set(stem, existing);
  }

  const rows = [...byStem.values()]
    .filter(r => r.watts != null || r.kwh != null)
    .sort((a, b) => (b.watts ?? -1) - (a.watts ?? -1))
    .slice(0, 40);
  const totalWatts = rows.reduce((sum, r) => sum + (r.watts ?? 0), 0);
  return { checkedAt: new Date().toISOString(), totalWatts, rows };
}
