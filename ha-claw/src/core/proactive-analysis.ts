/**
 * proactive-analysis.ts – Seed backlog tasks from Care reports.
 *
 * Coverage gaps and automation-quality issues share this seeder. At most
 * three new tasks per run. Snapshot nags and hardware shopping lists stay out.
 */

import { createLogger } from './logger.js';
import { t } from './strings.js';
import { buildCoverageReport, type CoverageGap, type CoverageKind } from './coverage-report.js';
import { buildQualityReport, type QualityIssue } from './automation-quality.js';
import {
  cleanupAnalysisTasks,
  createTask,
  listTasks,
  updateTask,
  sourceKeyFromTitle,
  taskSourceKey,
  type BacklogTask,
} from '../storage/backlog.js';

const log = createLogger('analysis');

export interface Finding {
  title: string;
  asIs: string;
  toBe: string;
  impact: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  sourceKey: string;
}

const KIND_META: Record<
  CoverageKind,
  { priority: Finding['priority']; category: string; impactKey: string }
> = {
  motion_light: { priority: 'medium', category: 'comfort', impactKey: 'coverage.impactMotion' },
  cover_sun: { priority: 'medium', category: 'energy', impactKey: 'coverage.impactCover' },
  leak_notify: { priority: 'high', category: 'security', impactKey: 'coverage.impactLeak' },
  climate_window: {
    priority: 'high',
    category: 'energy',
    impactKey: 'coverage.impactClimateWindow',
  },
  climate_away: { priority: 'medium', category: 'energy', impactKey: 'coverage.impactClimateAway' },
};

/** Upper bound on tasks created per run, so a fresh install is not flooded. */
export const MAX_NEW_TASKS_PER_RUN = 3;

export function findingsFromCoverage(gaps: CoverageGap[]): Finding[] {
  return gaps.map(gap => {
    const meta = KIND_META[gap.kind];
    const sketch = gap.action?.sketch;
    return {
      title: `${gap.area}: ${gap.detail}`,
      asIs: gap.detail,
      toBe: sketch ? `${sketch} ${gap.suggestedBlueprint}` : gap.suggestedBlueprint,
      impact: t(meta.impactKey),
      category: meta.category,
      priority: meta.priority,
      tags: [gap.kind, gap.area],
      sourceKey: gap.key,
    };
  });
}

export function findingsFromQuality(issues: QualityIssue[]): Finding[] {
  return issues.map(issue => ({
    title: issue.label,
    asIs: issue.detail,
    toBe: issue.suggestedFix,
    impact: t('quality.impact'),
    category: 'automation',
    priority: 'medium' as const,
    tags: [issue.kind, issue.entityId],
    sourceKey: issue.key,
  }));
}

export async function runAnalysis(): Promise<string> {
  log.info('Coverage seeder started');

  try {
    const cleaned = await cleanupAnalysisTasks();
    const [coverage, quality] = await Promise.all([buildCoverageReport(), buildQualityReport()]);
    const findings = [
      ...findingsFromCoverage(coverage.gaps),
      ...findingsFromQuality(quality.issues),
    ];
    findings.sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));

    const existingTasks = await listTasks({});
    const { created, refreshed } = await writeFindings(findings, existingTasks);

    const summary =
      created > 0
        ? `Analyse abgeschlossen: ${findings.length} Hinweise, ${created} neue Vorschläge ins Backlog, ${refreshed} aktualisiert.`
        : findings.length > 0
          ? `Analyse abgeschlossen: ${findings.length} Hinweise, alle bereits bekannt (${refreshed} aktualisiert).`
          : 'Analyse abgeschlossen: Keine Automationslücken.';
    const retired =
      cleaned.retiredRemoved > 0
        ? ` ${cleaned.retiredRemoved} veraltete Analyse-Tasks entfernt.`
        : '';
    log.info(summary + retired);
    return summary + retired;
  } catch (err) {
    const msg = `Analyse fehlgeschlagen: ${String(err)}`;
    log.error(msg);
    return msg;
  }
}

export type CareTaskSource = 'coverage' | 'quality';

export async function enqueueCareTask(
  source: CareTaskSource,
  key: string,
): Promise<
  | { ok: true; created: boolean; existed: boolean; taskId: string }
  | { ok: false; error: string; status: number }
> {
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > 240) {
    return { ok: false, error: 'key required', status: 400 };
  }

  let finding: Finding | undefined;
  if (source === 'coverage') {
    const report = await buildCoverageReport();
    const gap = report.gaps.find(g => g.key === trimmed);
    if (!gap) return { ok: false, error: 'gap not found', status: 404 };
    finding = findingsFromCoverage([gap])[0];
  } else if (source === 'quality') {
    const report = await buildQualityReport();
    const issue = report.issues.find(i => i.key === trimmed);
    if (!issue) return { ok: false, error: 'issue not found', status: 404 };
    finding = findingsFromQuality([issue])[0];
  } else {
    return { ok: false, error: 'source must be coverage or quality', status: 400 };
  }
  if (!finding) return { ok: false, error: 'finding missing', status: 500 };

  const existingTasks = await listTasks({});
  const already = existingTasks.find(task => taskSourceKey(task) === finding.sourceKey);
  const { created } = await writeFindings([finding], existingTasks);
  const after = await listTasks({});
  const task = after.find(row => taskSourceKey(row) === finding.sourceKey);
  return {
    ok: true,
    created: created > 0,
    existed: Boolean(already),
    taskId: task?.id ?? '',
  };
}

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

function priorityWeight(priority: string): number {
  return PRIORITY_WEIGHT[priority] ?? 0;
}

/**
 * Write findings to the backlog.
 *
 * Matching happens on the source key (coverage gap key, or a collapsed title).
 * A known finding refreshes the existing task instead of creating another one,
 * and only tasks still in 'proposed' are touched.
 */
export async function writeFindings(
  findings: Finding[],
  existingTasks: BacklogTask[],
): Promise<{ created: number; refreshed: number }> {
  const byKey = new Map<string, BacklogTask>();
  for (const task of existingTasks) {
    const key = taskSourceKey(task);
    if (!byKey.has(key)) byKey.set(key, task);
  }

  let created = 0;
  let refreshed = 0;

  for (const finding of findings) {
    const key = finding.sourceKey || sourceKeyFromTitle(finding.title);
    const existing = byKey.get(key);

    if (existing) {
      if (existing.status === 'proposed') {
        await updateTask(existing.id, {
          title: finding.title,
          asIs: finding.asIs,
          priority: finding.priority,
        });
        refreshed++;
      }
      continue;
    }

    if (created >= MAX_NEW_TASKS_PER_RUN) continue;

    const task = await createTask({
      title: finding.title,
      asIs: finding.asIs,
      toBe: finding.toBe,
      impact: finding.impact,
      category: finding.category,
      priority: finding.priority,
      tags: finding.tags,
      proposedBy: 'analysis',
      sourceKey: key,
    });
    byKey.set(key, task);
    created++;
  }

  return { created, refreshed };
}
