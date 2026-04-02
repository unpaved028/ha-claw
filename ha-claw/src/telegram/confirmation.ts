/**
 * confirmation.ts – Telegram Safety Gate via Inline Keyboard.
 *
 * When the agentic loop encounters a dangerous tool call, this module
 * sends an inline keyboard to the user and waits for their decision.
 * Times out after 60 seconds (auto-deny).
 */

import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { createLogger } from '../core/logger.js';

const log = createLogger('safety-gate');

const CONFIRMATION_TIMEOUT_MS = 60_000; // 60 seconds

// Map of pending confirmations: callbackId → resolve function
const pendingConfirmations = new Map<string, (approved: boolean) => void>();

let confirmationCounter = 0;

/**
 * Register the callback query handler on the bot.
 * Must be called once during bot setup.
 */
export function setupConfirmationHandler(bot: Bot): void {
  bot.on('callback_query:data', async ctx => {
    const data = ctx.callbackQuery.data;

    // Format: "confirm:<id>:yes" or "confirm:<id>:no"
    if (!data.startsWith('confirm:')) return;

    const parts = data.split(':');
    const callbackId = parts[1];
    const decision = parts[2] === 'yes';

    const resolver = pendingConfirmations.get(callbackId!);
    if (!resolver) {
      await ctx.answerCallbackQuery({ text: '⏰ Abgelaufen.' });
      return;
    }

    pendingConfirmations.delete(callbackId!);
    resolver(decision);

    await ctx.answerCallbackQuery({
      text: decision ? '✅ Genehmigt' : '❌ Abgelehnt',
    });
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + `\n\n${decision ? '✅ Genehmigt' : '❌ Abgelehnt'}`,
    );
  });
}

/**
 * Create a confirmation callback for a specific Telegram chat.
 * Returns a ConfirmationFn compatible with the agentic loop.
 */
export function createTelegramConfirmFn(
  bot: Bot,
  chatId: number,
): (toolName: string, args: Record<string, unknown>) => Promise<boolean> {
  return async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    const callbackId = String(++confirmationCounter);

    const text =
      `⚠️ *Gefährliche Aktion*\n\n` +
      `Tool: \`${toolName}\`\n` +
      `Args: \`${JSON.stringify(args).slice(0, 200)}\`\n\n` +
      `Genehmigen?`;

    const keyboard = new InlineKeyboard()
      .text('✅ Ja', `confirm:${callbackId}:yes`)
      .text('❌ Nein', `confirm:${callbackId}:no`);

    await bot.api.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    return new Promise<boolean>(resolve => {
      pendingConfirmations.set(callbackId, resolve);

      // Auto-deny after timeout
      setTimeout(() => {
        if (pendingConfirmations.has(callbackId)) {
          pendingConfirmations.delete(callbackId);
          log.warn('Confirmation timed out – auto-denied', { tool: toolName });
          resolve(false);
        }
      }, CONFIRMATION_TIMEOUT_MS);
    });
  };
}
