import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_MEMORY_SCORE,
  keywordScore,
  rankCards,
  tokenize,
  type MemoryCard,
} from '../src/storage/memory-cards.js';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');

function card(partial: Partial<MemoryCard> & Pick<MemoryCard, 'content'>): MemoryCard {
  const iso = new Date(NOW).toISOString();
  return {
    id: partial.id ?? 'card-1',
    title: partial.title ?? '',
    content: partial.content,
    category: partial.category ?? 'fact',
    tags: partial.tags ?? [],
    ttlDays: 0,
    accessCount: 0,
    lastAccessedAt: iso,
    version: 1,
    previousContent: null,
    createdAt: iso,
    updatedAt: iso,
    ...partial,
  };
}

describe('tokenize', () => {
  it('keeps tokens longer than two characters', () => {
    assert.deepEqual(tokenize('art start to'), ['art', 'start']);
  });
});

describe('keywordScore', () => {
  it('does not treat art as a hit inside start', () => {
    assert.equal(
      keywordScore(card({ content: 'Please start the dishwasher' }), tokenize('art')),
      0,
    );
  });

  it('scores an exact content token', () => {
    assert.equal(
      keywordScore(card({ content: 'We like modern art in the hall' }), tokenize('art')),
      0.5,
    );
  });

  it('scores an exact title token higher than content', () => {
    assert.equal(
      keywordScore(card({ title: 'Art gallery lighting', content: 'whatever' }), tokenize('art')),
      2.0,
    );
  });
});

describe('rankCards', () => {
  it('drops a substring-only content match', () => {
    const results = rankCards([card({ content: 'Please start the dishwasher' })], 'art', 5, NOW);
    assert.equal(results.length, 0);
  });

  it('keeps a whole-token content match', () => {
    const results = rankCards([card({ content: 'We like modern art in the hall' })], 'art', 5, NOW);
    assert.equal(results.length, 1);
    assert.ok(results[0].score >= MIN_MEMORY_SCORE);
  });

  it('does not rank a recent preference with no keyword overlap', () => {
    const results = rankCards(
      [card({ content: 'Leave the porch light on after dusk', category: 'preference' })],
      'art',
      5,
      NOW,
    );
    assert.equal(results.length, 0);
  });
});
