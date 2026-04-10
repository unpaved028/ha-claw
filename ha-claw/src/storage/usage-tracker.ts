/**
 * usage-tracker.ts – Track token usage and estimated costs globally.
 *
 * Keeps a single 'global' record to monitor total usage across models.
 */

import * as store from './json-store.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('usage');

// Estimations ($ / 1M tokens) – average across Claude Haiku/Sonnet models on OpenRouter
const COST_PROMPT = 0.25;
const COST_COMPLETION = 0.75;

export interface UsageStats extends store.StoredRecord {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  numRequests: number;
}

/** Track usage from a single LLM request. */
export async function trackUsage(promptTokens: number, completionTokens: number): Promise<void> {
  try {
    const stats = (await store.read<UsageStats>('usage', 'global')) || {
      id: 'global',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      numRequests: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cost = (promptTokens * COST_PROMPT + completionTokens * COST_COMPLETION) / 1_000_000;

    stats.promptTokens += promptTokens;
    stats.completionTokens += completionTokens;
    stats.totalTokens += promptTokens + completionTokens;
    stats.totalCostUsd += cost;
    stats.numRequests += 1;

    await store.upsert('usage', 'global', stats);
  } catch (err) {
    log.error('Failed to track usage', { error: String(err) });
  }
}

/** Retrieve the current global usage stats. */
export async function getGlobalStats(): Promise<UsageStats | null> {
  return store.read<UsageStats>('usage', 'global');
}
