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
 * Rule of thumb: ~4 characters per token for English/German text.
 * JSON structures (tool calls) are slightly more dense.
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
 * Prune message history to stay within a target token limit.
 * 
 * Strategy (Middle-Pruning):
 * 1. Always keep the first message (System Prompt).
 * 2. Always keep the last N messages (Recent context).
 * 3. If still over limit, remove messages from the "middle" (oldest history).
 */
export function pruneMessages(messages: ChatMessage[], targetLimit: number): ChatMessage[] {
  const currentCount = countTokens(messages);
  if (currentCount <= targetLimit) return messages;

  log.info('Context limit exceeded – pruning history', { current: currentCount, target: targetLimit });

  const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
  const otherMessages = systemMessage ? messages.slice(1) : messages;

  // We want to keep at least 4 recent messages if possible (usually 2 user/assistant pairs)
  const MIN_KEEP_RECENT = 4;
  
  let pruned = [...otherMessages];
  
  // Repeatedly remove the oldest non-system message until we are within budget
  // or reach our minimum "recent" buffer.
  while (countTokens(systemMessage ? [systemMessage, ...pruned] : pruned) > targetLimit && pruned.length > MIN_KEEP_RECENT) {
    // Check if the next message is a tool result. 
    // If it is, we should try to keep the corresponding assistant message too.
    // Simplifying for now: Just shift the oldest.
    pruned.shift();
  }

  const final = systemMessage ? [systemMessage, ...pruned] : pruned;
  log.info('Context pruned', { finalCount: countTokens(final) });
  
  return final;
}
