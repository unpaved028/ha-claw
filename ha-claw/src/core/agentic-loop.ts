/**
 * agentic-loop.ts – Core AI reasoning loop.
 *
 * Flow: User message → LLM → (Tool call → Execute → LLM)* → Final answer
 *
 * Self-improvement integrations:
 * - Relevant corrections injected into system prompt
 * - Prompt patches (learned rules) injected
 * - Error context (recurring failures) injected
 * - Usage patterns injected
 * - Tool usage tracked for pattern detection
 * - Tool errors tracked for error summary
 *
 * SAFETY:
 * - MAX_ITERATIONS = 10 (non-negotiable hard limit)
 * - Dangerous tools require explicit user confirmation
 * - All tool results are logged
 */

import { callLLM } from './openrouter.js';
import { createLogger } from './logger.js';
import { getToolDefinitions, executeTool, isDangerous } from '../tools/registry.js';
import { searchCards, buildMemoryContext } from '../storage/memory-cards.js';
import {
  findRelevantCorrections, buildCorrectionContext,
  getActivePromptPatches, buildPatternContext, buildErrorContext,
  trackUsage, trackError,
} from '../storage/learning.js';
import type { ChatMessage, AgentConfig, LoopResult, ToolCall } from './types.js';

const log = createLogger('loop');

const MAX_ITERATIONS = 10; // Non-negotiable

/**
 * Confirmation callback type.
 * The agentic loop doesn't know about Telegram or Web UI –
 * it just calls this function and waits for a boolean.
 */
export type ConfirmationFn = (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

/** Default: auto-approve (used when no confirmation mechanism is available) */
const autoApprove: ConfirmationFn = async () => true;

/**
 * Run the agentic loop for a single user message.
 */
export async function runAgenticLoop(
  userMessage: string,
  agent: AgentConfig,
  confirmFn: ConfirmationFn = autoApprove,
  history: ChatMessage[] = [],
): Promise<LoopResult> {
  const toolDefs = getToolDefinitions();
  const toolCallLog: { name: string; result: string }[] = [];

  // Build enriched system prompt with all learning context
  let systemPrompt = agent.systemPrompt;

  // 1. Memory cards (relevant to this query)
  try {
    const memResults = await searchCards(userMessage, 3);
    const memContext = buildMemoryContext(memResults);
    if (memContext) {
      systemPrompt += '\n\n' + memContext;
      log.debug('Memory injected', { cards: memResults.length });
    }
  } catch { /* non-critical */ }

  // 2. Relevant corrections (learned from past mistakes)
  try {
    const corr = findRelevantCorrections(userMessage, 3);
    const corrContext = buildCorrectionContext(corr);
    if (corrContext) {
      systemPrompt += corrContext;
      log.debug('Corrections injected', { count: corr.length });
    }
  } catch { /* non-critical */ }

  // 3. Prompt patches (dynamic rules)
  try {
    const patches = getActivePromptPatches();
    if (patches) systemPrompt += patches;
  } catch { /* non-critical */ }

  // 4. Usage patterns
  try {
    const patterns = buildPatternContext();
    if (patterns) systemPrompt += patterns;
  } catch { /* non-critical */ }

  // 5. Error context (recurring failures)
  try {
    const errors = buildErrorContext();
    if (errors) systemPrompt += errors;
  } catch { /* non-critical */ }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  log.info('Loop started', { agent: agent.name, tools: toolDefs.length, history: history.length });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // 1. Call LLM
    const response = await callLLM(messages, {
      model: agent.model,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { response: 'Empty LLM response.', iterations: i + 1, toolCalls: toolCallLog };
    }

    const assistantMsg = choice.message;

    // 2. Final answer?
    if (choice.finish_reason === 'stop' || !assistantMsg.tool_calls?.length) {
      log.info('Loop completed', { iterations: i + 1, toolCalls: toolCallLog.length });
      return {
        response: sanitizeResponse(assistantMsg.content ?? '(keine Antwort)'),
        iterations: i + 1,
        toolCalls: toolCallLog,
      };
    }

    // 3. Process tool calls
    messages.push({
      role: 'assistant',
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls,
    });

    for (const call of assistantMsg.tool_calls) {
      const result = await executeWithSafetyGate(call, confirmFn);
      toolCallLog.push({ name: call.function.name, result: truncate(result, 500) });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  log.warn('Max iterations reached', { max: MAX_ITERATIONS });
  return {
    response: 'Maximale Iterationen erreicht. Loop wurde aus Sicherheitsgründen beendet.',
    iterations: MAX_ITERATIONS,
    toolCalls: toolCallLog,
  };
}

/**
 * Execute a tool call with safety gate for dangerous tools.
 * Tracks usage and errors for the learning system.
 */
async function executeWithSafetyGate(
  call: ToolCall,
  confirmFn: ConfirmationFn,
): Promise<string> {
  const name = call.function.name;
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return JSON.stringify({ error: `Invalid JSON arguments for tool ${name}` });
  }

  // Safety Gate
  if (isDangerous(name)) {
    log.info('Dangerous tool – requesting confirmation', { tool: name, args });
    const approved = await confirmFn(name, args);
    if (!approved) {
      log.info('Tool call DENIED by user', { tool: name });
      return JSON.stringify({ error: 'User denied this action.' });
    }
    log.info('Tool call APPROVED by user', { tool: name });
  }

  try {
    const result = await executeTool(name, args);

    // Track usage for pattern detection (HA service calls)
    if (name === 'ha_call_service' || name === 'ha_call_service_dangerous') {
      const entityId = String(args['entity_id'] ?? '');
      const service = String(args['service'] ?? '');
      if (entityId && service) {
        trackUsage(`${args['domain']}.${service}`, entityId).catch(() => {});
      }
    }

    return JSON.stringify(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error('Tool execution failed', { tool: name, error: errMsg });

    // Track error for learning
    const entityId = String(args['entity_id'] ?? '');
    trackError(name, errMsg, entityId || undefined).catch(() => {});

    return JSON.stringify({ error: errMsg });
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/**
 * Strip raw tool-call syntax that weaker LLMs sometimes inject into text.
 */
function sanitizeResponse(text: string): string {
  let s = text;
  s = s.replace(/OLCALL>[\s\S]*?ALL>/g, '');
  s = s.replace(/```tool_code[\s\S]*?```/g, '');
  s = s.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
  s = s.replace(/<function_call>[\s\S]*?<\/function_call>/g, '');
  s = s.replace(/\[TOOL_CALLS\][\s\S]*?(?:\[\/TOOL_CALLS\]|$)/g, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}
