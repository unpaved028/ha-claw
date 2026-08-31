/**
 * orphan-cleanup.ts – Remove devices that have been unavailable for 30 days.
 *
 * Health cards already list them. This is the one-click that was missing.
 * Items use the same ids as System Health (`dev:…` / `stem:…`).
 */

import * as ha from './ha-client.js';
import { logAction } from '../storage/action-log.js';
import { createLogger } from './logger.js';

const log = createLogger('orphan-cleanup');

export interface OrphanRemovalResult {
  removedDevices: string[];
  removedEntities: string[];
  failed: { id: string; error: string }[];
}

export type OrphanTarget =
  | { type: 'device'; deviceId: string }
  | { type: 'stem'; stem: string }
  | { type: 'entity'; entityId: string }
  | { type: 'invalid'; id: string };

export function parseOrphanItemId(id: string): OrphanTarget {
  const raw = String(id ?? '').trim();
  if (raw.startsWith('dev:') && raw.length > 4) return { type: 'device', deviceId: raw.slice(4) };
  if (raw.startsWith('stem:') && raw.length > 5) return { type: 'stem', stem: raw.slice(5) };
  if (raw.includes('.')) return { type: 'entity', entityId: raw };
  return { type: 'invalid', id: raw };
}

export async function removeOrphans(itemIds: string[]): Promise<OrphanRemovalResult> {
  const snapshot = await ha.getRegistrySnapshot();
  const result: OrphanRemovalResult = { removedDevices: [], removedEntities: [], failed: [] };

  for (const raw of itemIds) {
    const parsed = parseOrphanItemId(raw);
    if (parsed.type === 'invalid') {
      if (parsed.id) result.failed.push({ id: parsed.id, error: 'unrecognised id' });
      continue;
    }
    const id = raw;
    try {
      if (parsed.type === 'device') {
        await ha.removeDevice(parsed.deviceId);
        result.removedDevices.push(parsed.deviceId);
        continue;
      }
      if (parsed.type === 'stem') {
        const stem = parsed.stem;
        const matches = snapshot.entities.filter(e => {
          const name = (e.entity_id.split('.')[1] ?? '').toLowerCase();
          return name === stem || name.startsWith(`${stem}_`);
        });
        if (matches.length === 0) {
          result.failed.push({ id, error: 'no matching entities' });
          continue;
        }
        for (const e of matches) {
          await ha.removeEntity(e.entity_id);
          result.removedEntities.push(e.entity_id);
        }
        continue;
      }
      if (parsed.type === 'entity') {
        await ha.removeEntity(parsed.entityId);
        result.removedEntities.push(parsed.entityId);
      }
    } catch (err) {
      log.warn('Orphan remove failed', { id, error: String(err) });
      result.failed.push({ id, error: String(err) });
    }
  }

  const desc = [
    result.removedDevices.length ? `${result.removedDevices.length} Geräte` : '',
    result.removedEntities.length ? `${result.removedEntities.length} Entities` : '',
  ]
    .filter(Boolean)
    .join(', ');
  if (desc) {
    await logAction('config', `Altlasten entfernt: ${desc}`, 'orphan_cleanup');
  }
  return result;
}
