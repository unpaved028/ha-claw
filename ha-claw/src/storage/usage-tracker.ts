/**
 * usage-tracker.ts – Track token usage and request cost globally.
 *
 * Keeps a single 'global' record. When OpenRouter sends `usage.cost`, that
 * amount is stored as billed. Otherwise the price table below is an estimate
 * and stays labeled as one. A stored record from before the split has only
 * `totalCostUsd`; that whole total counts as estimated.
 */

import * as store from './json-store.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('usage');

/**
 * Approximate OpenRouter list prices in USD per 1M tokens, as [prompt, completion].
 * Used only when a response has no usable `usage.cost`. The OpenRouter dashboard
 * remains the invoice; this table is not one.
 */
const MODEL_PRICES: Record<string, [number, number]> = {
  'anthropic/claude-haiku-4.5': [1, 5],
  'anthropic/claude-sonnet-5': [2, 10],
  'anthropic/claude-opus-5': [5, 25],
  'google/gemini-3.7-flash': [0.38, 1.88],
  'google/gemini-3.5-flash-lite': [0.3, 2.5],
  'openai/gpt-5.6-luna': [0.2, 1.2],
  'openai/gpt-5.6-sol': [2, 10],
  'deepseek/deepseek-v4-flash': [0.09, 0.18],
  'x-ai/grok-4.6': [2, 6],
  'openrouter/free': [0, 0],
  // Still listed so leftover profile overrides from older versions estimate sanely.
  'anthropic/claude-opus-4.6': [5, 25],
  'anthropic/claude-sonnet-4.6': [3, 15],
  'google/gemini-3.1-pro-preview': [2, 12],
  'google/gemini-3-flash-preview': [0.5, 3],
  'google/gemini-3.1-flash-lite-preview': [0.25, 1.5],
  'openai/gpt-5.4': [2.5, 15],
  'openai/gpt-5.4-mini': [0.75, 4.5],
  'deepseek/deepseek-chat': [0.26, 1.03],
};

/** Fallback when the model is unknown – roughly a small/cheap model. */
const DEFAULT_PRICE: [number, number] = [0.25, 0.75];

function priceFor(model: string | undefined): [number, number] {
  if (!model) return DEFAULT_PRICE;
  return MODEL_PRICES[model] ?? DEFAULT_PRICE;
}

export interface UsageStats extends store.StoredRecord {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Billed plus estimated, so a reader that only knows this field still sees a sum. */
  totalCostUsd: number;
  /** Sum of `usage.cost` from OpenRouter. Absent on records written before the split. */
  billedCostUsd?: number;
  /** Price-table fallbacks. On an old record the whole `totalCostUsd` counts as this. */
  estimatedCostUsd?: number;
  billedRequests?: number;
  estimatedRequests?: number;
  numRequests: number;
}

export type CostSource = 'billed' | 'estimated';

export interface RequestCost {
  usd: number;
  source: CostSource;
}

export interface CostTotals {
  billedCostUsd: number;
  estimatedCostUsd: number;
  billedRequests: number;
  estimatedRequests: number;
  totalCostUsd: number;
  kind: 'billed' | 'estimated' | 'mixed';
}

/** Price-table cost in USD. */
export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  model?: string,
): number {
  const [costPrompt, costCompletion] = priceFor(model);
  return (promptTokens * costPrompt + completionTokens * costCompletion) / 1_000_000;
}

/**
 * Prefer OpenRouter's `usage.cost`. Zero is a real charge (a free model).
 * Missing, NaN, infinite or negative values fall back to the price table.
 */
export function resolveRequestCost(
  reportedCost: number | undefined,
  promptTokens: number,
  completionTokens: number,
  model?: string,
): RequestCost {
  if (typeof reportedCost === 'number' && Number.isFinite(reportedCost) && reportedCost >= 0) {
    return { usd: reportedCost, source: 'billed' };
  }
  return {
    usd: estimateCostUsd(promptTokens, completionTokens, model),
    source: 'estimated',
  };
}

function hasCostSplit(stats: UsageStats): boolean {
  return stats.billedCostUsd !== undefined || stats.estimatedCostUsd !== undefined;
}

/** Fold one request into a stats record. Migrates a pre-split total into the estimate bucket. */
export function applyUsage(
  stats: UsageStats,
  promptTokens: number,
  completionTokens: number,
  cost: RequestCost,
): void {
  if (!hasCostSplit(stats)) {
    stats.estimatedCostUsd = stats.totalCostUsd;
    stats.billedCostUsd = 0;
    stats.estimatedRequests = stats.numRequests;
    stats.billedRequests = 0;
  }

  stats.promptTokens += promptTokens;
  stats.completionTokens += completionTokens;
  stats.totalTokens += promptTokens + completionTokens;
  stats.numRequests += 1;

  if (cost.source === 'billed') {
    stats.billedCostUsd = (stats.billedCostUsd ?? 0) + cost.usd;
    stats.billedRequests = (stats.billedRequests ?? 0) + 1;
  } else {
    stats.estimatedCostUsd = (stats.estimatedCostUsd ?? 0) + cost.usd;
    stats.estimatedRequests = (stats.estimatedRequests ?? 0) + 1;
  }

  stats.totalCostUsd = (stats.billedCostUsd ?? 0) + (stats.estimatedCostUsd ?? 0);
}

/** How `/status` should label the stored dollars. */
export function costTotals(stats: UsageStats): CostTotals {
  const split = hasCostSplit(stats);
  const billedCostUsd = stats.billedCostUsd ?? 0;
  const estimatedCostUsd = split ? (stats.estimatedCostUsd ?? 0) : stats.totalCostUsd;
  const billedRequests = stats.billedRequests ?? 0;
  const estimatedRequests = split ? (stats.estimatedRequests ?? 0) : stats.numRequests;
  const billed = billedRequests > 0 || billedCostUsd > 0;
  const estimated = estimatedRequests > 0 || estimatedCostUsd > 0;
  let kind: CostTotals['kind'] = 'estimated';
  if (billed && estimated) kind = 'mixed';
  else if (billed) kind = 'billed';
  return {
    billedCostUsd,
    estimatedCostUsd,
    billedRequests,
    estimatedRequests,
    totalCostUsd: billedCostUsd + estimatedCostUsd,
    kind,
  };
}

function blankStats(): UsageStats {
  const now = new Date().toISOString();
  return {
    id: 'global',
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    billedCostUsd: 0,
    estimatedCostUsd: 0,
    billedRequests: 0,
    estimatedRequests: 0,
    numRequests: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Track usage from a single LLM request. `reportedCost` is OpenRouter's `usage.cost`. */
export async function trackUsage(
  promptTokens: number,
  completionTokens: number,
  model?: string,
  reportedCost?: number,
): Promise<void> {
  try {
    const stats = (await store.read<UsageStats>('usage', 'global')) || blankStats();
    applyUsage(
      stats,
      promptTokens,
      completionTokens,
      resolveRequestCost(reportedCost, promptTokens, completionTokens, model),
    );
    await store.upsert('usage', 'global', stats);
  } catch (err) {
    log.error('Failed to track usage', { error: String(err) });
  }
}

/** Retrieve the current global usage stats. */
export async function getGlobalStats(): Promise<UsageStats | null> {
  return store.read<UsageStats>('usage', 'global');
}
