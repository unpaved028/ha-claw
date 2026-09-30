import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUsage,
  costTotals,
  estimateCostUsd,
  resolveRequestCost,
  type UsageStats,
} from '../src/storage/usage-tracker.js';

function stats(partial: Partial<UsageStats> = {}): UsageStats {
  return {
    id: 'global',
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    numRequests: 0,
    createdAt: 't',
    updatedAt: 't',
    ...partial,
  };
}

describe('request cost', () => {
  it('stores a reported cost of zero as billed', () => {
    const cost = resolveRequestCost(0, 1000, 1000, 'openrouter/free');
    assert.deepEqual(cost, { usd: 0, source: 'billed' });
  });

  it('stores a positive reported cost as billed', () => {
    const cost = resolveRequestCost(0.25, 10, 10, 'anthropic/claude-haiku-4.5');
    assert.deepEqual(cost, { usd: 0.25, source: 'billed' });
  });

  it('falls back to the price table when cost is missing, NaN or negative', () => {
    const expected = estimateCostUsd(1_000_000, 1_000_000, 'anthropic/claude-haiku-4.5');
    assert.equal(expected, 6);
    for (const reported of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -0.01]) {
      assert.deepEqual(
        resolveRequestCost(reported, 1_000_000, 1_000_000, 'anthropic/claude-haiku-4.5'),
        { usd: 6, source: 'estimated' },
      );
    }
  });

  it('treats a record from before the split as entirely estimated', () => {
    const legacy = stats({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      totalCostUsd: 0.5,
      numRequests: 2,
    });
    assert.equal(costTotals(legacy).kind, 'estimated');
    assert.equal(costTotals(legacy).estimatedCostUsd, 0.5);
    assert.equal(costTotals(legacy).billedCostUsd, 0);

    applyUsage(legacy, 10, 5, { usd: 0.25, source: 'billed' });
    assert.equal(legacy.estimatedCostUsd, 0.5);
    assert.equal(legacy.billedCostUsd, 0.25);
    assert.equal(legacy.estimatedRequests, 2);
    assert.equal(legacy.billedRequests, 1);
    assert.equal(legacy.numRequests, 3);
    assert.equal(legacy.totalCostUsd, 0.75);
    assert.equal(costTotals(legacy).kind, 'mixed');
  });

  it('labels a run of reported costs as billed, including a free model', () => {
    const record = stats({
      billedCostUsd: 0,
      estimatedCostUsd: 0,
      billedRequests: 0,
      estimatedRequests: 0,
    });
    applyUsage(record, 10, 10, { usd: 0, source: 'billed' });
    applyUsage(record, 10, 10, { usd: 0.125, source: 'billed' });
    const totals = costTotals(record);
    assert.equal(totals.kind, 'billed');
    assert.equal(totals.billedCostUsd, 0.125);
    assert.equal(totals.estimatedCostUsd, 0);
    assert.equal(totals.billedRequests, 2);
  });
});
