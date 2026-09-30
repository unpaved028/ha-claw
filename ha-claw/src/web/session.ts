/**
 * session.ts – Browser session for the web confirmation gate.
 *
 * Ingress authenticates the Home Assistant user, but every client that can open
 * the panel used to share one confirmation queue. A cookie set on the first
 * response ties each dialog to the browser that started it.
 */

import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'ha_claw_sid';

const SESSION_RE = /^[a-f0-9]{32}$/;

export function readSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === SESSION_COOKIE && SESSION_RE.test(value)) return value;
  }
  return null;
}

export function mintSessionId(): string {
  return randomBytes(16).toString('hex');
}

/** HttpOnly, no Path: the browser scopes it to the Ingress URL that set it. */
export function sessionSetCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax`;
}

export function sameSession(entrySession: string, requestSession: string): boolean {
  return entrySession.length > 0 && entrySession === requestSession;
}
