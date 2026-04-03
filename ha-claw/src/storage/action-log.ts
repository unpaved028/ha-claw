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

export async function logAction(
  category: ActionEntry['category'],
  description: string,
  tool?: string,
  rollback?: ActionEntry['rollback'],
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
    
    // Occasionally prune (1 in 20 chance)
    if (Math.random() < 0.05) {
      pruneOldActions().catch(() => {});
    }
  } catch (err) {
    log.error('Failed to log action', { error: String(err) });
  }
}

/** Prune actions older than 7 days. */
async function pruneOldActions(): Promise<void> {
  try {
    const raw = await readFile(ACTIONS_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    
    const filtered = lines.filter(l => {
      try {
        const entry = JSON.parse(l) as ActionEntry;
        const ts = new Date(entry.timestamp).getTime();
        return now - ts < sevenDaysMs;
      } catch {
        return false;
      }
    });
    
    if (filtered.length < lines.length) {
      await writeFile(ACTIONS_PATH, filtered.join('\n') + '\n', 'utf-8');
      log.info('Action log pruned', { removed: lines.length - filtered.length });
    }
  } catch (err) {
    // File might not exist yet, that's fine
  }
}

/** List recent actions. */
export async function listActions(limit = 50): Promise<ActionEntry[]> {
  try {
    const raw = await readFile(ACTIONS_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines
      .map(l => JSON.parse(l) as ActionEntry)
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
