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
export type TaskStatus = 'proposed' | 'approved' | 'in_progress' | 'done' | 'rejected';

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
  /** Who proposed it: 'agent' or 'user' */
  proposedBy: 'agent' | 'user';
  createdAt: string;
  updatedAt: string;
}

// ── Init ──────────────────────────────────────────────────

export async function initBacklog(): Promise<void> {
  await mkdir(BACKLOG_DIR, { recursive: true });
  log.info('Backlog initialized', { dir: BACKLOG_DIR });
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
  proposedBy?: 'agent' | 'user';
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
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(taskPath(id), task);
  log.info('Backlog task created', { id, title: task.title, priority: task.priority });
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
  updates: Partial<Pick<BacklogTask, 'title' | 'asIs' | 'toBe' | 'impact' | 'priority' | 'status' | 'category' | 'tags'>>,
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

  await atomicWrite(taskPath(id), updated);
  log.info('Backlog task updated', { id, status: updated.status });
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

    if (filter?.status) tasks = tasks.filter((t) => t.status === filter.status);
    if (filter?.priority) tasks = tasks.filter((t) => t.priority === filter.priority);

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

// ── Helpers ───────────────────────────────────────────────

async function atomicWrite(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, path);
}
