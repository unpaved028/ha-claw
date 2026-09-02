/**
 * ha-notify.ts – Home Assistant notify.entity and persistent_notification.
 *
 * The Settings matrix decides whether these fire. Telegram is a separate channel.
 */

import { appConfig } from './config.js';
import { createLogger } from './logger.js';
import { getProfile } from './profile.js';
import * as ha from './ha-client.js';

const log = createLogger('ha-notify');

export interface NotifyTarget {
  domain: 'notify';
  service: string;
}

/** Accepts `notify.mobile_app_pixel`; anything else is rejected. */
export function parseNotifyEntity(raw: string | undefined | null): NotifyTarget | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  const m = /^notify\.([a-z0-9_]+)$/.exec(s);
  if (!m?.[1]) return null;
  return { domain: 'notify', service: m[1] };
}

export function isHaNotifyConfigured(): boolean {
  return parseNotifyEntity(appConfig.notifyEntity) !== null;
}

function notifyTitle(): string {
  return getProfile().botName?.trim() || 'HA-Claw';
}

export async function sendHaNotify(message: string): Promise<void> {
  const target = parseNotifyEntity(appConfig.notifyEntity);
  if (!target) return;
  if (!ha.isHAAvailable()) {
    log.warn('HA notify skipped: Home Assistant API unavailable');
    return;
  }
  const title = notifyTitle();
  try {
    await ha.callService(target.domain, target.service, { title, message });
    log.info('HA notify sent', { entity: `notify.${target.service}` });
  } catch (err) {
    log.error('HA notify failed', { error: String(err), entity: `notify.${target.service}` });
  }
}

export async function sendPersistentNotification(
  message: string,
  opts: { notificationId?: string } = {},
): Promise<void> {
  if (!ha.isHAAvailable()) {
    log.warn('persistent_notification skipped: Home Assistant API unavailable');
    return;
  }
  const data: Record<string, unknown> = { title: notifyTitle(), message };
  if (opts.notificationId) data['notification_id'] = opts.notificationId;
  try {
    await ha.callService('persistent_notification', 'create', data);
    log.info('persistent_notification created', { id: opts.notificationId });
  } catch (err) {
    log.error('persistent_notification failed', { error: String(err) });
  }
}
