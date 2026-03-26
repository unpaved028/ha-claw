/**
 * whitelist.ts – Telegram User-ID Gate (Reject-First).
 *
 * SECURITY: This is the outermost security boundary for Telegram.
 * Any message from a non-whitelisted user is silently dropped.
 */

import type { Context, NextFunction } from 'grammy';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('whitelist');

const allowedIds = new Set(appConfig.telegramAllowedUserIds);

/**
 * Grammy middleware that silently drops messages from unauthorized users.
 * Must be registered FIRST in the middleware chain.
 */
export async function whitelistGuard(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId || !allowedIds.has(userId)) {
    log.warn('Unauthorized access attempt', {
      userId: userId ?? 'unknown',
      username: ctx.from?.username ?? 'unknown',
    });
    return; // Silent drop
  }

  await next();
}
