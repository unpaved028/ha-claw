/**
 * coverage-dismiss.ts – Gaps the user marked as intentional, with a reason.
 *
 * A missing motion light in a bedroom can be a decision. Repeating it every
 * week trains the user to ignore Care. The reason is what the weekly digest
 * shows, so the decision is still readable after the gap disappears.
 */

import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { appConfig } from '../core/config.js';
import { atomicWriteJson, withPathLock } from './atomic-write.js';
import { recordCareOutcome } from './care-stats.js';

const REASON_MAX = 200;

export interface DismissedGap {
  key: string;
  reason: string;
  at: string;
}

function path(): string {
  return join(appConfig.dataPath, 'store', 'coverage-dismissed.json');
}

function asGap(item: unknown): DismissedGap | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as { key?: unknown; reason?: unknown; at?: unknown };
  if (typeof o.key !== 'string' || !o.key.trim()) return null;
  return {
    key: o.key,
    reason: typeof o.reason === 'string' ? o.reason : '',
    at: typeof o.at === 'string' ? o.at : '',
  };
}

async function readGaps(): Promise<DismissedGap[]> {
  try {
    const raw = JSON.parse(await readFile(path(), 'utf-8')) as { keys?: unknown; gaps?: unknown };
    if (Array.isArray(raw.gaps)) {
      return raw.gaps.flatMap(item => {
        const gap = asGap(item);
        return gap ? [gap] : [];
      });
    }
    if (Array.isArray(raw.keys)) {
      return raw.keys.flatMap(key => (typeof key === 'string' && key ? [{ key, reason: '', at: '' }] : []));
    }
    return [];
  } catch {
    return [];
  }
}

export async function listDismissedGaps(): Promise<DismissedGap[]> {
  return readGaps();
}

export async function dismissedGapKeys(): Promise<Set<string>> {
  return new Set((await readGaps()).map(g => g.key));
}

export async function dismissCoverageGap(key: string, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('missing reason');
  const stored = trimmed.slice(0, REASON_MAX);
  const file = path();
  await mkdir(join(appConfig.dataPath, 'store'), { recursive: true });
  let added = false;
  await withPathLock(file, async () => {
    const gaps = await readGaps();
    const existing = gaps.find(g => g.key === key);
    if (existing) {
      existing.reason = stored;
      existing.at = new Date().toISOString();
      await atomicWriteJson(file, { gaps });
      return;
    }
    gaps.push({ key, reason: stored, at: new Date().toISOString() });
    await atomicWriteJson(file, { gaps });
    added = true;
  });
  if (added) await recordCareOutcome('dismissed');
}
