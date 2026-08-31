/**
 * config-change.ts – Safe write path for automations and scripts.
 *
 * Confirmation used to show a JSON blob. That is a coin flip. This module
 * builds a YAML diff, lists what else references the involved entities, and
 * refuses a config that fails the structural check before HA is touched.
 */

import * as ha from './ha-client.js';
import { toYaml, unifiedDiff } from './yaml-text.js';
import { createLogger } from './logger.js';

const log = createLogger('config-change');

const ENTITY_ID_RE = /\b([a-z][a-z0-9_]+)\.([a-z0-9_]+)\b/g;
const CONFIG_CONCURRENCY = 6;

export type ConfigKind = 'automation' | 'script';

export interface ConfirmPreview {
  kind?: 'config_write';
  title?: string;
  yamlDiff?: string;
  blastRadius?: { label: string; entities: string[] }[];
  validationErrors?: string[];
  currentMissing?: boolean;
}

export interface ConfigSnapshot {
  kind: ConfigKind;
  id: string;
  config: Record<string, unknown>;
}

const AUTOMATION_KEYS = new Set([
  'id',
  'alias',
  'description',
  'triggers',
  'trigger',
  'conditions',
  'condition',
  'actions',
  'action',
  'mode',
  'max',
  'max_exceeded',
  'variables',
  'trace',
  'initial_state',
]);

const SCRIPT_KEYS = new Set([
  'alias',
  'description',
  'sequence',
  'fields',
  'mode',
  'max',
  'max_exceeded',
  'icon',
  'variables',
  'trace',
]);

function collectEntityIds(value: unknown, key?: string, into = new Set<string>()): Set<string> {
  if (value == null) return into;
  if (typeof value === 'string') {
    if (key === 'entity_id' || key === 'entity_ids' || key === 'entity') {
      if (value.includes('.')) into.add(value);
    }
    if (value.includes('{{') || value.includes('states(') || key === undefined) {
      for (const m of value.matchAll(ENTITY_ID_RE)) into.add(m[0]);
    }
    return into;
  }
  if (Array.isArray(value)) {
    const childKey = key === 'entity_id' || key === 'entity_ids' ? 'entity_id' : key;
    for (const v of value) collectEntityIds(v, childKey, into);
    return into;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectEntityIds(v, k, into);
    }
  }
  return into;
}

export function extractEntityIds(config: unknown): string[] {
  return [...collectEntityIds(config)].sort();
}

export function validateAutomationConfig(config: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const triggers = config['triggers'] ?? config['trigger'];
  const actions = config['actions'] ?? config['action'];
  if (triggers == null || (Array.isArray(triggers) && triggers.length === 0)) {
    errors.push('Automation needs at least one trigger.');
  }
  if (actions == null || (Array.isArray(actions) && actions.length === 0)) {
    errors.push('Automation needs at least one action.');
  }
  const unknown = Object.keys(config).filter(k => !AUTOMATION_KEYS.has(k));
  if (unknown.length > 0) {
    errors.push(`Unknown automation keys: ${unknown.slice(0, 8).join(', ')}.`);
  }
  const mode = config['mode'];
  if (mode != null && !['single', 'restart', 'queued', 'parallel'].includes(String(mode))) {
    errors.push(`Invalid mode "${String(mode)}".`);
  }
  return errors;
}

export function validateScriptConfig(config: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const sequence = config['sequence'];
  if (sequence == null || (Array.isArray(sequence) && sequence.length === 0)) {
    errors.push('Script needs a non-empty sequence.');
  }
  const unknown = Object.keys(config).filter(k => !SCRIPT_KEYS.has(k));
  if (unknown.length > 0) {
    errors.push(`Unknown script keys: ${unknown.slice(0, 8).join(', ')}.`);
  }
  return errors;
}

export function validateConfig(kind: ConfigKind, config: Record<string, unknown>): string[] {
  return kind === 'automation' ? validateAutomationConfig(config) : validateScriptConfig(config);
}

