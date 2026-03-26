/**
 * registry.ts – Tool Registry.
 *
 * Central registry for all tools the agentic loop can call.
 * Each tool has:
 * - A definition (name, description, parameters) for the LLM
 * - An execute function
 * - A danger flag (requires user confirmation before execution)
 */

import type { ToolDefinition } from '../core/types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('tools');

// ── Types ────────────────────────────────────────────────────

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  dangerous: boolean;
}

// ── Registry ─────────────────────────────────────────────────

const tools = new Map<string, RegisteredTool>();

/**
 * Register a tool for use in the agentic loop.
 */
export function registerTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  handler: ToolHandler,
  options: { dangerous?: boolean; required?: string[] } = {},
): void {
  if (tools.has(name)) {
    log.warn(`Tool "${name}" already registered – overwriting`);
  }

  tools.set(name, {
    definition: {
      type: 'function',
      function: {
        name,
        description,
        parameters: {
          type: 'object',
          properties: parameters,
          ...(options.required ? { required: options.required } : {}),
        },
      },
    },
    handler,
    dangerous: options.dangerous ?? false,
  });

  log.info(`Tool registered: ${name}`, { dangerous: options.dangerous ?? false });
}

/**
 * Get all tool definitions for the LLM.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values()).map((t) => t.definition);
}

/**
 * Check if a tool is marked as dangerous (requires confirmation).
 */
export function isDangerous(name: string): boolean {
  return tools.get(name)?.dangerous ?? false;
}

/**
 * Execute a tool by name with the given arguments.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  log.debug(`Executing tool: ${name}`, { args });
  const result = await tool.handler(args);
  log.debug(`Tool result: ${name}`, { resultPreview: String(result).slice(0, 200) });
  return result;
}

/**
 * Get list of registered tool names.
 */
export function getToolNames(): string[] {
  return Array.from(tools.keys());
}
