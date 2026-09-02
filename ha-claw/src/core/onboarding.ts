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

import { createLogger } from './logger.js';
import { loadOnboardingPromptFile } from './prompts.js';

const log = createLogger('onboarding');

const sessions = new Set<string>();

export function isOnboarding(sessionId: string): boolean {
  return sessions.has(sessionId);
}

export function startOnboarding(sessionId: string): void {
  sessions.add(sessionId);
  log.info('Onboarding session started', { sessionId });
}

export function endOnboarding(sessionId: string): void {
  sessions.delete(sessionId);
  log.info('Onboarding session ended', { sessionId });
}

export function loadOnboardingPrompt(): string {
  return loadOnboardingPromptFile();
}
