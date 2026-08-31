import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countTokens, pruneMessages, toolCallsArePaired } from '../src/core/context-manager.js';
import type { ChatMessage } from '../src/core/types.js';

function toolPair(id: string, pad = 'x'.repeat(80)): ChatMessage[] {
  return [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id, type: 'function', function: { name: 'ha_get_state', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: id, content: pad },
  ];
}

describe('pruneMessages', () => {
  it('keeps the system message and stays under budget', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a'.repeat(200) },
      { role: 'assistant', content: 'b'.repeat(200) },
      { role: 'user', content: 'c'.repeat(200) },
      { role: 'assistant', content: 'd'.repeat(200) },
      { role: 'user', content: 'recent' },
      { role: 'assistant', content: 'ok' },
    ];
    const pruned = pruneMessages(messages, 80);
    assert.equal(pruned[0]?.role, 'system');
    assert.ok(countTokens(pruned) <= 80);
    assert.ok(toolCallsArePaired(pruned));
  });

  it('never leaves a tool result without its assistant tool_calls', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'one' },
      ...toolPair('call-old', 'old'.repeat(100)),
      { role: 'user', content: 'two' },
      ...toolPair('call-new', 'new'.repeat(100)),
      { role: 'assistant', content: 'final' },
    ];
    const pruned = pruneMessages(messages, 60);
    assert.ok(toolCallsArePaired(pruned));
    const toolIds = pruned.filter(m => m.role === 'tool').map(m => m.tool_call_id);
    for (const id of toolIds) {
      assert.ok(
        pruned.some(m => m.role === 'assistant' && m.tool_calls?.some(c => c.id === id)),
        `orphaned tool result ${id}`,
      );
    }
  });

  it('does not prune when already under budget', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    assert.equal(pruneMessages(messages, 10_000), messages);
  });
});
