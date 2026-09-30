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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import { atomicWriteJson, withPathLock } from '../storage/atomic-write.js';
import { t } from './strings.js';

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

export interface ComplexityModels {
  /** Model for complexity level 1 (simple tools). Empty = use default. */
  level1: string;
  /** Model for complexity level 2 (moderate tools). Empty = use default. */
  level2: string;
  /** Model for complexity level 3 (complex tools). Empty = use default. */
  level3: string;
}

export interface Profile {
  botName: string;
  userName: string;
  personality: PersonalityTraits;
  modelOverride: string;
  complexityModels: ComplexityModels;
  onboardingComplete: boolean;
  /** First Telegram message explained Status and notifications. The web UI does not set this. */
  telegramIntroSeen: boolean;
  telegramChatId: number | null;
  lastInteractionDate: string | null;
  maxContextTokens: number;
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

const DEFAULT_COMPLEXITY_MODELS: ComplexityModels = {
  level1: '',
  level2: '',
  level3: '',
};

const DEFAULT_PROFILE: Profile = {
  botName: 'HA-Claw',
  userName: '',
  personality: DEFAULT_PERSONALITY,
  modelOverride: '',
  complexityModels: DEFAULT_COMPLEXITY_MODELS,
  onboardingComplete: false,
  telegramIntroSeen: false,
  telegramChatId: null,
  lastInteractionDate: null,
  maxContextTokens: 4000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── State ─────────────────────────────────────────────────

let currentProfile: Profile = { ...DEFAULT_PROFILE };

// ── Public API ────────────────────────────────────────────

/**
 * Merge a stored profile. Installations that already finished setup before
 * `telegramIntroSeen` existed do not get the first-run sentence again.
 * A profile saved after the panel load keeps the flag explicit and false.
 */
export function profileFromStored(raw: unknown): Profile {
  const parsed = raw && typeof raw === 'object' ? (raw as Partial<Profile>) : {};
  const hadIntro = Object.prototype.hasOwnProperty.call(parsed, 'telegramIntroSeen');
  const profile: Profile = {
    ...DEFAULT_PROFILE,
    ...parsed,
    personality: { ...DEFAULT_PERSONALITY, ...(parsed.personality ?? {}) },
    complexityModels: { ...DEFAULT_COMPLEXITY_MODELS, ...(parsed.complexityModels ?? {}) },
  };
  if (!hadIntro && parsed.onboardingComplete === true) profile.telegramIntroSeen = true;
  return profile;
}

/** Load profile from disk. Returns default if not found. */
export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await readFile(PROFILE_PATH, 'utf-8');
    currentProfile = profileFromStored(JSON.parse(raw));
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

  await withPathLock(PROFILE_PATH, () => atomicWriteJson(PROFILE_PATH, currentProfile));

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
 * Mark first run done without collecting a name or a personality.
 * The web banner and the first Telegram message are the setup.
 */
export async function completeFirstRun(): Promise<boolean> {
  if (currentProfile.onboardingComplete) return false;
  await saveProfile({ onboardingComplete: true });
  return true;
}

/** The web panel does not set this. The first Telegram message does. */
export function needsTelegramIntro(): boolean {
  return !currentProfile.telegramIntroSeen;
}

export async function completeTelegramIntro(): Promise<boolean> {
  if (currentProfile.telegramIntroSeen) return false;
  await saveProfile({ telegramIntroSeen: true, onboardingComplete: true });
  return true;
}

/**
 * Build a personality description string for the system prompt.
 */
export function personalityPrompt(): string {
  const p = currentProfile.personality;
  const traits: string[] = [];

  if (p.directness <= 2) traits.push(t('prompt.directLow'));
  else if (p.directness >= 4) traits.push(t('prompt.directHigh'));

  if (p.formality <= 2) traits.push(t('prompt.formalLow'));
  else if (p.formality >= 4) traits.push(t('prompt.formalHigh'));

  if (p.humor <= 2) traits.push(t('prompt.humorLow'));
  else if (p.humor >= 4) traits.push(t('prompt.humorHigh'));

  if (p.verbosity <= 2) traits.push(t('prompt.verboseLow'));
  else if (p.verbosity >= 4) traits.push(t('prompt.verboseHigh'));

  const intro = currentProfile.userName
    ? t('prompt.nameIntro', {
        bot: currentProfile.botName,
        user: currentProfile.userName,
      })
    : t('prompt.nameIntroAnon', { bot: currentProfile.botName });

  return intro + (traits.length > 0 ? '\n\n' + traits.join('\n') : '');
}
