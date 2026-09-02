/**
 * locale.ts – Resolve UI / prompt language from the add-on option and HA.
 *
 * `auto`: Home Assistant `language` of `de` / `de-*` → German; any other locale
 * → English. A missing HA language is treated as German so an existing install
 * does not flip to English because `/api/config` had no field.
 */

import * as ha from './ha-client.js';
import { appConfig } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('locale');

export type UiLang = 'en' | 'de';
export type LanguageOption = 'auto' | UiLang;

const CACHE_MS = 60_000;

let cached: { lang: UiLang; at: number } | null = null;

export function parseLanguageOption(raw: unknown): LanguageOption {
  const s = String(raw ?? 'auto')
    .toLowerCase()
    .trim();
  if (s === 'en' || s === 'de' || s === 'auto') return s;
  return 'auto';
}

/** Pure: map a Home Assistant locale string to en/de. */
export function languageFromHaLocale(raw: string | undefined | null): UiLang {
  if (!raw) return 'de';
  const t = raw.toLowerCase().replace(/_/g, '-');
  if (t === 'de' || t.startsWith('de-')) return 'de';
  return 'en';
}

export function resolveLanguage(option: LanguageOption, haLocale?: string | null): UiLang {
  if (option === 'en' || option === 'de') return option;
  return languageFromHaLocale(haLocale);
}

export function getLanguage(): UiLang {
  if (appConfig.language !== 'auto') return appConfig.language;
  return cached?.lang ?? 'de';
}

export async function refreshLanguage(): Promise<UiLang> {
  if (appConfig.language !== 'auto') {
    cached = { lang: appConfig.language, at: Date.now() };
    return appConfig.language;
  }
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.lang;
  let haLocale: string | undefined;
  try {
    const cfg = await ha.getConfig();
    if (typeof cfg['language'] === 'string') haLocale = cfg['language'];
  } catch (err) {
    log.debug('HA language unavailable', { error: String(err) });
  }
  const lang = resolveLanguage('auto', haLocale);
  cached = { lang, at: Date.now() };
  return lang;
}

/** Drop the cache (tests). */
export function resetLanguageCache(): void {
  cached = null;
}
