import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from '../src/core/types.js';
import { DEFAULT_HISTORY_LIMIT, MAX_MESSAGES, pageMessages } from '../src/storage/conversation.js';

function msgs(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: 'user' as const,
    content: 'm' + i,
  }));
}

describe('conversation constants', () => {
  it('keeps at most 100 messages on disk and pages 30 by default', () => {
    assert.equal(MAX_MESSAGES, 100);
    assert.equal(DEFAULT_HISTORY_LIMIT, 30);
  });
});

describe('pageMessages', () => {
  it('returns the last page when offset is omitted', () => {
    const all = msgs(80);
    const page = pageMessages(all);
    assert.equal(page.total, 80);
    assert.equal(page.limit, 30);
    assert.equal(page.offset, 50);
    assert.equal(page.messages.length, 30);
    assert.equal(page.messages[0]?.content, 'm50');
    assert.equal(page.messages[29]?.content, 'm79');
    assert.equal(page.hasMore, true);
  });

  it('hasMore is false when the slice starts at the beginning', () => {
    const page = pageMessages(msgs(10));
    assert.equal(page.offset, 0);
    assert.equal(page.messages.length, 10);
    assert.equal(page.hasMore, false);
  });

  it('loads an older window by offset', () => {
    const page = pageMessages(msgs(80), { offset: 20, limit: 30 });
    assert.equal(page.offset, 20);
    assert.equal(page.messages[0]?.content, 'm20');
    assert.equal(page.messages.length, 30);
    assert.equal(page.hasMore, true);
  });

  it('clamps limit to the on-disk cap', () => {
    const page = pageMessages(msgs(5), { offset: 0, limit: 500 });
    assert.equal(page.limit, MAX_MESSAGES);
    assert.equal(page.messages.length, 5);
  });
});
