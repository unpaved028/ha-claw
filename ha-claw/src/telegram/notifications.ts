/**
 * notifications.ts – Proactive Push Notifications via Telegram
 *
 * Handles sending fast-track approval messages to the user and
 * executing callbacks when the user clicks 'Approve' or 'Reject'.
 */

import { Bot, InlineKeyboard } from 'grammy';
import { createLogger } from '../core/logger.js';
import { getProfile } from '../core/profile.js';
import { updateTask, getTask } from '../storage/backlog.js';

const log = createLogger('notifications');

let telegramBot: Bot | null = null;

/**
 * Configure proactive notifications handler with the active Bot instance.
 */
export function setupProactiveNotifications(bot: Bot): void {
  telegramBot = bot;

  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // Fast-Track Approve
    if (data.startsWith('task:fast_track:')) {
      const taskId = data.slice('task:fast_track:'.length);
      await ctx.answerCallbackQuery('Task wird im Hintergrund ausgeführt...');
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        const existing = await getTask(taskId);
        if (existing) {
          await ctx.reply(`⏳ Bestätigt: ${existing.title}. Ich kümmere mich darum.`);
          await updateTask(taskId, { status: 'fast_track_approved' });
        }
      } catch (err) {
        log.error('Failed to process fast-track approval', { error: String(err) });
      }
      return;
    }

    // Fast-Track Reject
    if (data.startsWith('task:reject:')) {
      const taskId = data.slice('task:reject:'.length);
      await ctx.answerCallbackQuery('Task wurde ignoriert.');
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await updateTask(taskId, { status: 'rejected' });
        await ctx.reply('❌ Aufgabe wurde ignoriert.');
      } catch (err) {
        log.error('Failed to process task rejection', { error: String(err) });
      }
      return;
    }

    await next();
  });
}

/**
 * Send a proactive push notification to the configured telegramChatId.
 */
export async function sendProactiveMessage(
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  if (!telegramBot) {
    log.debug('Proactive notification skipped: Telegram bot not initialized');
    return;
  }

  const profile = getProfile();
  if (!profile.telegramChatId) {
    log.warn('Cannot send proactive notification: telegramChatId not set in profile');
    return;
  }

  try {
    await telegramBot.api.sendMessage(profile.telegramChatId, text, {
      parse_mode: 'Markdown',
      ...(replyMarkup && { reply_markup: replyMarkup }),
    });
    log.info('Proactive notification sent successfully');
  } catch (err) {
    log.error('Failed to send proactive notification', { error: String(err) });
  }
}
