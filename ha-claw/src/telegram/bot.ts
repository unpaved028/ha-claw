/**
 * bot.ts – Telegram Bot with Agentic Loop integration.
 *
 * Messages from whitelisted users are routed through the agentic loop.
 * Dangerous tool calls trigger an inline keyboard for confirmation.
 */

import { Bot } from 'grammy';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { runAgenticLoop } from '../core/agentic-loop.js';
import { whitelistGuard } from './whitelist.js';
import { setupConfirmationHandler, createTelegramConfirmFn } from './confirmation.js';

const log = createLogger('telegram');

const DEFAULT_AGENT = {
  name: 'butler',
  systemPrompt: [
    'Du bist HA-Claw, ein lokaler KI-Assistent für Smart Home und Produktivität.',
    'Du läufst als Home Assistant Add-on.',
    'Du antwortest knapp, hilfreich und auf Deutsch.',
    'Du hast Zugriff auf Tools – nutze sie, wenn nötig.',
    'Antworte nie mit Informationen, die du nicht sicher weißt.',
  ].join('\n'),
};

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
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '🤖 *HA-Claw online.*\n\nSchreib mir einfach, was du brauchst.\n\n' +
        '`/status` – Systemstatus\n`/ping` – Lebenszeichen',
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('ping', async (ctx) => {
    const s = process.uptime();
    await ctx.reply(`🏓 Pong! Uptime: ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
  });

  bot.command('status', async (ctx) => {
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
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    log.info('Processing message', { userId: ctx.from.id, length: text.length });

    // Show typing indicator
    await ctx.replyWithChatAction('typing');

    try {
      const confirmFn = createTelegramConfirmFn(bot, chatId);
      const result = await runAgenticLoop(text, DEFAULT_AGENT, confirmFn);

      // Send response (handle Telegram's 4096 char limit)
      const response = result.response;
      if (response.length <= 4096) {
        await ctx.reply(response, { parse_mode: 'Markdown' }).catch(() =>
          ctx.reply(response), // Fallback without markdown if parsing fails
        );
      } else {
        // Split into chunks
        for (let i = 0; i < response.length; i += 4096) {
          await ctx.reply(response.slice(i, i + 4096));
        }
      }

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

  bot.catch((err) => {
    log.error('Bot error', { error: String(err.error) });
  });

  return bot;
}

export async function startBot(bot: Bot): Promise<void> {
  const me = await bot.api.getMe();
  log.info('Telegram bot started', { username: me.username, id: me.id });
  bot.start({ onStart: () => log.info('Long-polling active') });
}
