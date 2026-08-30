/**
 * backlog.ts – Optimization backlog for the CIE agent.
 *
 * Stores improvement tasks the agent can propose and track.
 * Each task has: ID, priority, status, as-is/to-be descriptions, impact estimate.
 *
 * Tasks are stored as individual JSON files in /data/store/backlog/.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('backlog');

const BACKLOG_DIR = join(appConfig.dataPath, 'store', 'backlog');

// ── Types ─────────────────────────────────────────────────

export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus =
  | 'proposed'
  | 'approved'
  | 'fast_track_approved'
  | 'solution_proposed'
  | 'solution_approved'
  | 'executing'
  | 'in_progress'
  | 'done'
  | 'rejected'
  | 'deferred'
  | 'failed';

/** Give up after this many processor attempts (solution + execution combined). */
export const MAX_TASK_ATTEMPTS = 3;

export interface BacklogTask {
  id: string;
  /** Short title */
  title: string;
  /** Current state description */
  asIs: string;
  /** Desired future state */
  toBe: string;
  /** Expected impact / benefit */
  impact: string;
  priority: Priority;
  status: TaskStatus;
  /** Category: energy, comfort, security, automation, maintenance */
  category: string;
  /** Optional tags for search */
  tags: string[];
  /** Who proposed it */
  proposedBy: 'agent' | 'user' | 'analysis';
  /**
   * Stable identity of the underlying finding, independent of the live numbers
   * in the title (see sourceKeyFromTitle). Absent on tasks created before
   * v0.9.3 – derive it from the title in that case.
   */
  sourceKey?: string;
  /** Proposed solution (YAML, automation config, description) */
  solution?: string;
  /** When the solution was approved */
  solutionApprovedAt?: string;
  /** Execution result or error */
  executionResult?: string;
  /** Processor attempts so far. Reset when a human retries a failed task. */
  attemptCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ── Init ──────────────────────────────────────────────────

export async function initBacklog(): Promise<void> {
  await mkdir(BACKLOG_DIR, { recursive: true });
  log.info('Backlog initialized', { dir: BACKLOG_DIR });
}

// ── Status Change Listener ───────────────────────────────

/** Callback invoked when a task reaches a processable status. */
type BacklogListener = () => void;
let onTaskStatusChanged: BacklogListener | null = null;

/**
 * Register a listener that fires when a task transitions to
 * 'approved', 'solution_approved' or 'fast_track_approved' (used by backlog-processor).
 */
export function onProcessableStatusChange(listener: BacklogListener): void {
  onTaskStatusChanged = listener;
}

/** Statuses that trigger automatic processing. */
const PROCESSABLE_STATUSES = new Set(['approved', 'solution_approved', 'fast_track_approved']);

// ── New Task Hooks ────────────────────────────────────────

type NewTaskListener = (task: BacklogTask) => void;
let onNewHighPriorityTaskListener: NewTaskListener | null = null;

export function onNewHighPriorityTask(listener: NewTaskListener): void {
  onNewHighPriorityTaskListener = listener;
}

// ── Identity ──────────────────────────────────────────────

/**
 * Derive a stable key for a finding from its title.
 *
 * Analysis titles embed a live count ("59 Geräte nicht erreichbar"), which is
 * precisely why the original title-based deduplication failed: any fluctuation
 * in that number produced a title the dedup set had never seen, so every run
 * created another task. Collapsing all digit runs to '#' yields a key that
 * survives the count changing, and it can also be computed for tasks that were
 * created before the key was stored – which is what makes the cleanup of
 * existing duplicates possible.
 */
export function sourceKeyFromTitle(title: string): string {
  return title
    .replace(/\d+([.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The key a task should be grouped under, whether or not it has one stored. */
export function taskSourceKey(task: BacklogTask): string {
  return task.sourceKey ?? sourceKeyFromTitle(task.title);
}

// ── CRUD ──────────────────────────────────────────────────

function taskPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return join(BACKLOG_DIR, `${safeId}.json`);
}

export async function createTask(data: {
  title: string;
  asIs: string;
  toBe: string;
  impact: string;
  priority?: Priority;
  category?: string;
  tags?: string[];
  proposedBy?: 'agent' | 'user' | 'analysis';
  sourceKey?: string;
}): Promise<BacklogTask> {
  const id = 'T-' + randomUUID().slice(0, 6).toUpperCase();
  const now = new Date().toISOString();

  const task: BacklogTask = {
    id,
    title: data.title,
    asIs: data.asIs,
    toBe: data.toBe,
    impact: data.impact,
    priority: data.priority ?? 'medium',
    status: 'proposed',
    category: data.category ?? 'automation',
    tags: data.tags ?? [],
    proposedBy: data.proposedBy ?? 'agent',
    sourceKey: data.sourceKey ?? sourceKeyFromTitle(data.title),
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(taskPath(id), task);
  log.info('Backlog task created', { id, title: task.title, priority: task.priority });

  // Fire webhook if high priority
  if (task.priority === 'high' && onNewHighPriorityTaskListener) {
    onNewHighPriorityTaskListener(task);
  }

  return task;
}

export async function getTask(id: string): Promise<BacklogTask | null> {
  try {
    const raw = await readFile(taskPath(id), 'utf-8');
    return JSON.parse(raw) as BacklogTask;
  } catch {
    return null;
  }
}

export async function updateTask(
  id: string,
  updates: Partial<
    Pick<
      BacklogTask,
      | 'title'
      | 'asIs'
      | 'toBe'
      | 'impact'
      | 'priority'
      | 'status'
      | 'category'
      | 'tags'
      | 'solution'
      | 'solutionApprovedAt'
      | 'executionResult'
      | 'attemptCount'
    >
  >,
  options?: { notify?: boolean },
): Promise<BacklogTask | null> {
  const existing = await getTask(id);
  if (!existing) return null;

  const updated: BacklogTask = {
    ...existing,
    ...updates,
    id,
    createdAt: existing.createdAt,
    proposedBy: existing.proposedBy,
    updatedAt: new Date().toISOString(),
  };

  if (existing.status === 'failed' && updates.status && PROCESSABLE_STATUSES.has(updates.status)) {
    updated.attemptCount = 0;
  }

  await atomicWrite(taskPath(id), updated);
  log.info('Backlog task updated', { id, status: updated.status });

  const shouldNotify = options?.notify !== false;
  if (
    shouldNotify &&
    updates.status &&
    PROCESSABLE_STATUSES.has(updates.status) &&
    onTaskStatusChanged
  ) {
    onTaskStatusChanged();
  }

  return updated;
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    await unlink(taskPath(id));
    log.info('Backlog task deleted', { id });
    return true;
  } catch {
    return false;
  }
}

export async function listTasks(filter?: {
  status?: TaskStatus;
  priority?: Priority;
}): Promise<BacklogTask[]> {
  try {
    const files = await readdir(BACKLOG_DIR);
    let tasks: BacklogTask[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(BACKLOG_DIR, file), 'utf-8');
      tasks.push(JSON.parse(raw) as BacklogTask);
    }

    if (filter?.status) tasks = tasks.filter(t => t.status === filter.status);
    if (filter?.priority) tasks = tasks.filter(t => t.priority === filter.priority);

    // Sort: high priority first, then by date
    const prioOrder = { high: 0, medium: 1, low: 2 };
    return tasks.sort((a, b) => {
      const pd = prioOrder[a.priority] - prioOrder[b.priority];
      return pd !== 0 ? pd : b.updatedAt.localeCompare(a.updatedAt);
    });
  } catch {
    return [];
  }
}

// ── Maintenance ───────────────────────────────────────────

/**
 * Findings that used to be written to the backlog but became live health checks
 * in v0.9.3 (see core/system-health.ts). Their leftover tasks are obsolete.
 * Derived from representative titles so they cannot drift from the key function.
 */
const RETIRED_CONDITION_KEYS = new Set(
  [
    '0 Geräte nicht erreichbar',
    '0 Sensoren seit 48h+ unverändert',
    '0 Geräte mit niedriger Batterie',
  ].map(sourceKeyFromTitle),
);

export interface CleanupResult {
  /** Duplicates of the same finding that were removed. */
  duplicatesRemoved: number;
  /** Tasks removed because their check moved to the health view. */
  retiredRemoved: number;
  /** Tasks left in the backlog afterwards. */
  remaining: number;
}

/**
 * Rank for deciding which task of a duplicate group to keep. A task the user
 * already acted on must win over an untouched one – dropping a 'rejected' task
 * would let the analysis propose it all over again.
 */
function keepRank(task: BacklogTask): number {
  return task.status === 'proposed' ? 0 : 1;
}

/**
 * Collapse duplicate analysis tasks and drop the retired condition checks.
 *
 * Before v0.9.3 the analysis deduplicated on the exact title, but every title
 * carried a live count – so each run created a new task for the same finding.
 * This repairs the backlogs that accumulated as a result.
 */
export async function cleanupAnalysisTasks(): Promise<CleanupResult> {
  const tasks = await listTasks({});

  const groups = new Map<string, BacklogTask[]>();
  let retiredRemoved = 0;

  for (const task of tasks) {
    const key = taskSourceKey(task);

    if (RETIRED_CONDITION_KEYS.has(key)) {
      if (await deleteTask(task.id)) retiredRemoved++;
      continue;
    }

    // Only analysis output is collapsed – tasks a human or the agent wrote
    // deliberately may legitimately look similar.
    if (task.proposedBy !== 'analysis') continue;

    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }

  let duplicatesRemoved = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => {
      const byRank = keepRank(b) - keepRank(a);
      return byRank !== 0 ? byRank : b.updatedAt.localeCompare(a.updatedAt);
    });

    for (const task of sorted.slice(1)) {
      if (await deleteTask(task.id)) duplicatesRemoved++;
    }
  }

  const remaining = (await listTasks({})).length;
  log.info('Backlog cleanup finished', { duplicatesRemoved, retiredRemoved, remaining });
  return { duplicatesRemoved, retiredRemoved, remaining };
}

// ── Helpers ───────────────────────────────────────────────

async function atomicWrite(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, path);
}
