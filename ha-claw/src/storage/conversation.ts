/**
 * conversation.ts – The one chat both the Web UI and Telegram speak into.
 *
 * The file id stays `web` because that is where existing installs already
 * keep their dashboard history. Telegram used to write `tg-<chatId>` and
 * therefore never saw (or taught) that conversation.
 */

import * as store from './json-store.js';
import type { ChatMessage } from '../core/types.js';

/** On-disk id of the shared conversation. Do not change – existing data lives here. */
export const SHARED_CONVERSATION_ID = 'web';

/** Hard cap of persisted messages. Older turns are dropped on save. */
export const MAX_MESSAGES = 100;

/** Default page size for GET /api/chat/history when no limit is given. */
export const DEFAULT_HISTORY_LIMIT = 30;

export interface HistoryPage {
  messages: ChatMessage[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export async function loadConversation(): Promise<ChatMessage[]> {
  const record = await store.read<{ messages: ChatMessage[] } & store.StoredRecord>(
    'conversations',
    SHARED_CONVERSATION_ID,
  );
  return record?.messages ?? [];
}

export async function saveConversation(messages: ChatMessage[]): Promise<void> {
  await store.upsert('conversations', SHARED_CONVERSATION_ID, {
    messages: messages.slice(-MAX_MESSAGES),
  });
}

/**
 * Persist the user turn immediately (so a refresh does not lose it) and
 * return the history *before* that turn – the agentic loop appends the
 * new user message itself.
 */
export async function appendUserMessage(content: string): Promise<ChatMessage[]> {
  const history = await loadConversation();
  await saveConversation([...history, { role: 'user', content }]);
  return history;
}

export async function appendAssistantMessage(content: string): Promise<void> {
  const history = await loadConversation();
  await saveConversation([...history, { role: 'assistant', content }]);
}

/**
 * Slice a conversation for the history API.
 *
 * Messages are stored oldest-first. Omitting `offset` returns the last `limit`
 * messages (the newest page). `hasMore` is true when older messages exist
 * before this slice.
 */
export function pageMessages(
  messages: ChatMessage[],
  query: { offset?: number; limit?: number } = {},
): HistoryPage {
  const total = messages.length;
  const limitRaw = query.limit;
  const limit =
    limitRaw !== undefined && Number.isFinite(limitRaw)
      ? Math.min(MAX_MESSAGES, Math.max(1, Math.trunc(limitRaw)))
      : DEFAULT_HISTORY_LIMIT;

  let offset: number;
  if (query.offset === undefined || !Number.isFinite(query.offset)) {
    offset = Math.max(0, total - limit);
  } else {
    offset = Math.max(0, Math.trunc(query.offset));
    if (offset > total) offset = total;
  }

  return {
    messages: messages.slice(offset, offset + limit),
    total,
    offset,
    limit,
    hasMore: offset > 0,
  };
}
