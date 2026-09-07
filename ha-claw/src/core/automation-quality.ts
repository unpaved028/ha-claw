/**
 * automation-quality.ts – Best-practice linter over UI automation configs.
 *
 * Findings that we can prove from the config, not from the name:
 * device_id triggers without entity_id, motion lights in mode single, and
 * numeric comparisons written as templates. YAML-only automations are skipped
 * — we do not have their triggers.
 */

import * as ha from './ha-client.js';
import { t } from './strings.js';
import {
  getAutomationIndex,
  type AutomationIndex,
  type HaLikeState,
  type IndexedConfig,
} from './automation-index.js';

export type QualityKind = 'device_id_trigger' | 'motion_mode_single' | 'numeric_as_template';

export interface QualityIssue {
  key: string;
  kind: QualityKind;
  entityId: string;
  label: string;
  detail: string;
  suggestedFix: string;
}

export interface QualityReport {
  checkedAt: string;
  uiScanned: number;
  yamlOnly: number;
  issues: QualityIssue[];
}

function asList(raw: unknown): unknown[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function containsBareDeviceId(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsBareDeviceId);
  const row = value as Record<string, unknown>;
  const device = row['device_id'] ?? row['device'];
  const entity = row['entity_id'] ?? row['entity_ids'] ?? row['entity'];
  const hasDevice = typeof device === 'string' && device.length >= 16;
  const hasEntity =
    (typeof entity === 'string' && entity.includes('.')) ||
    (Array.isArray(entity) && entity.some(e => typeof e === 'string' && e.includes('.')));
  if (hasDevice && !hasEntity) return true;
  return Object.values(row).some(containsBareDeviceId);
}

export function triggerOrConditionHasBareDeviceId(config: Record<string, unknown>): boolean {
  const blocks = [
    ...asList(config['triggers'] ?? config['trigger']),
    ...asList(config['conditions'] ?? config['condition']),
  ];
  return blocks.some(containsBareDeviceId);
}

export function hasDelayOrFor(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasDelayOrFor);
  const row = value as Record<string, unknown>;
  if (row['for'] != null || row['delay'] != null) return true;
  return Object.values(row).some(hasDelayOrFor);
}

export function looksLikeNumericTemplate(text: string): boolean {
  const lower = text.toLowerCase();
  const hasCast = lower.includes('float') || /\| *int\b/.test(lower);
  return hasCast && /[<>]=?/.test(text);
}

export function hasNumericTemplateComparison(value: unknown, key?: string): boolean {
  if (typeof value === 'string') {
    if (
      (key === 'wait_template' || key === 'value_template' || key === 'value') &&
      looksLikeNumericTemplate(value)
    ) {
      return true;
    }
    return false;
  }
  if (Array.isArray(value)) return value.some(v => hasNumericTemplateComparison(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) =>
      hasNumericTemplateComparison(v, k),
    );
  }
  return false;
}

function deviceClass(s: HaLikeState): string {
  return String(s.attributes?.['device_class'] ?? '').toLowerCase();
}

function motionEntityIds(states: HaLikeState[]): Set<string> {
  const ids = new Set<string>();
  for (const s of states) {
    if (!s.entity_id.startsWith('binary_sensor.')) continue;
    const dc = deviceClass(s);
    if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') ids.add(s.entity_id);
  }
  return ids;
}

function issue(
  rec: IndexedConfig,
  kind: QualityKind,
  detailKey: string,
  fixKey: string,
): QualityIssue {
  return {
    key: `${kind}:${rec.entityId}`,
    kind,
    entityId: rec.entityId,
    label: rec.label,
    detail: t(detailKey, { name: rec.label }),
    suggestedFix: t(fixKey),
  };
}

export function findQualityIssues(index: AutomationIndex, states: HaLikeState[]): QualityIssue[] {
  const motionIds = motionEntityIds(states);
  const issues: QualityIssue[] = [];

  for (const rec of index.automations) {
    if (rec.yamlOnly) continue;
    const cfg = rec.config;

    if (triggerOrConditionHasBareDeviceId(cfg)) {
      issues.push(issue(rec, 'device_id_trigger', 'quality.deviceId', 'quality.deviceIdFix'));
    }

    const touchesMotion = rec.entityRefs.some(id => motionIds.has(id));
    const modeOk = rec.mode === 'restart' || rec.mode === 'queued' || rec.mode === 'parallel';
    if (touchesMotion && hasDelayOrFor(cfg) && !modeOk) {
      issues.push(issue(rec, 'motion_mode_single', 'quality.motionMode', 'quality.motionModeFix'));
    }

    if (hasNumericTemplateComparison(cfg)) {
      issues.push(
        issue(rec, 'numeric_as_template', 'quality.numericTemplate', 'quality.numericTemplateFix'),
      );
    }
  }

  return issues.sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

export async function buildQualityReport(): Promise<QualityReport> {
  const states = (await ha.getStates()) as HaLikeState[];
  const index = await getAutomationIndex(states);
  return {
    checkedAt: new Date().toISOString(),
    uiScanned: index.uiScanned,
    yamlOnly: index.yamlOnly,
    issues: findQualityIssues(index, states),
  };
}
