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
import { initBacklogProcessor } from './storage/backlog-processor.js';
import { initActionLog } from './storage/action-log.js';
import { initLearning } from './storage/learning.js';
import { initScheduler, stopScheduler } from './storage/scheduler.js';
import { buildWeeklyDigest, ensureWeeklyDigestJob } from './core/home-review.js';
import { registerBuiltinTools } from './tools/builtins.js';
import { registerHATools } from './tools/ha-tools.js';
import { registerHABestPracticesTools } from './tools/ha-best-practices.js';
import { getToolNames, applyDisabledTools } from './tools/registry.js';
import { startWebServer, closeWebServer, buildAgent } from './web/server.js';
import { runAgenticLoop } from './core/agentic-loop.js';
import { createBot, startBot } from './telegram/bot.js';
import { setupProactiveNotifications } from './telegram/notifications.js';
import { isHaNotifyConfigured, parseNotifyEntity } from './core/ha-notify.js';
import { dispatchNotify } from './core/notify-dispatch.js';
import { isNotifyEventId } from './core/notify-matrix.js';
import { onNewHighPriorityTask } from './storage/backlog.js';
import { onExecutionFinished } from './storage/backlog-processor.js';
import { runAnalysis } from './core/proactive-analysis.js';
import { getSystemHealth, findHealthRegressions } from './core/system-health.js';
import { refreshLanguage } from './core/locale.js';
import { t } from './core/strings.js';
import { InlineKeyboard } from 'grammy';

const log = createLogger('main');

let cacheRefreshTimer: ReturnType<typeof setInterval> | null = null;
let analysisTimer: ReturnType<typeof setInterval> | null = null;
let telegramBot: ReturnType<typeof createBot> | null = null;
let shuttingDown = false;

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

    cacheRefreshTimer = setInterval(
      async () => {
        try {
          await buildEntityCache();
          log.info('Entity cache refreshed (periodic)');
        } catch (err) {
          log.warn('Periodic cache refresh failed', { error: String(err) });
        }
      },
      30 * 60 * 1000,
    );
  } else {
    log.info('Home Assistant API not available – HA tools disabled');
  }

  // Apply persisted disabled-tools state
  await applyDisabledTools();

  log.info('All tools registered', { tools: getToolNames() });

  const language = await refreshLanguage();
  log.info('Language resolved', { language, option: appConfig.language });

  // Step 5: Web server (always – needed for Ingress)
  await startWebServer();

  if (appConfig.telegramBotToken) {
    telegramBot = createBot();
    setupProactiveNotifications(telegramBot);
    await startBot(telegramBot);
  } else {
    log.info('Telegram not configured – bot disabled');
  }

  if (appConfig.notifyEntity && !parseNotifyEntity(appConfig.notifyEntity)) {
    log.warn('notify_entity is set but is not a notify.* entity id — HA notify disabled', {
      value: appConfig.notifyEntity,
    });
  } else if (isHaNotifyConfigured()) {
    log.info('HA notify configured', { entity: appConfig.notifyEntity });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Step 7: Scheduler – runs jobs through the agentic loop + proactive notifications
  await initScheduler(async job => {
    log.info('Scheduler executing job', { id: job.id, message: job.message, kind: job.kind });
    const response =
      job.kind === 'digest'
        ? (await buildWeeklyDigest()).text
        : (await runAgenticLoop(job.message, buildAgent())).response;

    if (job.kind === 'digest') {
      await dispatchNotify('digest', response, { notificationId: 'ha_claw_digest' });
    } else {
      await dispatchNotify('other_jobs', response, { notificationId: `ha_claw_job_${job.id}` });
    }

    return response;
  });
  await ensureWeeklyDigestJob();

  // Step 8: Backlog processor – auto-processes approved tasks
  initBacklogProcessor(buildAgent);

  // Step 9: Proactive Analysis Loop & Push Hooks
  // The Settings notify matrix decides which channels fire; hooks always run.
  onNewHighPriorityTask(task => {
    const kb = new InlineKeyboard()
      .text(t('push.taskRun'), `task:fast_track:${task.id}`)
      .text(t('push.taskIgnore'), `task:reject:${task.id}`);

    const msg = t('push.newTask', { title: task.title, asIs: task.asIs, toBe: task.toBe });
    dispatchNotify('new_task', msg, {
      telegramMarkup: kb,
      notificationId: `ha_claw_task_${task.id}`,
    }).catch(err => log.error('Failed to send push', { error: String(err) }));
  });

  onExecutionFinished(task => {
    if (task.status === 'done') {
      const msg = t('push.taskDone', {
        title: task.title,
        result: String(task.executionResult || t('push.noResult')).substring(0, 1000),
      });
      dispatchNotify('task_done', msg, { notificationId: `ha_claw_task_${task.id}` }).catch(err =>
        log.error('Failed to send finish push', { error: String(err) }),
      );
    } else {
      const msg = t('push.taskFail', {
        title: task.title,
        result: String(task.executionResult || t('push.unknown')).substring(0, 1000),
      });
      dispatchNotify('task_fail', msg, { notificationId: `ha_claw_task_${task.id}` }).catch(err =>
        log.error('Failed to send error push', { error: String(err) }),
      );
    }
  });

  analysisTimer = setInterval(
    async () => {
      try {
        log.info('Running periodic system analysis (60 min)');
        await runAnalysis();
      } catch (err) {
        log.error('Periodic analysis failed', { error: String(err) });
      }

      try {
        await reportHealthRegressions();
      } catch (err) {
        log.error('Health check failed', { error: String(err) });
      }
    },
    60 * 60 * 1000,
  );

  log.info('=== HA-Claw ready ===');

  if (isHAAvailable()) {
    void getSystemHealth()
      .then(() => log.info('Initial system health check complete'))
      .catch(err => log.warn('Initial system health check failed', { error: String(err) }));
  }
}

