/**
 * profile.ts – Bot & user profile with personality settings.
 *
 * Stored as a single JSON file at /data/store/profile.json.
 * Contains:
 * - Bot name (user-chosen)
 * - User name
 * - Personality traits (directness, formality, humor, verbosity)
 * - Onboarding status
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('profile');

const PROFILE_PATH = join(appConfig.dataPath, 'store', 'profile.json');

// ── Types ─────────────────────────────────────────────────

export interface PersonalityTraits {
  /** 1=very indirect/diplomatic, 5=very direct/blunt */
  directness: number;
  /** 1=very casual, 5=very formal/professional */
  formality: number;
  /** 1=no humor, 5=very humorous */
  humor: number;
  /** 1=very terse, 5=very verbose/detailed */
  verbosity: number;
}

export interface Profile {
  botName: string;
  userName: string;
  personality: PersonalityTraits;
  modelOverride: string;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Defaults ──────────────────────────────────────────────

const DEFAULT_PERSONALITY: PersonalityTraits = {
  directness: 4,
  formality: 3,
  humor: 3,
  verbosity: 2,
};

const DEFAULT_PROFILE: Profile = {
  botName: 'HA-Claw',
  userName: 'Architekt',
  personality: DEFAULT_PERSONALITY,
  modelOverride: '',
  onboardingComplete: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── State ─────────────────────────────────────────────────

let currentProfile: Profile = { ...DEFAULT_PROFILE };

// ── Public API ────────────────────────────────────────────

/** Load profile from disk. Returns default if not found. */
export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await readFile(PROFILE_PATH, 'utf-8');
    currentProfile = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    log.info('Profile loaded', { botName: currentProfile.botName, user: currentProfile.userName });
  } catch {
    log.info('No profile found – using defaults (onboarding pending)');
    currentProfile = { ...DEFAULT_PROFILE };
  }
  return currentProfile;
}

/** Save current profile to disk. */
export async function saveProfile(updates: Partial<Profile>): Promise<Profile> {
  currentProfile = {
    ...currentProfile,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(PROFILE_PATH), { recursive: true });
  const tmpPath = `${PROFILE_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(currentProfile, null, 2), 'utf-8');
  await rename(tmpPath, PROFILE_PATH);

  log.info('Profile saved', { botName: currentProfile.botName, user: currentProfile.userName });
  return currentProfile;
}

/** Get current in-memory profile. */
export function getProfile(): Profile {
  return currentProfile;
}

/** Check if onboarding is needed. */
export function needsOnboarding(): boolean {
  return !currentProfile.onboardingComplete;
}

/**
 * Build a personality description string for the system prompt.
 */
export function personalityPrompt(): string {
  const p = currentProfile.personality;
  const traits: string[] = [];

  // Directness
  if (p.directness <= 2) traits.push('Sei diplomatisch und indirekt in deinen Formulierungen.');
  else if (p.directness >= 4) traits.push('Sei direkt und auf den Punkt. Keine Umschweife.');

  // Formality
  if (p.formality <= 2) traits.push('Sprich locker und casual, duze den Nutzer.');
  else if (p.formality >= 4) traits.push('Sprich professionell und formell.');

  // Humor
  if (p.humor <= 2) traits.push('Bleib sachlich, wenig Humor.');
  else if (p.humor >= 4) traits.push('Sei humorvoll, nutze trockenen Witz und smarte Kommentare.');

  // Verbosity
  if (p.verbosity <= 2) traits.push('Antworte so knapp wie moeglich. Kurze Saetze.');
  else if (p.verbosity >= 4) traits.push('Erklaere ausfuehrlich und gib Details und Kontext.');

  const intro = `Dein Name ist **${currentProfile.botName}**. `
    + `Der Nutzer heisst **${currentProfile.userName}**. `
    + `Sprich den Nutzer mit seinem Namen an wenn es passt.`;

  return intro + (traits.length > 0 ? '\n\n' + traits.join('\n') : '');
}