function configKindFromTool(toolName: string): ConfigKind | null {
  if (toolName === 'ha_save_automation_config') return 'automation';
  if (toolName === 'ha_save_script_config') return 'script';
  return null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

export async function findBlastRadius(
  entityIds: string[],
  skipId?: string,
): Promise<{ label: string; entities: string[] }[]> {
  if (entityIds.length === 0) return [];
  const wanted = new Set(entityIds);
  const states = (await ha.getStates()) as Array<{
    entity_id: string;
    attributes: Record<string, unknown>;
  }>;
  const autos = states.filter(s => s.entity_id.startsWith('automation.'));
  const scripts = states.filter(s => s.entity_id.startsWith('script.'));
  const scenes = states.filter(s => s.entity_id.startsWith('scene.'));

  const hits = new Map<string, Set<string>>();

  function add(label: string, entityId: string): void {
    const set = hits.get(label) ?? new Set<string>();
    set.add(entityId);
    hits.set(label, set);
  }

  for (const s of scenes) {
    const members = s.attributes['entity_id'];
    if (!Array.isArray(members)) continue;
    for (const m of members) {
      if (wanted.has(String(m))) add(s.entity_id, String(m));
    }
  }

  const uiTargets = [
    ...autos.map(s => ({
      kind: 'automation' as const,
      id: String(s.attributes['id'] ?? s.entity_id.split('.')[1] ?? ''),
      label: s.entity_id,
    })),
    ...scripts.map(s => ({
      kind: 'script' as const,
      id: String(s.attributes['id'] ?? s.entity_id.split('.')[1] ?? ''),
      label: s.entity_id,
    })),
  ].filter(t => t.id && t.id !== skipId);

  await mapPool(uiTargets, CONFIG_CONCURRENCY, async t => {
    const cfg = await ha.getUiConfig(t.kind, t.id);
    if (!cfg) return;
    for (const eid of extractEntityIds(cfg)) {
      if (wanted.has(eid)) add(t.label, eid);
    }
  });

  return [...hits.entries()]
    .map(([label, entities]) => ({ label, entities: [...entities].sort() }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'))
    .slice(0, 40);
}

export async function loadCurrentConfig(
  kind: ConfigKind,
  id: string,
): Promise<Record<string, unknown> | null> {
  return ha.getUiConfig(kind, id);
}

export async function buildConfigWritePreview(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConfirmPreview | null> {
  const kind = configKindFromTool(toolName);
  if (!kind) return null;
  const id = String(args['id'] ?? '');
  const next = args['config'];
  if (!id || !next || typeof next !== 'object' || Array.isArray(next)) {
    return { kind: 'config_write', validationErrors: ['id and config object are required.'] };
  }
  const config = next as Record<string, unknown>;
  const validationErrors = validateConfig(kind, config);
  const current = await loadCurrentConfig(kind, id);
  const oldYaml = current ? toYaml(current) : '';
  const newYaml = toYaml(config);
  const yamlDiff = unifiedDiff(
    oldYaml || '(empty)\n',
    newYaml,
    `${kind}/${id} (current)`,
    `${kind}/${id} (proposed)`,
  );
  const involved = new Set([...extractEntityIds(current), ...extractEntityIds(config)]);
  let blastRadius: ConfirmPreview['blastRadius'] = [];
  try {
    blastRadius = await findBlastRadius([...involved], id);
  } catch (err) {
    log.debug('Blast radius scan failed', { error: String(err) });
  }
  return {
    kind: 'config_write',
    title: `${kind} ${id}`,
    yamlDiff,
    blastRadius,
    validationErrors,
    currentMissing: current == null,
  };
}

export async function saveConfigWithSnapshot(
  kind: ConfigKind,
  id: string,
  config: Record<string, unknown>,
): Promise<{ success: true; snapshot: ConfigSnapshot | null } | { error: string }> {
  const errors = validateConfig(kind, config);
  if (errors.length > 0) return { error: errors.join(' ') };
  const previous = await loadCurrentConfig(kind, id);
  try {
    if (kind === 'automation') await ha.saveAutomationConfig(id, config);
    else await ha.saveScriptConfig(id, config);
  } catch (err) {
    return { error: String(err) };
  }
  return {
    success: true,
    snapshot: previous ? { kind, id, config: previous } : null,
  };
}

/** Plain-text preview for Telegram and logs. Truncated to stay under message limits. */
export function formatPreviewText(preview: ConfirmPreview, max = 1800): string {
  const parts: string[] = [];
  if (preview.title) parts.push(preview.title);
  if (preview.currentMissing) parts.push('Keine aktuelle Config gefunden (neu oder nur YAML).');
  if (preview.validationErrors && preview.validationErrors.length > 0) {
    parts.push('Ungültig: ' + preview.validationErrors.join(' '));
  }
  if (preview.yamlDiff) parts.push(preview.yamlDiff.trimEnd());
  if (preview.blastRadius && preview.blastRadius.length > 0) {
    parts.push('', 'Wird auch referenziert von:');
    for (const b of preview.blastRadius.slice(0, 10)) {
      parts.push(`- ${b.label} (${b.entities.join(', ')})`);
    }
  }
  const text = parts.join('\n');
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}

export async function restoreConfigSnapshot(snapshot: ConfigSnapshot): Promise<void> {
  if (snapshot.kind === 'automation') {
    await ha.saveAutomationConfig(snapshot.id, snapshot.config);
  } else {
    await ha.saveScriptConfig(snapshot.id, snapshot.config);
  }
}