/**
 * Push a message only when the installation's health actually got worse.
 *
 * Unlike the backlog, health checks describe a standing condition – in many
 * homes a handful of devices are permanently unreachable. Reporting that every
 * hour is noise, so findHealthRegressions only returns checks that escalated
 * in severity or at least doubled since the last message.
 */
async function reportHealthRegressions(): Promise<void> {
  const health = await getSystemHealth();
  const regressions = await findHealthRegressions(health);

  if (regressions.length === 0) return;

  const body = regressions
    .map(r => `*${r.label}: ${r.short ?? r.count}*\n${r.detail}\n_${r.hint}_`)
    .join('\n\n');

  await dispatchNotify('health_bundle', `${t('push.healthWorse')}\n\n${body}`, {
    notificationId: 'ha_claw_health',
  }).catch(err => log.error('Failed to send health push', { error: String(err) }));

  for (const r of regressions) {
    const text = `*${r.label}: ${r.short ?? r.count}*\n${r.detail}\n_${r.hint}_`;
    const event = `health.${r.key}`;
    if (!isNotifyEventId(event)) continue;
    await dispatchNotify(event, `${t('push.healthWorse')}\n\n${text}`, {
      notificationId: `ha_claw_health_${r.key}`,
    }).catch(err =>
      log.error('Failed to send health-check push', { error: String(err), key: r.key }),
    );
  }
}

async function shutdown(sig: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${sig}, shutting down...`);
  if (cacheRefreshTimer) clearInterval(cacheRefreshTimer);
  if (analysisTimer) clearInterval(analysisTimer);
  stopScheduler();
  try {
    telegramBot?.stop();
  } catch (err) {
    log.warn('Telegram stop failed', { error: String(err) });
  }
  try {
    await closeWebServer();
  } catch (err) {
    log.warn('Web server close failed', { error: String(err) });
  }
  process.exit(0);
}

main().catch(err => {
  log.error('Fatal startup error', { error: String(err) });
  console.error(err);
  process.exit(1);
});
