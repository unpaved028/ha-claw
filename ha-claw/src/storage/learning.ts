/**
 * learning.ts – Self-improvement through experience tracking.
 *
 * Four systems:
 * 1. Corrections: When the user corrects the bot, store the correction
 *    so it's injected into future prompts for similar contexts.
 * 2. Prompt Patches: Dynamic additions to the system prompt learned from usage.
 * 3. Usage Patterns: Track recurring user actions to detect habits.
 * 4. Error Tracking: Track tool failures and problematic entities.
 *
 * All data persisted in /data/store/learning/.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../core/logger.js';

const log = createLogger('learning');

const STORE_DIR = join(process.env['HA_CLAW_DATA'] || '/data/store', 'learning');

// ═══════════════════════════════════════════════════════════════
// 1. CORRECTIONS – "Nicht X, sondern Y"
// ═══════════════════════════════════════════════════════════════

export interface Correction {
  id: string;
  /** What the user asked originally */
  userIntent: string;
  /** What the bot did wrong */
  wrongAction: string;
  /** What the correct action was */
  correctAction: string;
  /** Context keywords for matching in future */
  keywords: string[];
  createdAt: string;
  hitCount: number;
}

let corrections: Correction[] = [];
const CORRECTIONS_FILE = join(STORE_DIR, 'corrections.json');

export async function addCorrection(data: {
  userIntent: string;
  wrongAction: string;
  correctAction: string;
  keywords?: string[];
}): Promise<Correction> {
  const c: Correction = {
    id: 'C-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    userIntent: data.userIntent,
    wrongAction: data.wrongAction,
    correctAction: data.correctAction,
    keywords: data.keywords ?? extractKeywords(data.userIntent + ' ' + data.correctAction),
    createdAt: new Date().toISOString(),
    hitCount: 0,
  };
  corrections.push(c);
  await persistCorrections();
  log.info('Correction saved', { id: c.id });
  return c;
}

export function findRelevantCorrections(query: string, max = 3): Correction[] {
  const words = query.toLowerCase().split(/\s+/);
  const scored = corrections.map(c => {
    const matches = c.keywords.filter(k => words.some(w => w.includes(k) || k.includes(w)));
    return { correction: c, score: matches.length };
  }).filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  // Increment hit counts
  for (const s of scored) {
    s.correction.hitCount++;
  }

  return scored.map(s => s.correction);
}

export function buildCorrectionContext(corrections: Correction[]): string {
  if (corrections.length === 0) return '';
  const lines = corrections.map(c =>
    `- Wenn "${c.userIntent}" → NICHT ${c.wrongAction}, SONDERN ${c.correctAction}`
  );
  return `\n## Gelernte Korrekturen\nDiese Fehler wurden in der Vergangenheit korrigiert. Beachte sie:\n${lines.join('\n')}`;
}

export async function listCorrections(): Promise<Correction[]> {
  return corrections;
}

export async function deleteCorrection(id: string): Promise<boolean> {
  const idx = corrections.findIndex(c => c.id === id);
  if (idx < 0) return false;
  corrections.splice(idx, 1);
  await persistCorrections();
  return true;
}

// ═══════════════════════════════════════════════════════════════
// 2. PROMPT PATCHES – Dynamic system prompt additions
// ═══════════════════════════════════════════════════════════════

export interface PromptPatch {
  id: string;
  /** Rule or instruction to add to the system prompt */
  rule: string;
  /** Why this was added */
  reason: string;
  /** Source: correction, pattern, manual */
  source: 'correction' | 'pattern' | 'manual';
  enabled: boolean;
  createdAt: string;
}

let promptPatches: PromptPatch[] = [];
const PATCHES_FILE = join(STORE_DIR, 'prompt-patches.json');

