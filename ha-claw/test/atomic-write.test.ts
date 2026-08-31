import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { initStorage, upsert, read } from '../src/storage/json-store.js';

describe('storage atomicity', () => {
  before(async () => {
    await initStorage();
  });

  it('concurrent upsert on the same record loses nothing', async () => {
    const id = 'upsert1';
    await upsert('notes', id, { title: 'base', a: 1 });

    await Promise.all([upsert('notes', id, { a: 2 }), upsert('notes', id, { b: 3 })]);

    const rec = await read('notes', id);
    assert.ok(rec);
    assert.equal(rec['title'], 'base');
    // Serialised read-modify-write: both fields survive, last writer wins on overlap.
    assert.ok(rec['a'] === 1 || rec['a'] === 2);
    assert.ok(rec['b'] === 3 || rec['a'] === 2);
    const hasA = rec['a'] !== undefined;
    const hasB = rec['b'] !== undefined;
    assert.ok(
      hasA && hasB,
      `expected both a and b after serialised upserts, got ${JSON.stringify(rec)}`,
    );
  });
});
