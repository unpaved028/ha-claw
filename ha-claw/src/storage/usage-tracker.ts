/**
 * usage-tracker.ts – Track token usage and estimated costs globally.
 *
 * Keeps a single 'global' record to monitor total usage across models.
 */

import * as store from './json-store.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('usage');

/**
 * Approximate OpenRouter list prices in USD per 1M tokens, as [prompt, completion].
 * These are estimates for display only – the authoritative number is the one on
 * the OpenRouter dashboard. A single flat rate was previously applied to every
 * model, which put the cost readout off by an order of magnitude on the larger
 * models.
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
  totalCostUsd: number;
  numRequests: number;
}

/** Track usage from a single LLM request. */
export async function trackUsage(
  promptTokens: number,
  completionTokens: number,
  model?: string,
): Promise<void> {
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

    const [costPrompt, costCompletion] = priceFor(model);
    const cost = (promptTokens * costPrompt + completionTokens * costCompletion) / 1_000_000;

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
