/**
 * home-review.ts – One weekly digest instead of a backlog that fills up.
 */

import { getCachedSystemHealth, getSystemHealth } from './system-health.js';
import { buildCoverageReport } from './coverage-report.js';
import { buildQualityReport } from './automation-quality.js';
import { buildNamingReport } from './naming-hygiene.js';
import { buildEnergyReport } from './energy-attribution.js';
import { listTasks } from '../storage/backlog.js';
import { createJob, listJobs, updateJob } from '../storage/scheduler.js';
import { t } from './strings.js';

export const WEEKLY_DIGEST_NAME = 'Wochenbericht';

/** Seed a Sunday 10:00 digest job once. Existing jobs with this name keep their schedule. */
export async function ensureWeeklyDigestJob(): Promise<void> {
  const existing = (await listJobs()).find(
    j => j.kind === 'digest' || j.name === WEEKLY_DIGEST_NAME,
  );
  if (existing) {
    if (existing.kind !== 'digest') {
      await updateJob(existing.id, { kind: 'digest' });
    }
    return;
  }
  await createJob({
    name: WEEKLY_DIGEST_NAME,
    schedule: 'weekly sun 10:00',
    message: 'Wochenbericht',
    kind: 'digest',
  });
}

export interface HomeReview {
  checkedAt: string;
  health: { severity: string; checkedAt: string; warn: number; critical: number };
  coverageGaps: number;
  qualityIssues: number;
  namingProposals: number;
  energyWatts: number;
  openTasks: number;
  text: string;
}

export async function buildWeeklyDigest(): Promise<HomeReview> {
  const [health, coverage, quality, naming, energy, tasks] = await Promise.all([
    getCachedSystemHealth().then(h => h ?? getSystemHealth().catch(() => null)),
    buildCoverageReport().catch(() => null),
    buildQualityReport().catch(() => null),
    buildNamingReport().catch(() => null),
    buildEnergyReport().catch(() => null),
    listTasks().catch(() => []),
  ]);

  const checks = health?.checks ?? [];
  const warn = checks.filter(c => c.severity === 'warn').length;
  const critical = checks.filter(c => c.severity === 'critical').length;
  const open = tasks.filter(t => t.status === 'proposed' || t.status === 'approved').length;
  const gaps = coverage?.gaps.length ?? 0;
  const qualityN = quality?.issues.length ?? 0;
  const names = naming?.proposals.length ?? 0;
  const watts = Math.round(energy?.totalWatts ?? 0);

  const lines = [
    t('digest.title'),
    '',
    t('digest.health', {
      severity: health?.severity ?? 'n/a',
      critical,
      warn,
    }),
    t('digest.gaps', { n: gaps }),
    t('digest.quality', { n: qualityN }),
    t('digest.names', { n: names }),
    t('digest.watts', { n: watts }),
    t('digest.tasks', { n: open }),
  ];
  if (coverage && coverage.gaps.length > 0) {
    lines.push('', t('digest.gapList'));
    for (const g of coverage.gaps.slice(0, 8)) {
      lines.push(`- ${g.area}: ${g.detail}`);
    }
  }
  if (energy && energy.rows[0]?.watts != null) {
    lines.push('', t('digest.topLoads'));
    for (const r of energy.rows.filter(x => x.watts != null).slice(0, 5)) {
      lines.push(`- ${r.label}: ${Math.round(r.watts!)} W`);
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    health: {
      severity: health?.severity ?? 'unknown',
      checkedAt: health?.checkedAt ?? '',
      warn,
      critical,
    },
    coverageGaps: gaps,
    qualityIssues: qualityN,
    namingProposals: names,
    energyWatts: watts,
    openTasks: open,
    text: lines.join('\n'),
  };
}
