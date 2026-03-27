/**
 * registry.ts – Tool Registry.
 *
 * Central registry for all tools the agentic loop can call.
 * Each tool has:
 * - A definition (name, description, parameters) for the LLM
 * - An execute function
 * - A danger flag (requires user confirmation before execution)
 * - An enabled flag (disabled tools are not sent to the LLM)
 *
 * Disabled-tools list is persisted to /data/store/disabled-tools.json.
 */

import type { ToolDefinition } from '../core/types.js';
import { createLogger } from '../core/logger.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const log = createLogger('tools');

// ── Types ────────────────────────────────────────────────────

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  dangerous: boolean;
  enabled: boolean;
}

export interface ToolInfo {
  name: string;
  description: string;
  dangerous: boolean;
  enabled: boolean;
}

// ── Registry ─────────────────────────────────────────────────

const tools = new Map<string, RegisteredTool>();
const STORE_DIR = process.env['HA_CLAW_DATA'] || '/data/store';
const DISABLED_FILE = join(STORE_DIR, 'disabled-tools.json');

/** Load disabled-tools set from disk. */
async function loadDisabledSet(): Promise<Set<string>> {
  try {
    const raw = await readFile(DISABLED_FILE, 'utf-8');
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/** Persist disabled-tools set to disk. */
async function saveDisabledSet(): Promise<void> {
  const disabled = Array.from(tools.entries())
    .filter(([, t]) => !t.enabled)
    .map(([name]) => name);
  try {
    await mkdir(STORE_DIR, { recursive: true });
    await writeFile(DISABLED_FILE, JSON.stringify(disabled, null, 2));
  } catch (err) {
    log.warn('Failed to save disabled-tools', { error: String(err) });
  }
}

/** Apply persisted disabled state after all tools are registered. */
export async function applyDisabledTools(): Promise<void> {
  const disabled = await loadDisabledSet();
  for (const name of disabled) {
    const tool = tools.get(name);
    if (tool) {
      tool.enabled = false;
      log.info(`Tool disabled (from config): ${name}`);
    }
  }
}

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
    enabled: true, // enabled by default, applyDisabledTools() overrides later
  });

  log.info(`Tool registered: ${name}`, { dangerous: options.dangerous ?? false });
}

/**
 * Get all tool definitions for the LLM (only enabled tools).
 */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values())
    .filter((t) => t.enabled)
    .map((t) => t.definition);
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
  if (!tool.enabled) {
    throw new Error(`Tool "${name}" is disabled.`);
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

/**
 * Get detailed info for all tools (for UI).
 */
export function getToolInfos(): ToolInfo[] {
  return Array.from(tools.entries()).map(([name, t]) => ({
    name,
    description: t.definition.function.description,
    dangerous: t.dangerous,
    enabled: t.enabled,
  }));
}

/**
 * Enable or disable a tool. Persists to disk.
 */
export async function setToolEnabled(name: string, enabled: boolean): Promise<boolean> {
  const tool = tools.get(name);
  if (!tool) return false;
  tool.enabled = enabled;
  log.info(`Tool ${enabled ? 'enabled' : 'disabled'}: ${name}`);
  await saveDisabledSet();
  return true;
}
