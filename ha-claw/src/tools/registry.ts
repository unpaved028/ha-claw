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
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteJson, withPathLock } from '../storage/atomic-write.js';
import { validateToolArgs } from './validate-args.js';

const log = createLogger('tools');

/** A hung tool must not stall the agentic loop or the HTTP request. */
const TOOL_TIMEOUT_MS = 15_000;

export function clampLimit(value: unknown, fallback: number, min = 1, max = 200): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ── Types ────────────────────────────────────────────────────

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  dangerous: boolean;
  enabled: boolean;
  complexity: 1 | 2 | 3;
}

export interface ToolInfo {
  name: string;
  description: string;
  dangerous: boolean;
  enabled: boolean;
  complexity: 1 | 2 | 3;
}

// ── Registry ─────────────────────────────────────────────────

const tools = new Map<string, RegisteredTool>();
const STORE_DIR = join(appConfig.dataPath, 'store');
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
    await withPathLock(DISABLED_FILE, () => atomicWriteJson(DISABLED_FILE, disabled));
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
  options: { dangerous?: boolean; required?: string[]; complexity?: 1 | 2 | 3 } = {},
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
    complexity: options.complexity ?? 1,
  });

  log.info(`Tool registered: ${name}`, { dangerous: options.dangerous ?? false });
}

/**
 * Get all tool definitions for the LLM (only enabled tools).
 */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values())
    .filter(t => t.enabled)
    .map(t => t.definition);
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
export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!tool.enabled) {
    throw new Error(`Tool "${name}" is disabled.`);
  }

  const schemaError = validateToolArgs(tool.definition.function.parameters, args);
  if (schemaError) {
    throw new Error(`Invalid arguments for "${name}": ${schemaError}`);
  }

  log.debug(`Executing tool: ${name}`, { args });
  const result = await withTimeout(tool.handler(args), TOOL_TIMEOUT_MS, `Tool "${name}"`);
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
    complexity: t.complexity,
  }));
}

/**
 * Get the complexity level of a tool.
 */
export function getToolComplexity(name: string): 1 | 2 | 3 {
  return tools.get(name)?.complexity ?? 1;
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
