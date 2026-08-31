import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compressDomainLines, escapeRegExp } from '../src/core/entity-cache.js';

describe('compressDomainLines', () => {
  it('does not group fewer than three entities', () => {
    const lines = compressDomainLines('light', [
      { id: 'light.a', name: 'A', state: 'on' },
      { id: 'light.b', name: 'B', state: 'on' },
    ]);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /light\.a/);
  });

  it('groups three or more with the same state', () => {
    const lines = compressDomainLines('light', [
      { id: 'light.a', state: 'on' },
      { id: 'light.b', state: 'on' },
      { id: 'light.c', state: 'on' },
    ]);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /3× light/);
    assert.match(lines[0]!, /alle on/);
  });

  it('does not merge different states', () => {
    const lines = compressDomainLines('light', [
      { id: 'light.a', state: 'on' },
      { id: 'light.b', state: 'on' },
      { id: 'light.c', state: 'off' },
    ]);
    assert.ok(lines.length >= 2);
    assert.ok(!lines.some(l => l.includes('3×')));
  });
});

describe('escapeRegExp', () => {
  it('lets an area name with metacharacters match as a literal', () => {
    const area = 'küche (eg)';
    const re = new RegExp(escapeRegExp(area), 'i');
    assert.ok(re.test('mach das licht in der küche (eg) an'));
    assert.ok(!re.test('küche eg'), 'unescaped parentheses would be a group, not literals');
  });
});
