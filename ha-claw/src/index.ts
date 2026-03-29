/**
 * index.ts – HA-Claw Entry Point.
 *
 * Boot sequence:
 * 1. Validate config
 * 2. Initialize storage
 * 3. Register built-in tools
 * 4. Register HA tools (if SUPERVISOR_TOKEN available)
 * 5. Start web server (Ingress)
 * 6. Start Telegram bot (optional)
 * 7. Start scheduler
 */

import { appConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { isHAAvailable } from './core/ha-client.js';
import { buildEntityCache } from './core/entity-cache.js';
import { loadProfile, getProfile } from './core/profile.js';
import { initStorage } from './storage/json-store.js';
import { initMemoryCards } from './storage/memory-cards.js';
import { initBacklog } from './storage/backlog.js';
import { initBacklogProcessor } from './storage/backlog-processor.js';
import { initActionLog } from './storage/action-log.js';
import { initLearning } from './storage/learning.js';
import { initScheduler, stopScheduler } from './storage/scheduler.js';
import { registerBuiltinTools } from './tools/builtins.js';
import { registerHATools } from './tools/ha-tools.js';
import { registerHABestPracticesTools } from './tools/ha-best-practices.js';
import { getToolNames, applyDisabledTools } from './tools/registry.js';
import { startWebServer, buildAgent } from './web/server.js';
import { runAgenticLoop } from './core/agentic-loop.js';
import { createBot, startBot } from './telegram/bot.js';

const log = createLogger('main');

async function main(): Promise<void> {
  log.info('=== HA-Claw starting ===', {
    pid: process.pid,
    node: process.version,
    mode: appConfig.isAddon ? 'addon' : 'standalone',
  });

  // Step 1: Config already validated on import
  log.info('Config loaded', { model: appConfig.openRouterDefaultModel });

  // Step 2: Storage + Memory
  await initStorage();
  await initMemoryCards();
  await initBacklog();
  await initActionLog();
  await initLearning();

  // Step 3: Profile
  const profile = await loadProfile();
  log.info('Profile loaded', { botName: profile.botName, onboarding: profile.onboardingComplete });

  // Step 4: Built-in tools (always)
  registerBuiltinTools();
  registerHABestPracticesTools();

  // Step 4: HA tools + entity discovery (only when HA API is reachable)
  if (isHAAvailable()) {
    registerHATools();
    log.info('Home Assistant API available');

    // Step 4b: Build entity cache for agent context
    await buildEntityCache();
  } else {
    log.info('Home Assistant API not available – HA tools disabled');
  }

  // Apply persisted disabled-tools state
  await applyDisabledTools();

  log.info('All tools registered', { tools: getToolNames() });

  // Step 5: Web server (always – needed for Ingress)
  await startWebServer();

  // Step 6: Telegram (optional)
  let telegramBot: ReturnType<typeof createBot> | null = null;
  if (appConfig.telegramBotToken) {
    telegramBot = createBot();
    await startBot(telegramBot);

    const shutdown = (sig: string) => {
      log.info(`Received ${sig}, shutting down...`);
      stopScheduler();
      telegramBot!.stop();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } else {
    log.info('Telegram not configured – bot disabled');
    const shutdown = (sig: string) => {
      log.info(`Received ${sig}`);
      stopScheduler();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  // Step 7: Scheduler – runs jobs through the agentic loop + proactive notifications
  await initScheduler(async (job) => {
    log.info('Scheduler executing job', { id: job.id, message: job.message });
    const agent = buildAgent();
    const result = await runAgenticLoop(job.message, agent);

    // Send proactive notification via Telegram if available
    const currentProfile = getProfile();
    if (telegramBot && currentProfile.telegramChatId) {
      try {
        const response = result.response;
        // Respect Telegram's 4096 char limit
        if (response.length <= 4096) {
          await telegramBot.api.sendMessage(currentProfile.telegramChatId, response, { parse_mode: 'Markdown' })
            .catch(() => telegramBot!.api.sendMessage(currentProfile.telegramChatId!, response));
        } else {
          for (let i = 0; i < response.length; i += 4096) {
            await telegramBot.api.sendMessage(currentProfile.telegramChatId, response.slice(i, i + 4096));
          }
        }
        log.info('Proactive notification sent via Telegram', { jobId: job.id });
      } catch (err) {
        log.warn('Failed to send Telegram notification', { jobId: job.id, error: String(err) });
      }
    }

    return result.response;
  });

  // Step 8: Backlog processor – auto-processes approved tasks
  initBacklogProcessor(buildAgent);

  log.info('=== HA-Claw ready ===');
}

main().catch((err) => {
  log.error('Fatal startup error', { error: String(err) });
  console.error(err);
  process.exit(1);
});
