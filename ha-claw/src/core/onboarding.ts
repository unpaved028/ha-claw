/**
 * onboarding.ts – LLM-based conversational onboarding.
 *
 * Instead of a rigid state machine, onboarding now routes through
 * the agentic loop with a specialized system prompt. The LLM
 * naturally converses with the user to collect bot name, user name,
 * and personality preferences, then calls `save_onboarding_profile`.
 *
 * This module handles session tracking and prompt loading only.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';

const log = createLogger('onboarding');

// Per-session tracking (just a set of active onboarding sessions)
const sessions = new Set<string>();

/** Check if a session is in onboarding. */
export function isOnboarding(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/** Start onboarding for a session. */
export function startOnboarding(sessionId: string): void {
  sessions.add(sessionId);
  log.info('Onboarding session started', { sessionId });
}

/** End onboarding for a session. */
export function endOnboarding(sessionId: string): void {
  sessions.delete(sessionId);
  log.info('Onboarding session ended', { sessionId });
}

/** Load the onboarding system prompt from agents/onboarding.md. */
export function loadOnboardingPrompt(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const mdPath = resolve(dir, '../../agents/onboarding.md');
    return readFileSync(mdPath, 'utf-8');
  } catch {
    log.warn('Failed to load onboarding.md – using inline fallback');
    return [
      'Du bist ein neuer Smart Home Assistent, der gerade eingerichtet wird.',
      'Fuehre ein natuerliches Gespraech um folgendes zu erfahren:',
      '1. Wie der Nutzer dich nennen moechte (Bot-Name)',
      '2. Wie der Nutzer heisst',
      '3. Persoenlichkeits-Praeferenzen (Direktheit, Formalitaet, Humor, Ausfuehrlichkeit je 1-5)',
      'Wenn du alle Infos hast, rufe save_onboarding_profile auf.',
      'Antworte immer auf Deutsch.',
    ].join('\n');
  }
}
