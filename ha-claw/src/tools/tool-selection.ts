/**
 * tool-selection.ts – Which tools a given surface sends to the model.
 *
 * Notes, the generic store, memory cards and the learning admin tools stay
 * available, but they are omitted unless the message actually asks for them.
 * Scheduled jobs and solution drafts never receive confirming tools.
 */

import { isDangerous, isReadOnlyTool } from './registry.js';

export type ToolSurface = 'chat' | 'schedule' | 'draft';

interface OnDemandGroup {
  tools: string[];
  pattern: RegExp;
}

/** Kept out of the default request. Included when the message matches. */
const ON_DEMAND: OnDemandGroup[] = [
  {
    tools: ['notes_add', 'tasks_add'],
    pattern: /\b(note|notes|notiz|notizen|aufgabe|aufgaben|todo|todos|task)\b/i,
  },
  {
    tools: ['store_list', 'store_read', 'store_write', 'store_delete'],
    pattern: /\b(store|json|sammlung|collection)\b/i,
  },
  {
    tools: ['memory_remember', 'memory_recall', 'memory_update', 'memory_forget', 'memory_list'],
    pattern: /\b(memory|erinnerung|erinnerungen|merk dir|vergiss|remember|forget)\b/i,
  },
  {
    tools: ['detect_patterns', 'list_learned', 'learn_correction', 'learn_rule'],
    pattern: /\b(gelernt|learned|regel|regeln|rule|rules|muster|pattern|korrektur|correction)\b/i,
  },
];

/**
 * Names to pass as the agentic-loop tool filter.
 * `all` is the registry at call time, so disabled tools stay disabled.
 */
export function selectToolNames(surface: ToolSurface, message: string, all: string[]): string[] {
  const wanted = new Set(all);

  if (surface === 'schedule' || surface === 'draft') {
    for (const name of all) {
      if (isDangerous(name)) wanted.delete(name);
    }
  }
  if (surface === 'draft') {
    for (const name of all) {
      if (!isReadOnlyTool(name)) wanted.delete(name);
    }
  }

  for (const group of ON_DEMAND) {
    if (group.pattern.test(message)) continue;
    for (const name of group.tools) wanted.delete(name);
  }

  return [...wanted];
}
