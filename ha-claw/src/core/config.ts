/**
 * config.ts – Configuration loader for HA Add-on environment.
 *
 * In an HA Add-on, secrets and options are stored at /data/options.json,
 * written by the HA Supervisor when the user saves settings in the UI.
 * The SUPERVISOR_TOKEN env var is injected automatically for HA API access.
 *
 * For local development, falls back to a dev-options.json or env vars.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppConfig {
  // OpenRouter (required)
  openRouterApiKey: string;
  openRouterDefaultModel: string;

  // Telegram (optional – bot only starts if token is set)
  telegramBotToken: string | null;
  telegramAllowedUserIds: number[];

  // HA Supervisor
  supervisorToken: string | null;
  haApiUrl: string;

  // Ingress
  ingressPort: number;

  // Storage
  dataPath: string;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Runtime flags
  isAddon: boolean;
}

// ---------------------------------------------------------------------------
// HA Add-on Options (from /data/options.json)
// ---------------------------------------------------------------------------

interface AddonOptions {
  openrouter_api_key: string;
  openrouter_default_model: string;
  telegram_bot_token: string;
  telegram_allowed_user_ids: number[];
  log_level: string;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function loadConfig(): AppConfig {
  const isAddon = existsSync('/data/options.json');
  let options: AddonOptions;

  if (isAddon) {
    // ── Running as HA Add-on ──────────────────────────────────
    const raw = readFileSync('/data/options.json', 'utf-8');
    options = JSON.parse(raw) as AddonOptions;
  } else {
    // ── Local development fallback ────────────────────────────
    const devPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dev-options.json');
    if (existsSync(devPath)) {
      options = JSON.parse(readFileSync(devPath, 'utf-8')) as AddonOptions;
    } else {
      // Env var fallback for CI/testing
      options = {
        openrouter_api_key: process.env['OPENROUTER_API_KEY'] ?? '',
        openrouter_default_model:
          process.env['OPENROUTER_DEFAULT_MODEL'] ?? 'google/gemini-2.5-flash-preview',
        telegram_bot_token: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
        telegram_allowed_user_ids: (process.env['TELEGRAM_ALLOWED_USER_IDS'] ?? '')
          .split(',')
          .filter(Boolean)
          .map(Number),
        log_level: process.env['LOG_LEVEL'] ?? 'info',
      };
    }
  }

  // ── Validate required fields ─────────────────────────────────
  if (!options.openrouter_api_key) {
    throw new Error('❌ openrouter_api_key is required. Set it in the Add-on configuration.');
  }

  // ── Telegram is optional ─────────────────────────────────────
  const hasTelegram = options.telegram_bot_token && options.telegram_bot_token.trim() !== '';

  if (hasTelegram && options.telegram_allowed_user_ids.length === 0) {
    throw new Error(
      '❌ telegram_allowed_user_ids must not be empty when telegram_bot_token is set.',
    );
  }

  return Object.freeze({
    openRouterApiKey: options.openrouter_api_key,
    openRouterDefaultModel: options.openrouter_default_model,

    telegramBotToken: hasTelegram ? options.telegram_bot_token : null,
    telegramAllowedUserIds: options.telegram_allowed_user_ids,

    // HA Supervisor injects this automatically inside the add-on container
    supervisorToken: process.env['SUPERVISOR_TOKEN'] ?? null,
    haApiUrl: isAddon ? 'http://supervisor/core/api' : (process.env['HA_API_URL'] ?? ''),

    ingressPort: Number(process.env['INGRESS_PORT'] ?? '3100'),
    dataPath: isAddon ? '/data' : './data',

    logLevel: (options.log_level || 'info') as AppConfig['logLevel'],
    isAddon,
  });
}

/** Immutable, validated application configuration. */
export const appConfig = loadConfig();
export type { AppConfig };
