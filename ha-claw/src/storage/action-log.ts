/**
 * action-log.ts – Audit trail for significant bot activities.
 *
 * Logs: device switches, note/task creations, config changes.
 * Helps user track exactly "what the bot actually did".
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('action-log');
const ACTIONS_PATH = join(appConfig.dataPath, 'store', 'actions.jsonl');

export interface ActionEntry {
  id: string;
  timestamp: string;
  category: 'switch' | 'note' | 'task' | 'config' | 'system' | 'schedule' | 'other';
  description: string;
  tool?: string;
  rollback?: {
    domain: string;
    service: string;
    entity_id: string;
    data?: Record<string, unknown>;
  };
}

/** Ensure storage exists. */
export async function initActionLog(): Promise<void> {
  const dir = join(appConfig.dataPath, 'store');
  await mkdir(dir, { recursive: true });
}

/** Log a new action. Appends to JSONL for efficiency. */
export async function logAction(
  category: ActionEntry['category'],
  description: string,
  tool?: string,
  rollback?: ActionEntry['rollback']
): Promise<void> {
  const entry: ActionEntry = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString(),
    category,
    description,
    tool,
    rollback,
  };

  try {
    await appendFile(ACTIONS_PATH, JSON.stringify(entry) + '\n', 'utf-8');
    log.debug('Action logged', { id: entry.id, category, description });
  } catch (err) {
    log.error('Failed to log action', { error: String(err) });
  }
}

/** List recent actions. */
export async function listActions(limit = 50): Promise<ActionEntry[]> {
  try {
    const raw = await readFile(ACTIONS_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines
      .map((l) => JSON.parse(l) as ActionEntry)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Get a single action by ID (useful for rollback). */
export async function getActionById(id: string): Promise<ActionEntry | null> {
  const actions = await listActions(200);
  return actions.find(a => a.id === id) || null;
}

/** Clear action log. */
export async function clearActions(): Promise<void> {
  try {
    await writeFile(ACTIONS_PATH, '', 'utf-8');
  } catch {}
}
