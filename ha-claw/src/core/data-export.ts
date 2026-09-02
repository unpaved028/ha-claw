/**
 * data-export.ts – JSON dump of user data (no API keys, no add-on options).
 */

import * as store from '../storage/json-store.js';
import { listCards } from '../storage/memory-cards.js';
import { listTasks } from '../storage/backlog.js';
import { listAllActions } from '../storage/action-log.js';

export interface DataExport {
  exportedAt: string;
  conversations: unknown[];
  memory: unknown[];
  tasks: unknown[];
  actions: unknown[];
}

export async function buildDataExport(): Promise<DataExport> {
  const [conversations, memory, tasks, actions] = await Promise.all([
    store.list('conversations'),
    listCards(),
    listTasks(),
    listAllActions(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    conversations,
    memory,
    tasks,
    actions,
  };
}
