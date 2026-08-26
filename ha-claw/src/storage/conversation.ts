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

const MAX_MESSAGES = 20;

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
