/**
 * notifications.ts – Telegram side of proactive push (including task buttons).
 *
 * Routing across Telegram / chat / HA notify / persistent_notification lives
 * in notify-dispatch.ts and the Settings matrix.
 */

import { Bot, InlineKeyboard } from 'grammy';
import { createLogger } from '../core/logger.js';
import { getProfile } from '../core/profile.js';
import { updateTask, getTask } from '../storage/backlog.js';
import { t } from '../core/strings.js';

const log = createLogger('notifications');

let telegramBot: Bot | null = null;

/**
 * Configure proactive notifications handler with the active Bot instance.
 */
export function setupProactiveNotifications(bot: Bot): void {
  telegramBot = bot;

  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (!data.startsWith('task:')) {
      await next();
      return;
    }

    // Proactive messages are pushed to profile.telegramChatId, so only clicks
    // coming back from that chat may act on them. In a group chat this still
    // allows any whitelisted member of that group – tightening it further needs
    // per-recipient task ownership, which the backlog does not track yet.
    const owner = getProfile().telegramChatId;
    if (owner && ctx.chat?.id !== owner) {
      log.warn('Task callback rejected – foreign chat', {
        expected: owner,
        actual: ctx.chat?.id,
      });
      await ctx.answerCallbackQuery({
        text: t('notify.foreignChat'),
        show_alert: true,
      });
      return;
    }

    // Fast-Track Approve
    if (data.startsWith('task:fast_track:')) {
      const taskId = data.slice('task:fast_track:'.length);
      await ctx.answerCallbackQuery(t('notify.fastTrackCb'));
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        const existing = await getTask(taskId);
        if (existing) {
          await ctx.reply(t('notify.fastTrackReply', { title: existing.title }));
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
      await ctx.answerCallbackQuery(t('notify.rejectCb'));
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await updateTask(taskId, { status: 'rejected' });
        await ctx.reply(t('notify.rejectReply'));
      } catch (err) {
        log.error('Failed to process task rejection', { error: String(err) });
      }
      return;
    }

    await next();
  });
}

/**
 * Telegram only. The matrix decides whether this runs.
 */
export async function sendTelegramProactive(
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  if (!telegramBot) return;

  const profile = getProfile();
  if (!profile.telegramChatId) {
    log.warn('Cannot send proactive notification: telegramChatId not set in profile');
    return;
  }

  const chatId = profile.telegramChatId;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 4096) chunks.push(text.slice(i, i + 4096));

  try {
    for (let i = 0; i < chunks.length; i++) {
      const extra = i === 0 && replyMarkup ? { reply_markup: replyMarkup } : {};
      await telegramBot.api
        .sendMessage(chatId, chunks[i]!, { parse_mode: 'Markdown', ...extra })
        .catch(() => telegramBot!.api.sendMessage(chatId, chunks[i]!, extra));
    }
    log.info('Proactive notification sent via Telegram');
  } catch (err) {
    log.error('Failed to send Telegram notification', { error: String(err) });
  }
}
