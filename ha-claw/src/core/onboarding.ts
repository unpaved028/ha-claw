/**
 * onboarding.ts – Leftover session helpers.
 *
 * First run does not start a conversation. The web banner and the first
 * Telegram message point at Status and Settings → Notifications, and
 * `completeFirstRun()` marks setup done. Nothing in the server or the bot
 * calls this module.
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
