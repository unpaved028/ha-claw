/**
 * notify-dispatch.ts – Fan a proactive text out to the channels the matrix allows.
 *
 * Telegram may carry inline buttons. Chat, HA notify and persistent_notification
 * are text only.
 */

import type { InlineKeyboard } from 'grammy';
import { createLogger } from './logger.js';
import { appendAssistantMessage } from '../storage/conversation.js';
import { sendTelegramProactive } from '../telegram/notifications.js';
import { sendHaNotify, sendPersistentNotification } from './ha-notify.js';
import { getNotifyMatrix, shouldNotify, type NotifyEventId } from './notify-matrix.js';

const log = createLogger('notify-dispatch');

export interface DispatchOpts {
  telegramMarkup?: InlineKeyboard;
  notificationId?: string;
}

export async function dispatchNotify(
  event: NotifyEventId,
  text: string,
  opts: DispatchOpts = {},
): Promise<void> {
  const matrix = await getNotifyMatrix();
  const jobs: Promise<void>[] = [];

  if (shouldNotify(matrix, event, 'telegram')) {
    jobs.push(sendTelegramProactive(text, opts.telegramMarkup));
  }
  if (shouldNotify(matrix, event, 'chat')) {
    jobs.push(
      appendAssistantMessage(text).catch(err => {
        log.error('Chat notify failed', { error: String(err), event });
      }),
    );
  }
  if (shouldNotify(matrix, event, 'ha_notify')) {
    jobs.push(sendHaNotify(text));
  }
  if (shouldNotify(matrix, event, 'persistent')) {
    jobs.push(sendPersistentNotification(text, { notificationId: opts.notificationId }));
  }

  await Promise.all(jobs);
}
