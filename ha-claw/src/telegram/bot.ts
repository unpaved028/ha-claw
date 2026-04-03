/**
 * bot.ts – Telegram Bot with Agentic Loop integration.
 *
 * Messages from whitelisted users are routed through the agentic loop.
 * Dangerous tool calls trigger an inline keyboard for confirmation.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Bot } from 'grammy';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { getProfile, personalityPrompt, needsOnboarding, saveProfile } from '../core/profile.js';
import {
  isOnboarding,
  startOnboarding,
  endOnboarding,
  loadOnboardingPrompt,
} from '../core/onboarding.js';
import { getSchedulerSummary } from '../storage/scheduler.js';
import { runAgenticLoop } from '../core/agentic-loop.js';
import type { ChatMessage } from '../core/types.js';
import * as store from '../storage/json-store.js';
import { whitelistGuard } from './whitelist.js';
import { setupConfirmationHandler, createTelegramConfirmFn } from './confirmation.js';

const log = createLogger('telegram');

function loadButlerPrompt(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const mdPath = resolve(dir, '../../agents/butler.md');
    let prompt = readFileSync(mdPath, 'utf-8');
    return prompt;
  } catch {
    return [
      'Du bist HA-Claw, ein lokaler KI-Assistent für Smart Home und Produktivität.',
      'Du läufst als Home Assistant Add-on.',
      'Du antwortest knapp, hilfreich und auf Deutsch.',
      'Du hast Zugriff auf Tools – nutze sie, wenn nötig.',
    ].join('\n');
  }
}

function buildAgent() {
  const profile = getProfile();
  const basePrompt = loadButlerPrompt();
  const personality = personalityPrompt();
  return {
    name: 'butler',
    systemPrompt: `${basePrompt}\n\n## Persoenlichkeit & Profil\n${personality}${getSchedulerSummary()}`,
    model: profile.modelOverride || undefined,
  };
}

function buildOnboardingAgent() {
  const profile = getProfile();
  const prompt = loadOnboardingPrompt();
  return {
    name: 'onboarding',
    systemPrompt: prompt,
    model: profile.modelOverride || undefined,
  };
}

const ONBOARDING_TOOLS = ['save_onboarding_profile', 'get_current_time', 'schedule_create'];

export function createBot(): Bot {
  if (!appConfig.telegramBotToken) {
    throw new Error('Cannot create bot without telegram_bot_token');
  }

  const bot = new Bot(appConfig.telegramBotToken);

  // Security: Whitelist FIRST
  bot.use(whitelistGuard);

  // Safety gate handler
  setupConfirmationHandler(bot);

  // ── Commands ────────────────────────────────────────────
  bot.command('start', async ctx => {
    await ctx.reply(
      '🤖 *HA-Claw online.*\n\nSchreib mir einfach, was du brauchst.\n\n' +
        '`/status` – Systemstatus\n`/ping` – Lebenszeichen',
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('ping', async ctx => {
    const s = process.uptime();
    await ctx.reply(`🏓 Pong! Uptime: ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
  });

  bot.command('status', async ctx => {
    const mem = process.memoryUsage();
    await ctx.reply(
      `📊 *HA-Claw Status*\n\n` +
        `• Uptime: ${Math.floor(process.uptime())}s\n` +
        `• Memory: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
        `• Mode: ${appConfig.isAddon ? 'HA Add-on' : 'Standalone'}\n` +
        `• Node: ${process.version}`,
      { parse_mode: 'Markdown' },
    );
  });

  // ── Agentic Loop Entry Point ────────────────────────────
  bot.on('message:text', async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const sessionId = `tg-${chatId}`;

    log.info('Processing message', { userId: ctx.from.id, length: text.length });

    // Save Telegram chat ID for proactive notifications
    const profile = getProfile();
    if (!profile.telegramChatId) {
      await saveProfile({ telegramChatId: chatId });
    }

    // Show typing indicator
    await ctx.replyWithChatAction('typing');

    // Onboarding: route through agentic loop with onboarding agent
    if (needsOnboarding()) {
      if (!isOnboarding(sessionId)) startOnboarding(sessionId);
      try {
        const agent = buildOnboardingAgent();
        const confirmFn = createTelegramConfirmFn(bot, chatId);
        const record = await store.read<{ messages: ChatMessage[] } & store.StoredRecord>(
          'conversations',
          sessionId,
        );
        const history = record?.messages || [];
        const result = await runAgenticLoop(text, agent, confirmFn, history, ONBOARDING_TOOLS);

        // Persist history
        const newMessages: ChatMessage[] = [
          ...history,
          { role: 'user', content: text },
          { role: 'assistant', content: result.response },
        ];
        await store.upsert('conversations', sessionId, { messages: newMessages.slice(-20) });

        // If onboarding completed, clean up session
        if (!needsOnboarding()) endOnboarding(sessionId);

        await sendTelegramResponse(ctx, result.response);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error('Onboarding error', { error: errMsg });
        await ctx.reply(`❌ Fehler: ${errMsg.slice(0, 200)}`);
      }
      return;
    }

    try {
      const confirmFn = createTelegramConfirmFn(bot, chatId);
      const agent = buildAgent();

      // Daily greeting hint
      let userMessage = text;
      const today = new Date().toISOString().slice(0, 10);
      const currentProfile = getProfile();
      if (currentProfile.lastInteractionDate !== today) {
        userMessage = `[System: Erste Nachricht des Nutzers heute. Begruesse ihn kurz passend zur Tageszeit, dann beantworte seine Frage.]\n\n${text}`;
        await saveProfile({ lastInteractionDate: today });
      }

      // 1. Load context/history
      const record = await store.read<{ messages: ChatMessage[] } & store.StoredRecord>(
        'conversations',
        sessionId,
      );
      const history = record?.messages || [];

      // 2. Run loop (passing history)
      const result = await runAgenticLoop(userMessage, agent, confirmFn, history);

      // 3. Persist history
      const newMessages: ChatMessage[] = [
        ...history,
        { role: 'user', content: text },
        { role: 'assistant', content: result.response },
      ];
      // Limit to 20 messages for performance
      const limited = newMessages.slice(-20);
      await store.upsert('conversations', sessionId, { messages: limited });

      await sendTelegramResponse(ctx, result.response);

      log.info('Response sent', {
        iterations: result.iterations,
        toolCalls: result.toolCalls.length,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error('Agentic loop error', { error: errMsg });
      await ctx.reply(`❌ Fehler: ${errMsg.slice(0, 200)}`);
    }
  });

  bot.catch(err => {
    log.error('Bot error', { error: String(err.error) });
  });

  return bot;
}

/** Send a response via Telegram, handling markdown fallback and 4096 char limit. */
async function sendTelegramResponse(
  ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> },
  response: string,
): Promise<void> {
  if (response.length <= 4096) {
    await ctx.reply(response, { parse_mode: 'Markdown' }).catch(() => ctx.reply(response));
  } else {
    for (let i = 0; i < response.length; i += 4096) {
      await ctx.reply(response.slice(i, i + 4096));
    }
  }
}

export async function startBot(bot: Bot): Promise<void> {
  const me = await bot.api.getMe();
  log.info('Telegram bot started', { username: me.username, id: me.id });
  bot.start({ onStart: () => log.info('Long-polling active') });
}
