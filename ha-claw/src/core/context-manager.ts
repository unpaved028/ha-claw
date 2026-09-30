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
 * This is a heuristic (~4 characters per token), not tiktoken. Request
 * costs in `/status` use OpenRouter's `usage.cost` when that field is
 * present, and a labeled price-table estimate when it is not.
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

/** Heuristic tokens for a JSON payload (tool schemas, for example). */
export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / 4);
}

/**
 * Index of the latest user message. Everything from there to the end is the
 * current turn and must survive pruning, including when it alone exceeds the
 * budget. Dropping it makes the model answer a question it never received.
 */
function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return i;
  }
  return -1;
}

/**
 * Prune message history to stay within a target token limit.
 *
 * Always keep the first system message and the current turn (the latest user
 * message and everything after it). Remove older history in paired groups
 * until the budget is met. An orphaned tool result must never leave this
 * function. If the system prompt plus the current turn already exceed the
 * budget, both are kept and a warning is logged.
 */
export function pruneMessages(messages: ChatMessage[], targetLimit: number): ChatMessage[] {
  const currentCount = countTokens(messages);
  if (currentCount <= targetLimit) return messages;

  log.info('Context limit exceeded – pruning history', {
    current: currentCount,
    target: targetLimit,
  });

  const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
  const bodyStart = systemMessage ? 1 : 0;
  const userAt = lastUserIndex(messages);
  const protectFrom = userAt >= bodyStart ? userAt : messages.length;
  const tail = messages.slice(protectFrom);
  let pruned = messages.slice(bodyStart, protectFrom);

  const fits = () =>
    countTokens(systemMessage ? [systemMessage, ...pruned, ...tail] : [...pruned, ...tail]);

  while (fits() > targetLimit && pruned.length > 0) {
    const next = dropOldestPaired(pruned);
    if (next.length === pruned.length) break;
    pruned = next;
  }

  while (pruned[0]?.role === 'tool') pruned = pruned.slice(1);

  const final = systemMessage ? [systemMessage, ...pruned, ...tail] : [...pruned, ...tail];
  if (countTokens(final) > targetLimit) {
    log.warn('Current turn exceeds the context budget; the question was kept', {
      tokens: countTokens(final),
      target: targetLimit,
    });
  }
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