export async function addPromptPatch(data: {
  rule: string;
  reason: string;
  source: PromptPatch['source'];
}): Promise<PromptPatch> {
  // Avoid duplicates
  const existing = promptPatches.find(p => p.rule === data.rule);
  if (existing) return existing;

  const p: PromptPatch = {
    id: 'P-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    rule: data.rule,
    reason: data.reason,
    source: data.source,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  promptPatches.push(p);
  await persistPatches();
  log.info('Prompt patch added', { id: p.id, rule: p.rule.slice(0, 60) });
  return p;
}

export function getActivePromptPatches(): string {
  const active = promptPatches.filter(p => p.enabled);
  if (active.length === 0) return '';
  const lines = active.map(p => `- ${p.rule}`);
  return `\n## Gelernte Regeln\n${lines.join('\n')}`;
}

export async function listPromptPatches(): Promise<PromptPatch[]> {
  return promptPatches;
}

export async function togglePromptPatch(id: string, enabled: boolean): Promise<PromptPatch | null> {
  const p = promptPatches.find(x => x.id === id);
  if (!p) return null;
  p.enabled = enabled;
  await persistPatches();
  return p;
}

// ═══════════════════════════════════════════════════════════════
// 3. USAGE PATTERNS – Detect recurring behaviors
// ═══════════════════════════════════════════════════════════════

export interface UsageEvent {
  action: string;       // e.g. "light.turn_off"
  entityId: string;     // e.g. "light.wohnzimmer"
  hour: number;         // 0-23
  dayOfWeek: number;    // 0-6 (Sun-Sat)
  timestamp: string;
}

export interface DetectedPattern {
  id: string;
  description: string;
  action: string;
  entityId: string;
  /** Typical hour (most common) */
  typicalHour: number;
  /** Days it occurs */
  days: number[];
  /** How many times observed */
  occurrences: number;
  /** Whether a suggestion was already made */
  suggested: boolean;
  firstSeen: string;
  lastSeen: string;
}

let usageEvents: UsageEvent[] = [];
let detectedPatterns: DetectedPattern[] = [];
const EVENTS_FILE = join(STORE_DIR, 'usage-events.json');
const PATTERNS_FILE = join(STORE_DIR, 'patterns.json');

const MAX_EVENTS = 1000; // Ring buffer

export async function trackUsage(action: string, entityId: string): Promise<void> {
  const now = new Date();
  usageEvents.push({
    action,
    entityId,
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
    timestamp: now.toISOString(),
  });

  // Ring buffer
  if (usageEvents.length > MAX_EVENTS) {
    usageEvents = usageEvents.slice(-MAX_EVENTS);
  }

  await persistEvents();
}

/**
 * Analyze usage events and detect recurring patterns.
 * A pattern is detected when the same action+entity happens 3+ times
 * at a similar time of day.
 */
export async function detectPatterns(): Promise<DetectedPattern[]> {
  const groups = new Map<string, UsageEvent[]>();

  for (const e of usageEvents) {
    const key = `${e.action}|${e.entityId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const newPatterns: DetectedPattern[] = [];

  for (const [key, events] of groups) {
    if (events.length < 3) continue;

    const [action, entityId] = key.split('|');

    // Find most common hour (±1 hour tolerance)
    const hourCounts = new Array(24).fill(0);
    for (const e of events) hourCounts[e.hour]++;
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const nearPeak = events.filter(e => Math.abs(e.hour - peakHour) <= 1);

    if (nearPeak.length < 3) continue; // Not enough at similar time

    // Which days?
    const days = [...new Set(nearPeak.map(e => e.dayOfWeek))].sort();

    // Check if already detected
    const existingIdx = detectedPatterns.findIndex(p =>
      p.action === action && p.entityId === entityId && p.typicalHour === peakHour
    );

    if (existingIdx >= 0) {
      detectedPatterns[existingIdx]!.occurrences = nearPeak.length;
      detectedPatterns[existingIdx]!.lastSeen = events[events.length - 1]!.timestamp;
      detectedPatterns[existingIdx]!.days = days;
    } else {
      const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      const p: DetectedPattern = {
        id: 'PAT-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        description: `${action} auf ${entityId} um ca. ${peakHour}:00 (${days.map(d => dayNames[d]).join(', ')})`,
        action: action!,
        entityId: entityId!,
        typicalHour: peakHour,
        days,
        occurrences: nearPeak.length,
        suggested: false,
        firstSeen: events[0]!.timestamp,
        lastSeen: events[events.length - 1]!.timestamp,
      };
      detectedPatterns.push(p);
      newPatterns.push(p);
    }
  }

  await persistPatterns();
  return newPatterns;
}

export function getPatternSuggestions(): DetectedPattern[] {
  return detectedPatterns.filter(p => !p.suggested && p.occurrences >= 5);
}

export async function markPatternSuggested(id: string): Promise<void> {
  const p = detectedPatterns.find(x => x.id === id);
  if (p) {
    p.suggested = true;
    await persistPatterns();
  }
}

export function buildPatternContext(): string {
  const mature = detectedPatterns.filter(p => p.occurrences >= 5);
  if (mature.length === 0) return '';
  const lines = mature.map(p =>
    `- ${p.description} (${p.occurrences}x beobachtet)`
  );
  return `\n## Erkannte Nutzungsmuster\n${lines.join('\n')}\nWenn passend, schlage vor diese als Automatisierung anzulegen.`;
}

export async function listPatterns(): Promise<DetectedPattern[]> {
  return detectedPatterns;
}

// ═══════════════════════════════════════════════════════════════
// 4. ERROR TRACKING – Tool failures & problematic entities
// ═══════════════════════════════════════════════════════════════

export interface ErrorRecord {
  tool: string;
  entityId?: string;
  error: string;
  timestamp: string;
}

export interface ErrorSummary {
  tool: string;
  entityId?: string;
  count: number;
  lastError: string;
  lastSeen: string;
}

let errorLog: ErrorRecord[] = [];
const ERROR_FILE = join(STORE_DIR, 'errors.json');
const MAX_ERRORS = 500;

export async function trackError(tool: string, error: string, entityId?: string): Promise<void> {
  errorLog.push({
    tool,
    entityId,
    error: error.slice(0, 200),
    timestamp: new Date().toISOString(),
  });
  if (errorLog.length > MAX_ERRORS) {
    errorLog = errorLog.slice(-MAX_ERRORS);
  }
  await persistErrors();
}

export function getErrorSummary(): ErrorSummary[] {
  const groups = new Map<string, ErrorRecord[]>();
  for (const e of errorLog) {
    const key = `${e.tool}|${e.entityId || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return Array.from(groups.entries())
    .map(([key, records]) => {
      const [tool, entityId] = key.split('|');
      const last = records[records.length - 1]!;
      return {
        tool: tool!,
        entityId: entityId || undefined,
        count: records.length,
        lastError: last.error,
        lastSeen: last.timestamp,
      };
    })
    .filter(s => s.count >= 2) // Only show recurring errors
    .sort((a, b) => b.count - a.count);
}

export function buildErrorContext(): string {
  const summary = getErrorSummary().slice(0, 5);
  if (summary.length === 0) return '';
  const lines = summary.map(s =>
    `- ${s.tool}${s.entityId ? ' (' + s.entityId + ')' : ''}: ${s.count}x fehlgeschlagen, letzter Fehler: "${s.lastError}"`
  );
  return `\n## Bekannte Probleme\nDiese Tools/Entities haben wiederholt Fehler:\n${lines.join('\n')}\nVermeide diese oder informiere den Nutzer.`;
}

// ═══════════════════════════════════════════════════════════════
// INIT & PERSISTENCE
// ═══════════════════════════════════════════════════════════════

export async function initLearning(): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });

  corrections = await loadJson(CORRECTIONS_FILE, []);
  promptPatches = await loadJson(PATCHES_FILE, []);
  usageEvents = await loadJson(EVENTS_FILE, []);
  detectedPatterns = await loadJson(PATTERNS_FILE, []);
  errorLog = await loadJson(ERROR_FILE, []);

  log.info('Learning system initialized', {
    corrections: corrections.length,
    patches: promptPatches.length,
    events: usageEvents.length,
    patterns: detectedPatterns.length,
    errors: errorLog.length,
  });
}

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function persistCorrections(): Promise<void> { await saveJson(CORRECTIONS_FILE, corrections); }
async function persistPatches(): Promise<void> { await saveJson(PATCHES_FILE, promptPatches); }
async function persistEvents(): Promise<void> { await saveJson(EVENTS_FILE, usageEvents); }
async function persistPatterns(): Promise<void> { await saveJson(PATTERNS_FILE, detectedPatterns); }
async function persistErrors(): Promise<void> { await saveJson(ERROR_FILE, errorLog); }

async function saveJson(path: string, data: unknown): Promise<void> {
  try {
    await writeFile(path, JSON.stringify(data, null, 2));
  } catch (err) {
    log.warn('Failed to persist learning data', { path, error: String(err) });
  }
}

function extractKeywords(text: string): string[] {
  const stop = new Set(['der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'nicht', 'im', 'in', 'auf', 'an', 'aus', 'ist', 'ich', 'du', 'mein', 'den', 'dem', 'es', 'the', 'a', 'is', 'to', 'of']);
  return text.toLowerCase()
    .replace(/[^a-zäöüß0-9\s_-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w))
    .slice(0, 10);
}
