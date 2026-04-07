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
import { trackUsage } from '../storage/usage-tracker.js';

const log = createLogger('openrouter');

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

// ── Circuit Breaker ──────────────────────────────────────────
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000; // 60 seconds open, then half-open probe

export interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  remainingMs: number;
}

export function getCircuitBreakerState(): CircuitBreakerState {
  const now = Date.now();
  return {
    isOpen: now < circuitOpenUntil,
    failures: consecutiveFailures,
    remainingMs: Math.max(0, circuitOpenUntil - now),
  };
}

interface CallOptions {
  model?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  onStreamChunk?: (chunk: string) => void;
}

/**
 * Send a chat completion request to OpenRouter.
 */
export async function callLLM(
  messages: ChatMessage[],
  options: CallOptions = {},
): Promise<OpenRouterResponse> {
  const model = options.model ?? appConfig.openRouterDefaultModel;

  // ── Circuit Breaker Check ──────────────────────────────────
  const now = Date.now();
  if (now < circuitOpenUntil) {
    const remaining = Math.round((circuitOpenUntil - now) / 1000);
    throw new Error(`Circuit breaker offen – OpenRouter pausiert (noch ${remaining}s). Bitte später erneut versuchen.`);
  }

  const body = JSON.stringify({
    model,
    messages,
    ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    ...(options.onStreamChunk ? { stream: true } : {}),
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

      let data: OpenRouterResponse;

      if (options.onStreamChunk && res.body) {
        // ── Stream Parsing ────────────────────────────
        data = await parseStream(res.body, options.onStreamChunk);
      } else {
        // ── Standard JSON ─────────────────────────────
        data = (await res.json()) as OpenRouterResponse;
      }

      // ✔️ Success: reset circuit breaker
      consecutiveFailures = 0;

      // Log token usage (Note: streaming might not return usage stats from all endpoints)
      if (data.usage) {
        log.debug('LLM response', {
          model,
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          attempt,
        });

        // Fire & Forget: Update global usage stats
        trackUsage(data.usage.prompt_tokens, data.usage.completion_tokens);
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

  // ❌ All retries exhausted: update circuit breaker
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    log.error('Circuit breaker OPENED', {
      failures: consecutiveFailures,
      pauseSeconds: CIRCUIT_OPEN_MS / 1000,
    });
  }

  throw new Error(`OpenRouter failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Parses an SSE stream from fetch response body, accumulating chunks and tool calls.
 */
async function parseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void
): Promise<OpenRouterResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let contentBuffer = '';
  // Array to accumulate incremental tool call chunks
  let activeToolCalls: any[] = [];
  let finishReason = 'stop';
  let responseId = '';
  
  let incompleteLine = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunkStr = decoder.decode(value, { stream: true });
    const lines = (incompleteLine + chunkStr).split('\n');
    incompleteLine = lines.pop() ?? ''; // last line might be incomplete

    for (let line of lines) {
      line = line.trim();
      if (!line.startsWith('data: ')) continue;
      
      const jsonStr = line.slice(6);
      if (jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.id) responseId = parsed.id;
        
        const choice = parsed.choices?.[0];
        if (choice) {
          if (choice.finish_reason) finishReason = choice.finish_reason;
          
          const delta = choice.delta;
          if (delta) {
            if (delta.content) {
              contentBuffer += delta.content;
              onChunk(delta.content);
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!activeToolCalls[index]) {
                  activeToolCalls[index] = {
                    id: tc.id,
                    type: tc.type || 'function',
                    function: { name: tc.function?.name || '', arguments: '' }
                  };
                }
                if (tc.function?.name) {
                  activeToolCalls[index].function.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  activeToolCalls[index].function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }
      } catch (e) {
        // ignore malformed JSON in SSE
      }
    }
  }

  // Cleanup array to simple flat list
  const tool_calls = activeToolCalls.filter(Boolean);

  return {
    id: responseId,
    choices: [
      {
        message: {
          role: 'assistant',
          content: contentBuffer || null,
          ...(tool_calls.length > 0 ? { tool_calls } : {})
        },
        finish_reason: finishReason as any,
      }
    ],
    // Usage is usually not included in standard SSE unless requested explicitly (e.g. format options in OpenRouter)
    // We omit it or return empty/estimate if needed, currently omitted so it skips tracking.
  };
}
