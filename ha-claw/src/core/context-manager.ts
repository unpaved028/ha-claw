/**
 * context-manager.ts – Conversation context and token management.
 *
 * Provides utilities to count tokens (estimated) and prune the conversation
 * history to fit within a target token budget.
 */

import type { ChatMessage } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('context-manager');

/**
 * Approximate token count for a message list.
 * This is a heuristic (~4 characters per token), not tiktoken. Displayed
 * costs elsewhere are also estimates — billed usage lives on OpenRouter.
 */
export function countTokens(messages: ChatMessage[]): number {
  let totalChars = 0;
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'user' || m.role === 'tool') {
      if (m.content) totalChars += m.content.length;
    } else if (m.role === 'assistant') {
      if (m.content) totalChars += m.content.length;
      if (m.tool_calls) {
        totalChars += JSON.stringify(m.tool_calls).length;
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Drop the oldest message, keeping assistant `tool_calls` paired with their
 * `role: tool` results. An orphaned tool result is a hard API error.
 */
export function dropOldestPaired(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages;
  const first = messages[0]!;
  if (first.role === 'assistant' && first.tool_calls && first.tool_calls.length > 0) {
    const ids = new Set(first.tool_calls.map(t => t.id));
    let i = 1;
    while (i < messages.length && messages[i]!.role === 'tool') {
      const id = (messages[i] as { tool_call_id: string }).tool_call_id;
      if (!ids.has(id)) break;
      ids.delete(id);
      i++;
    }
    return messages.slice(i);
  }
  if (first.role === 'tool') return messages.slice(1);
  return messages.slice(1);
}

/** True when every tool result has a matching assistant tool_call still in the list. */
export function toolCallsArePaired(messages: ChatMessage[]): boolean {
  const open = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const c of m.tool_calls) open.add(c.id);
    } else if (m.role === 'tool') {
      if (!open.has(m.tool_call_id)) return false;
      open.delete(m.tool_call_id);
    }
  }
  return true;
}

/**
 * Prune message history to stay within a target token limit.
 *
 * Always keep the first system message. Remove oldest history in paired
 * groups until the budget is met. Prefer keeping four recent messages, but
 * the budget wins — an orphaned tool result must never leave this function.
 */
export function pruneMessages(messages: ChatMessage[], targetLimit: number): ChatMessage[] {
  const currentCount = countTokens(messages);
  if (currentCount <= targetLimit) return messages;

  log.info('Context limit exceeded – pruning history', {
    current: currentCount,
    target: targetLimit,
  });

  const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
  let pruned = systemMessage ? messages.slice(1) : [...messages];

  const MIN_KEEP_RECENT = 4;

  while (
    countTokens(systemMessage ? [systemMessage, ...pruned] : pruned) > targetLimit &&
    pruned.length > 0
  ) {
    if (pruned.length <= MIN_KEEP_RECENT) {
      const next = dropOldestPaired(pruned);
      if (next.length === pruned.length) break;
      pruned = next;
      continue;
    }
    pruned = dropOldestPaired(pruned);
  }

  while (pruned[0]?.role === 'tool') pruned = pruned.slice(1);

  const final = systemMessage ? [systemMessage, ...pruned] : pruned;
  if (!toolCallsArePaired(final)) {
    log.warn('Prune left unpaired tool messages – dropping leading tool results');
    const cleaned = final.filter((m, i, arr) => {
      if (m.role !== 'tool') return true;
      return arr
        .slice(0, i)
        .some(
          prev => prev.role === 'assistant' && prev.tool_calls?.some(c => c.id === m.tool_call_id),
        );
    });
    log.info('Context pruned', { finalCount: countTokens(cleaned) });
    return cleaned;
  }

  log.info('Context pruned', { finalCount: countTokens(final) });
  return final;
}
