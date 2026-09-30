/**
 * prompts.ts – Load the language-specific system prompts.
 *
 * English lives in agents/main.en.md, agents/onboarding.en.md and agents/cie.en.md.
 * German stays in agents/main.md, agents/onboarding.md and agents/cie.md.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';
import { getLanguage, type UiLang } from './locale.js';

const log = createLogger('prompts');

function agentsDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../agents');
}

function readAgent(name: string): string | null {
  try {
    return readFileSync(resolve(agentsDir(), name), 'utf-8');
  } catch {
    return null;
  }
}

export function loadMainPrompt(lang: UiLang = getLanguage()): string {
  const file = lang === 'en' ? 'main.en.md' : 'main.md';
  const text = readAgent(file) ?? (lang === 'en' ? readAgent('main.md') : null);
  if (text) return text;
  log.warn('Could not load main prompt', { file });
  return lang === 'en'
    ? [
        'You are HA-Claw, a local AI assistant for Home Assistant.',
        'You run as a Home Assistant add-on.',
        'Reply briefly, helpfully, and in English.',
        'Use tools when needed.',
      ].join('\n')
    : [
        'Du bist HA-Claw, ein lokaler KI-Assistent für Smart Home und Produktivität.',
        'Du läufst als Home Assistant Add-on.',
        'Du antwortest knapp, hilfreich und auf Deutsch.',
        'Du hast Zugriff auf Tools – nutze sie, wenn nötig.',
      ].join('\n');
}

export function loadCiePrompt(lang: UiLang = getLanguage()): string {
  const file = lang === 'en' ? 'cie.en.md' : 'cie.md';
  const text = readAgent(file) ?? (lang === 'en' ? readAgent('cie.md') : null);
  if (text) return text;
  log.warn('Could not load CIE prompt', { file });
  return lang === 'en'
    ? 'Propose at most two improvements with backlog_propose. Do not change the home.'
    : 'Schlage höchstens zwei Verbesserungen mit backlog_propose vor. Ändere das Zuhause nicht.';
}

export function loadOnboardingPromptFile(lang: UiLang = getLanguage()): string {
  const file = lang === 'en' ? 'onboarding.en.md' : 'onboarding.md';
  const text = readAgent(file) ?? (lang === 'en' ? readAgent('onboarding.md') : null);
  if (text) return text;
  log.warn('Could not load onboarding prompt', { file });
  return lang === 'en'
    ? 'First run is Status and a choice of notification channel. Do not interview the user.'
    : 'Der erste Start ist Status und die Wahl des Benachrichtigungskanals. Führe kein Gespräch zur Persönlichkeit.';
}
