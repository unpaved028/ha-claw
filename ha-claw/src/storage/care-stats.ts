/**
 * care-stats.ts – Local counts of what the user did with findings.
 *
 * Shown in the weekly digest so a finding's usefulness is visible without
 * an external analytics service.
 */

import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { appConfig } from '../core/config.js';
import { atomicWriteJson, withPathLock } from './atomic-write.js';

export interface CareStats {
  approved: number;
  rejected: number;
  dismissed: number;
}

const EMPTY: CareStats = { approved: 0, rejected: 0, dismissed: 0 };

function path(): string {
  return join(appConfig.dataPath, 'store', 'care-stats.json');
}

export async function readCareStats(): Promise<CareStats> {
  try {
    const raw = JSON.parse(await readFile(path(), 'utf-8')) as Partial<CareStats>;
    return {
      approved: Number(raw.approved) || 0,
      rejected: Number(raw.rejected) || 0,
      dismissed: Number(raw.dismissed) || 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function recordCareOutcome(kind: keyof CareStats): Promise<void> {
  const file = path();
  await mkdir(join(appConfig.dataPath, 'store'), { recursive: true });
  await withPathLock(file, async () => {
    const current = await readCareStats();
    current[kind] += 1;
    await atomicWriteJson(file, current);
  });
}
