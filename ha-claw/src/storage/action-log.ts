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
    entity_id: string | string[];
    data?: Record<string, unknown>;
  };
}

export function isConfigRestore(rollback: NonNullable<ActionEntry['rollback']>): boolean {
  return rollback.domain === 'config' && rollback.service === 'restore';
}

/** Replay a recorded inverse: service call, or a config snapshot restore. */
export async function executeRollback(action: ActionEntry): Promise<unknown> {
  if (!action.rollback) throw new Error('Action has no rollback information');
  if (isConfigRestore(action.rollback)) {
    const kind = action.rollback.data?.['kind'];
    const config = action.rollback.data?.['config'];
    const id = Array.isArray(action.rollback.entity_id)
      ? action.rollback.entity_id[0]
      : action.rollback.entity_id;
    if (
      (kind !== 'automation' && kind !== 'script') ||
      !id ||
      !config ||
      typeof config !== 'object'
    ) {
      throw new Error('Invalid config snapshot');
    }
    const { restoreConfigSnapshot } = await import('../core/config-change.js');
    await restoreConfigSnapshot({
      kind,
      id,
      config: config as Record<string, unknown>,
    });
    await logAction('system', `Rollback: ${kind} ${id} wiederhergestellt`, 'rollback');
    return { success: true, kind, id };
  }
  const { domain, service, entity_id, data } = action.rollback;
  const { callService } = await import('../core/ha-client.js');
  const res = await callService(domain, service, { entity_id, ...data });
  await logAction('system', `Rollback: ${domain}.${service} auf ${entity_id}`, 'rollback');
  return res;
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
export interface ActionListOptions {
  limit?: number;
  category?: ActionEntry['category'];
}

export async function listActions(options: ActionListOptions = {}): Promise<ActionEntry[]> {
  const rawLimit = options.limit ?? 50;
  const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.trunc(rawLimit))) : 50;
  const { category } = options;
  try {
    const raw = await readFile(ACTIONS_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries = lines.map(l => JSON.parse(l) as ActionEntry).reverse();
    const filtered = category ? entries.filter(e => e.category === category) : entries;
    return filtered.slice(0, limit);
  } catch {
    return [];
  }
}

/** Get a single action by ID (useful for rollback). Scans the whole file. */
export async function getActionById(id: string): Promise<ActionEntry | null> {
  try {
    const raw = await readFile(ACTIONS_PATH, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as ActionEntry;
        if (entry.id === id) return entry;
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Clear action log. */
export async function clearActions(): Promise<void> {
  try {
    await writeFile(ACTIONS_PATH, '', 'utf-8');
  } catch {}
}
