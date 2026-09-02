/**
 * prompts.ts – Load the language-specific system prompts.
 *
 * English lives in agents/main.en.md and agents/onboarding.en.md.
 * German stays in agents/main.md and agents/onboarding.md (existing files).
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

export function loadOnboardingPromptFile(lang: UiLang = getLanguage()): string {
  const file = lang === 'en' ? 'onboarding.en.md' : 'onboarding.md';
  const text = readAgent(file) ?? (lang === 'en' ? readAgent('onboarding.md') : null);
  if (text) return text;
  log.warn('Could not load onboarding prompt', { file });
  return lang === 'en'
    ? [
        'You are a new smart-home assistant being set up.',
        'Have a natural conversation to learn: bot name, user name, personality (1–5).',
        'When you have everything, call save_onboarding_profile.',
        'Always reply in English.',
      ].join('\n')
    : [
        'Du bist ein neuer Smart Home Assistent, der gerade eingerichtet wird.',
        'Fuehre ein natuerliches Gespraech um folgendes zu erfahren:',
        '1. Wie der Nutzer dich nennen moechte (Bot-Name)',
        '2. Wie der Nutzer heisst',
        '3. Persoenlichkeits-Praeferenzen (Direktheit, Formalitaet, Humor, Ausfuehrlichkeit je 1-5)',
        'Wenn du alle Infos hast, rufe save_onboarding_profile auf.',
        'Antworte immer auf Deutsch.',
      ].join('\n');
}
