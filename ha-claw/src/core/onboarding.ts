/**
 * onboarding.ts – First-time setup conversation flow.
 *
 * When no profile exists, the bot guides the user through a multi-step
 * onboarding to set bot name, user name, and personality traits.
 *
 * The onboarding is a simple state machine that runs OUTSIDE the agentic
 * loop (no LLM calls needed – it's deterministic).
 */

import { saveProfile, type PersonalityTraits } from './profile.js';
import { createLogger } from './logger.js';

const log = createLogger('onboarding');

type Step = 'bot_name' | 'user_name' | 'directness' | 'formality' | 'humor' | 'verbosity' | 'confirm' | 'done';

interface OnboardingState {
  step: Step;
  botName: string;
  userName: string;
  personality: PersonalityTraits;
}

// Per-session onboarding state (one per chat source)
const sessions = new Map<string, OnboardingState>();

function newState(): OnboardingState {
  return {
    step: 'bot_name',
    botName: '',
    userName: '',
    personality: { directness: 4, formality: 3, humor: 3, verbosity: 2 },
  };
}

/** Check if a session is in onboarding. */
export function isOnboarding(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/** Start onboarding for a session. Returns the first message. */
export function startOnboarding(sessionId: string): string {
  sessions.set(sessionId, newState());
  log.info('Onboarding started', { sessionId });

  return `Willkommen bei **HA-Claw**! Bevor wir loslegen, moechte ich mich kurz vorstellen und dich kennenlernen.

Wie soll ich heissen? Du kannst mir einen beliebigen Namen geben (z.B. "Jarvis", "Alfred", "Claw", ...).`;
}

/** Process a user message during onboarding. Returns the bot response. */
export async function processOnboarding(sessionId: string, userMessage: string): Promise<string> {
  const state = sessions.get(sessionId);
  if (!state) return '';

  const input = userMessage.trim();

  switch (state.step) {
    case 'bot_name': {
      state.botName = input;
      state.step = 'user_name';
      return `**${state.botName}** – gefaellt mir! Und wie heisst du?`;
    }

    case 'user_name': {
      state.userName = input;
      state.step = 'directness';
      return `Freut mich, ${state.userName}! Jetzt noch ein paar Fragen zu meiner Persoenlichkeit.

**Wie direkt soll ich sein?**
1 = Diplomatisch und vorsichtig
3 = Ausgewogen
5 = Sehr direkt, auf den Punkt

Antworte mit einer Zahl (1-5):`;
    }

    case 'directness': {
      state.personality.directness = clamp(parseInt(input) || 4);
      state.step = 'formality';
      return `**Wie formell soll ich sprechen?**
1 = Locker und casual
3 = Normal
5 = Professionell und formell

Zahl (1-5):`;
    }

    case 'formality': {
      state.personality.formality = clamp(parseInt(input) || 3);
      state.step = 'humor';
      return `**Wie viel Humor?**
1 = Rein sachlich
3 = Ab und zu ein Spruch
5 = Trockener Humor, smarte Kommentare

Zahl (1-5):`;
    }

    case 'humor': {
      state.personality.humor = clamp(parseInt(input) || 3);
      state.step = 'verbosity';
      return `**Wie ausfuehrlich soll ich antworten?**
1 = So knapp wie moeglich
3 = Normal
5 = Ausfuehrlich mit Details

Zahl (1-5):`;
    }

    case 'verbosity': {
      state.personality.verbosity = clamp(parseInt(input) || 2);
      state.step = 'confirm';

      const p = state.personality;
      return `Perfekt! Hier ist mein Profil:

**Name:** ${state.botName}
**Dein Name:** ${state.userName}
**Direktheit:** ${bar(p.directness)} (${p.directness}/5)
**Formalitaet:** ${bar(p.formality)} (${p.formality}/5)
**Humor:** ${bar(p.humor)} (${p.humor}/5)
**Ausfuehrlichkeit:** ${bar(p.verbosity)} (${p.verbosity}/5)

Passt das so? (Ja / Nein, nochmal)`;
    }

    case 'confirm': {
      const yes = /^(ja|yes|jo|jap|ok|passt|klar|sicher)/i.test(input);
      if (!yes) {
        sessions.set(sessionId, newState());
        return `Kein Problem, starten wir nochmal!

Wie soll ich heissen?`;
      }

      // Save profile
      await saveProfile({
        botName: state.botName,
        userName: state.userName,
        personality: state.personality,
        onboardingComplete: true,
      });

      state.step = 'done';
      sessions.delete(sessionId);

      log.info('Onboarding complete', { botName: state.botName, userName: state.userName });

      return `Alles gespeichert! Ich bin **${state.botName}**, dein persoenlicher Smart Home Assistent.

Ab jetzt kannst du mir Befehle geben wie:
- "Licht im Wohnzimmer an"
- "Wie warm ist es draussen?"
- "Erstelle eine Gute-Nacht-Routine"

Lass uns loslegen, ${state.userName}!`;
    }

    default:
      sessions.delete(sessionId);
      return '';
  }
}

function clamp(n: number): number {
  return Math.max(1, Math.min(5, n));
}

function bar(n: number): string {
  return '\u2588'.repeat(n) + '\u2591'.repeat(5 - n);
}
