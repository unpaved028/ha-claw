/**
 * bot.ts – Telegram Bot with Agentic Loop integration.
 *
 * Messages from whitelisted users are routed through the agentic loop,
 * using the same conversation, prompt and cache as the Web UI.
 * Dangerous tool calls trigger an inline keyboard for confirmation.
 */

import { Bot, InlineKeyboard } from 'grammy';
import { appConfig } from '../core/config.js';
import * as ha from '../core/ha-client.js';
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
import {
  SHARED_CONVERSATION_ID,
  loadConversation,
  saveConversation,
  appendUserMessage,
  appendAssistantMessage,
} from '../storage/conversation.js';
import { getGlobalStats } from '../storage/usage-tracker.js';
import {
  getCachedSystemHealth,
  getSystemHealth,
  formatHealthSummary,
} from '../core/system-health.js';
import { loadMainPrompt } from '../core/prompts.js';
import { dateLocale, t } from '../core/strings.js';
import { whitelistGuard } from './whitelist.js';
import { setupConfirmationHandler, createTelegramConfirmFn } from './confirmation.js';
import { processVoiceMessage } from './voice.js';

const log = createLogger('telegram');

function buildAgent() {
  const profile = getProfile();
  const basePrompt = loadMainPrompt();
  const personality = personalityPrompt();
  return {
    name: 'main',
    systemPrompt: `${basePrompt}\n\n## ${t('prompt.personalityHeading')}\n${personality}${getSchedulerSummary()}`,
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
    await ctx.reply(t('telegram.start'), { parse_mode: 'Markdown' });
  });

  bot.command('ping', async ctx => {
    const s = process.uptime();
    await ctx.reply(
      t('telegram.pong', { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) }),
    );
  });

  bot.command('status', async ctx => {
    const mem = process.memoryUsage();
    const stats = await getGlobalStats();

    let usageMsg = '';
    if (stats) {
      usageMsg = t('telegram.statusUsage', {
        requests: stats.numRequests,
        tokens: stats.totalTokens.toLocaleString(),
        cost: stats.totalCostUsd.toFixed(4),
      });
    }

    let healthMsg;
    try {
      const health = (await getCachedSystemHealth()) ?? (await getSystemHealth());
      const when = new Date(health.checkedAt).toLocaleString(dateLocale(), {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      healthMsg = `\n🩺 *${t('telegram.statusHealthHead')}* (${when})\n${formatHealthSummary(health)}`;
    } catch (err) {
      log.warn('Health check for /status failed', { error: String(err) });
      healthMsg = `\n🩺 *${t('telegram.statusHealthHead')}*\n${t('telegram.statusHealthFail')}`;
    }

    await ctx.reply(
      t('telegram.statusBody', {
        uptime: Math.floor(process.uptime() / 60),
        heap: (mem.heapUsed / 1024 / 1024).toFixed(1),
        mode: appConfig.isAddon ? 'HA Add-on' : 'Standalone',
        node: process.version,
        usage: usageMsg,
        health: healthMsg,
      }),
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('help', async ctx => {
    await ctx.reply(t('telegram.help'), { parse_mode: 'Markdown' });
  });

  bot.command('rooms', async ctx => {
    try {
      const areaMap = await ha.getAreaEntityMap();
      const areas = Object.keys(areaMap).sort();

      if (areas.length === 0) {
        return await ctx.reply(t('telegram.noRooms'));
      }

      const keyboard = new InlineKeyboard();
      for (let i = 0; i < areas.length; i++) {
        keyboard.text(areas[i], `room:${areas[i]}`);
        if ((i + 1) % 2 === 0) keyboard.row();
      }

      await ctx.reply(t('telegram.roomsTitle'), {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err) {
      log.error('Failed to list rooms', { error: String(err) });
      await ctx.reply(t('telegram.roomsFail'));
    }
  });

  bot.callbackQuery(/^room:(.+)$/, async ctx => {
    const room = ctx.match[1];
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Same path as typing "Status von OG Bad" in the Web UI – shared history,
    // shared cache lookup, no empty throwaway context.
    await ctx.replyWithChatAction('typing');
    await handleAgenticLoop(ctx, chatId, ctx.from?.id ?? null, t('telegram.roomStatus', { room }));
  });

  // ── Agentic Loop Entry Point ────────────────────────────
  bot.on(['message:text', 'message:voice'], async ctx => {
    const chatId = ctx.chat.id;
    let text = ctx.message?.text;

    if (ctx.message?.voice) {
      await ctx.replyWithChatAction('typing');
      try {
        const transcript = await processVoiceMessage(ctx);
        if (!transcript) return;
        text = transcript;
        await ctx.reply(t('telegram.voiceHeard', { text }), { parse_mode: 'Markdown' });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`❌ ${errMsg}`);
        return;
      }
    }

    if (!text) return;

    log.info('Processing message', { userId: ctx.from.id, length: text.length });

    // Save Telegram chat ID for proactive notifications
    const profile = getProfile();
    if (!profile.telegramChatId) {
      await saveProfile({ telegramChatId: chatId });
    }

    // Show typing indicator
    await ctx.replyWithChatAction('typing');

    // ── Onboarding ──
    if (needsOnboarding()) {
      if (!isOnboarding(SHARED_CONVERSATION_ID)) startOnboarding(SHARED_CONVERSATION_ID);
      try {
        const agent = buildOnboardingAgent();
        const confirmFn = createTelegramConfirmFn(bot, chatId, ctx.from.id);
        const history = await appendUserMessage(text);
        const result = await runAgenticLoop(
          text,
          agent,
          confirmFn,
          history,
          ONBOARDING_TOOLS,
          () => {
            ctx.replyWithChatAction('typing').catch(console.error);
          },
        );

        await appendAssistantMessage(result.response);

        if (!needsOnboarding()) endOnboarding(SHARED_CONVERSATION_ID);
        await sendTelegramResponse(ctx as any, result.response);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error('Onboarding error', { error: errMsg });
        await ctx.reply(t('telegram.onboardingError', { error: errMsg.slice(0, 200) }));
      }
      return;
    }

    await handleAgenticLoop(ctx, chatId, ctx.from.id, text);
  });

  bot.callbackQuery('retry:loop', async ctx => {
    await ctx.answerCallbackQuery(t('telegram.retryStart'));
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const history = await loadConversation();
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user');

    if (!lastUserMsg || typeof lastUserMsg.content !== 'string') {
      await ctx.reply(t('telegram.retryNone'));
      return;
    }

    await ctx.replyWithChatAction('typing');
    await handleAgenticLoop(ctx, chatId, ctx.from?.id ?? null, lastUserMsg.content, true);
  });

  async function handleAgenticLoop(
    ctx: any,
    chatId: number,
    userId: number | null,
    text: string,
    isRetry = false,
  ) {
    try {
      const confirmFn = createTelegramConfirmFn(bot, chatId, userId);
      const agent = buildAgent();

      let history = await loadConversation();
      if (isRetry && history.length > 0 && history[history.length - 1].role === 'user') {
        history = history.slice(0, -1);
        await saveConversation(history);
      }

      history = await appendUserMessage(text);

      const result = await runAgenticLoop(text, agent, confirmFn, history, undefined, () => {
        ctx.replyWithChatAction('typing').catch(console.error);
      });

      await appendAssistantMessage(result.response);
      await sendTelegramResponse(ctx as any, result.response);

      log.info('Response sent', {
        iterations: result.iterations,
        toolCalls: result.toolCalls.length,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error('Agentic loop error', { error: errMsg });
      const keyboard = new InlineKeyboard().text(t('telegram.retryBtn'), 'retry:loop');
      await ctx.reply(t('telegram.loopError', { error: errMsg.slice(0, 200) }), {
        reply_markup: keyboard,
      });
    }
  }

  bot.catch(err => {
    log.error('Bot error', { error: String(err.error) });
  });

  return bot;
}

/**
 * Send a reply using HTML, not Telegram Markdown.
 *
 * Legacy Markdown treats `_` as italic, which silently mangles Home Assistant
 * entity ids (`light.og_bad_spiegel`). HTML leaves underscores alone. A small
 * markdown subset (**bold**, `code`, fenced blocks) is converted so formatting
 * still roughly matches the Web UI.
 */
function toTelegramHtml(markdown: string): string {
  const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

async function sendTelegramResponse(
  ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> },
  response: string,
): Promise<void> {
  const html = toTelegramHtml(response);
  if (html.length <= 4096) {
    await ctx.reply(html, { parse_mode: 'HTML' }).catch(() => ctx.reply(response));
    return;
  }
  for (let i = 0; i < response.length; i += 4096) {
    await ctx.reply(response.slice(i, i + 4096));
  }
}

export async function startBot(bot: Bot): Promise<void> {
  const me = await bot.api.getMe();
  log.info('Telegram bot started', { username: me.username, id: me.id });

  // Set command menu
  await bot.api.setMyCommands([
    { command: 'help', description: t('telegram.cmdHelp') },
    { command: 'rooms', description: t('telegram.cmdRooms') },
    { command: 'status', description: t('telegram.cmdStatus') },
    { command: 'ping', description: t('telegram.cmdPing') },
  ]);

  bot.start({ onStart: () => log.info('Long-polling active') });
}
