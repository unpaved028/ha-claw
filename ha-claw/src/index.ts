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
 */

import { appConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { isHAAvailable } from './core/ha-client.js';
import { initStorage } from './storage/json-store.js';
import { registerBuiltinTools } from './tools/builtins.js';
import { registerHATools } from './tools/ha-tools.js';
import { getToolNames } from './tools/registry.js';
import { startWebServer } from './web/server.js';
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

  // Step 2: Storage
  await initStorage();

  // Step 3: Built-in tools (always)
  registerBuiltinTools();

  // Step 4: HA tools (only when HA API is reachable)
  if (isHAAvailable()) {
    registerHATools();
    log.info('Home Assistant API available');
  } else {
    log.info('Home Assistant API not available – HA tools disabled');
  }

  log.info('All tools registered', { tools: getToolNames() });

  // Step 5: Web server (always – needed for Ingress)
  await startWebServer();

  // Step 6: Telegram (optional)
  if (appConfig.telegramBotToken) {
    const bot = createBot();
    await startBot(bot);

    const shutdown = (sig: string) => {
      log.info(`Received ${sig}, shutting down...`);
      bot.stop();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } else {
    log.info('Telegram not configured – bot disabled');
    const shutdown = (sig: string) => {
      log.info(`Received ${sig}`);
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  log.info('=== HA-Claw ready ===');
}

main().catch((err) => {
  log.error('Fatal startup error', { error: String(err) });
  console.error(err);
  process.exit(1);
});
