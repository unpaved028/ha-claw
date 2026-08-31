/**
 * confirmation.ts – Telegram Safety Gate via Inline Keyboard.
 *
 * When the agentic loop encounters a dangerous tool call, this module
 * sends an inline keyboard to the user and waits for their decision.
 * Times out after 60 seconds (auto-deny).
 *
 * A pending confirmation is bound to the user who triggered it: in a shared
 * chat another whitelisted member must not be able to approve someone else's
 * dangerous action.
 */

import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { createLogger } from '../core/logger.js';
import type { ConfirmationFn } from '../core/agentic-loop.js';
import { formatPreviewText, type ConfirmPreview } from '../core/config-change.js';

const log = createLogger('safety-gate');

const CONFIRMATION_TIMEOUT_MS = 60_000; // 60 seconds

interface PendingConfirmation {
  chatId: number;
  /** User the confirmation was issued to, or null when the requester is unknown. */
  userId: number | null;
  toolName: string;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

// Map of pending confirmations: callbackId → pending entry
const pendingConfirmations = new Map<string, PendingConfirmation>();

let confirmationCounter = 0;

/** Resolve one pending confirmation and clear its timeout. */
function settle(callbackId: string, approved: boolean): void {
  const entry = pendingConfirmations.get(callbackId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pendingConfirmations.delete(callbackId);
  entry.resolve(approved);
}

/**
 * Register the callback query handler on the bot.
 * Must be called once during bot setup.
 */
export function setupConfirmationHandler(bot: Bot): void {
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // Format: "confirm:<id>:yes" or "confirm:<id>:no".
    // Everything else belongs to a handler further down the chain – without
    // next() this middleware would swallow the room picker, the retry button
    // and the proactive task buttons.
    if (!data.startsWith('confirm:')) {
      await next();
      return;
    }

    const parts = data.split(':');
    const callbackId = parts[1];
    const decision = parts[2] === 'yes';

    const entry = callbackId ? pendingConfirmations.get(callbackId) : undefined;
    if (!callbackId || !entry) {
      await ctx.answerCallbackQuery({ text: '⏰ Abgelaufen.' });
      return;
    }

    // Only the user who triggered the action may decide on it.
    if (entry.userId !== null && ctx.from?.id !== entry.userId) {
      log.warn('Confirmation rejected – wrong user', {
        tool: entry.toolName,
        expected: entry.userId,
        actual: ctx.from?.id,
      });
      await ctx.answerCallbackQuery({
        text: 'Nur wer die Aktion ausgelöst hat, kann sie bestätigen.',
        show_alert: true,
      });
      return;
    }

    settle(callbackId, decision);

    const verdict = decision ? '✅ Genehmigt' : '❌ Abgelehnt';
    await ctx.answerCallbackQuery({ text: verdict });

    // Purely cosmetic: the decision is already applied, so a failed edit
    // (deleted message, parse error, too old) must not surface as a bot error.
    try {
      await ctx.editMessageText(`${ctx.callbackQuery.message?.text ?? ''}\n\n${verdict}`);
    } catch (err) {
      log.debug('Could not update confirmation message', { error: String(err) });
    }
  });
}

/**
 * Create a confirmation callback for a specific Telegram chat and user.
 * Returns a ConfirmationFn compatible with the agentic loop.
 */
export function createTelegramConfirmFn(
  bot: Bot,
  chatId: number,
  userId: number | null = null,
): ConfirmationFn {
  return async (
    toolName: string,
    args: Record<string, unknown>,
    preview?: ConfirmPreview,
  ): Promise<boolean> => {
    const callbackId = String(++confirmationCounter);

    const previewBlock = preview ? formatPreviewText(preview, 2200) : '';
    const text = previewBlock
      ? `⚠️ Gefährliche Aktion\n\nTool: ${toolName}\n\n${previewBlock}\n\nGenehmigen?`
      : `⚠️ *Gefährliche Aktion*\n\n` +
        `Tool: \`${toolName}\`\n` +
        `Args: \`${JSON.stringify(args).slice(0, 200)}\`\n\n` +
        `Genehmigen?`;

    const keyboard = new InlineKeyboard()
      .text('✅ Ja', `confirm:${callbackId}:yes`)
      .text('❌ Nein', `confirm:${callbackId}:no`);

    // Tool arguments can contain backticks or underscores that break Telegram's
    // Markdown parser. Losing the safety prompt would be worse than losing the
    // formatting, so fall back to plain text.
    await bot.api
      .sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard })
      .catch(() => bot.api.sendMessage(chatId, text, { reply_markup: keyboard }));

    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        // Auto-deny, but only this entry.
        if (pendingConfirmations.delete(callbackId)) {
          log.warn('Confirmation timed out – auto-denied', { tool: toolName });
          resolve(false);
        }
      }, CONFIRMATION_TIMEOUT_MS);

      pendingConfirmations.set(callbackId, { chatId, userId, toolName, resolve, timer });
    });
  };
}
