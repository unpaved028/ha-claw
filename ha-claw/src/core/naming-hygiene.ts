/**
 * naming-hygiene.ts – Friendly-name proposals you can approve in bulk.
 *
 * The analysis module only said "12 entities lack a name". This lists the
 * twelve, suggests a name from area + cleaned entity_id, and applies approved
 * rows through the entity registry.
 */

import * as ha from './ha-client.js';
import { logAction } from '../storage/action-log.js';

export interface NamingProposal {
  entityId: string;
  currentName: string;
  proposedName: string;
  area: string;
}

export interface NamingReport {
  checkedAt: string;
  proposals: NamingProposal[];
}

const DOMAIN_LABEL: Record<string, string> = {
  light: 'Licht',
  switch: 'Schalter',
  binary_sensor: 'Sensor',
  sensor: 'Sensor',
  cover: 'Cover',
  climate: 'Heizung',
  fan: 'Lüfter',
  media_player: 'Media',
  lock: 'Schloss',
};

function titleCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function stemName(entityId: string): string {
  const raw = (entityId.split('.')[1] ?? entityId).replace(/_/g, ' ');
  return titleCase(raw);
}

export function proposeFriendlyName(entityId: string, area: string): string {
  const domain = entityId.split('.')[0] ?? '';
  const stem = stemName(entityId);
  const areaBit = area && area !== 'Ohne Bereich' ? area.trim() : '';
  if (areaBit && !stem.toLowerCase().includes(areaBit.toLowerCase())) {
    const kind = DOMAIN_LABEL[domain];
    if (kind && !stem.toLowerCase().includes(kind.toLowerCase())) {
      return `${areaBit} ${kind} ${stem}`.replace(/\s+/g, ' ').trim();
    }
    return `${areaBit} ${stem}`.replace(/\s+/g, ' ').trim();
  }
  return stem;
}

export async function buildNamingReport(): Promise<NamingReport> {
  const [states, areaMap] = await Promise.all([
    ha.getStates() as Promise<Array<{ entity_id: string; attributes: Record<string, unknown> }>>,
    ha.getAreaEntityMap(),
  ]);
  const areaOf = new Map<string, string>();
  for (const [area, ids] of Object.entries(areaMap)) {
    for (const id of ids) areaOf.set(id, area);
  }

  const proposals: NamingProposal[] = [];
  for (const s of states) {
    const domain = s.entity_id.split('.')[0] ?? '';
    if (!DOMAIN_LABEL[domain]) continue;
    const current = String(s.attributes['friendly_name'] ?? '').trim();
    const area = areaOf.get(s.entity_id) ?? 'Ohne Bereich';
    const proposed = proposeFriendlyName(s.entity_id, area);
    const missing = !current || current === s.entity_id || current === s.entity_id.split('.')[1];
    if (missing) {
      proposals.push({
        entityId: s.entity_id,
        currentName: current || s.entity_id,
        proposedName: proposed,
        area,
      });
    }
  }

  proposals.sort(
    (a, b) => a.area.localeCompare(b.area, 'de') || a.entityId.localeCompare(b.entityId),
  );
  return { checkedAt: new Date().toISOString(), proposals: proposals.slice(0, 80) };
}

export async function applyNamingProposals(
  items: { entityId: string; name: string }[],
): Promise<{ updated: string[]; failed: { entityId: string; error: string }[] }> {
  const updated: string[] = [];
  const failed: { entityId: string; error: string }[] = [];
  for (const item of items) {
    const name = item.name.trim();
    if (!item.entityId.includes('.') || !name) {
      failed.push({ entityId: item.entityId, error: 'invalid' });
      continue;
    }
    try {
      await ha.updateEntityName(item.entityId, name);
      updated.push(item.entityId);
      await logAction('config', `friendly_name: ${item.entityId} → ${name}`, 'naming_hygiene');
    } catch (err) {
      failed.push({ entityId: item.entityId, error: String(err) });
    }
  }
  return { updated, failed };
}
