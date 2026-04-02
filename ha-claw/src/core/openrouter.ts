/**
 * openrouter.ts – OpenRouter API client.
 *
 * All LLM calls go through OpenRouter (https://openrouter.ai/api/v1).
 * The API is OpenAI-compatible, supporting function/tool calling.
 *
 * Features:
 * - Retry with exponential backoff (3 attempts)
 * - Configurable timeout (30s default)
 * - Token usage logging
 */

import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import type { ChatMessage, ToolDefinition, OpenRouterResponse } from './types.js';

const log = createLogger('openrouter');

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

interface CallOptions {
  model?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Send a chat completion request to OpenRouter.
 */
export async function callLLM(
  messages: ChatMessage[],
  options: CallOptions = {},
): Promise<OpenRouterResponse> {
  const model = options.model ?? appConfig.openRouterDefaultModel;

  const body = JSON.stringify({
    model,
    messages,
    ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appConfig.openRouterApiKey}`,
          'HTTP-Referer': 'https://github.com/ha-claw',
          'X-Title': 'HA-Claw',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${errorBody}`);
      }

      const data = (await res.json()) as OpenRouterResponse;

      // Log token usage
      if (data.usage) {
        log.debug('LLM response', {
          model,
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          attempt,
        });
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(`LLM call failed (attempt ${attempt}/${MAX_RETRIES})`, {
        error: lastError.message,
      });

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  throw new Error(`OpenRouter failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
