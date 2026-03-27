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
import { loadProfile } from './core/profile.js';
import { initStorage } from './storage/json-store.js';
import { initMemoryCards } from './storage/memory-cards.js';
import { initBacklog } from './storage/backlog.js';
import { initActionLog } from './storage/action-log.js';
import { initScheduler, stopScheduler } from './storage/scheduler.js';
import { registerBuiltinTools } from './tools/builtins.js';
import { registerHATools } from './tools/ha-tools.js';
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

  // Step 3: Profile
  const profile = await loadProfile();
  log.info('Profile loaded', { botName: profile.botName, onboarding: profile.onboardingComplete });

  // Step 4: Built-in tools (always)
  registerBuiltinTools();

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
  if (appConfig.telegramBotToken) {
    const bot = createBot();
    await startBot(bot);

    const shutdown = (sig: string) => {
      log.info(`Received ${sig}, shutting down...`);
      stopScheduler();
      bot.stop();
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

  // Step 7: Scheduler – runs jobs through the agentic loop
  await initScheduler(async (job) => {
    log.info('Scheduler executing job', { id: job.id, message: job.message });
    const agent = buildAgent();
    const result = await runAgenticLoop(job.message, agent);
    return result.response;
  });

  log.info('=== HA-Claw ready ===');
}

main().catch((err) => {
  log.error('Fatal startup error', { error: String(err) });
  console.error(err);
  process.exit(1);
});
