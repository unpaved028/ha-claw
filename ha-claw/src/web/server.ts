/**
 * server.ts – Ingress-compatible Web Server with Chat API.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Fastify from 'fastify';
import { appConfig } from '../core/config.js';
import { createLogger, getLogBuffer, clearLogBuffer } from '../core/logger.js';
import { getProfile, saveProfile, needsOnboarding, personalityPrompt, type Profile } from '../core/profile.js';
import { isOnboarding, startOnboarding, processOnboarding } from '../core/onboarding.js';
import { getToolInfos, setToolEnabled } from '../tools/registry.js';
import { getEntityCache } from '../core/entity-cache.js';
import { runAgenticLoop } from '../core/agentic-loop.js';
import type { ChatMessage } from '../core/types.js';
import { dashboardHtml } from './dashboard.js';
import * as store from '../storage/json-store.js';
import type { CollectionName } from '../storage/json-store.js';
import * as backlog from '../storage/backlog.js';
import { getToolDefinitions } from '../tools/registry.js';
import * as actionLog from '../storage/action-log.js';

const log = createLogger('web');
const STARTUP_TIME = new Date().toISOString();
const VALID = new Set(['notes', 'conversations', 'memory']);

function loadButlerPrompt(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const mdPath = resolve(dir, '../../agents/butler.md');
    let prompt = readFileSync(mdPath, 'utf-8');
    const cache = getEntityCache();
    prompt = prompt.replace('{{ENTITY_CACHE}}', cache || '(Kein HA-Zugriff – Entity-Cache nicht verfügbar.)');
    return prompt;
  } catch {
    log.warn('Could not load butler.md – using fallback prompt');
    return [
      'Du bist HA-Claw, ein lokaler KI-Assistent für Smart Home und Produktivität.',
      'Du läufst als Home Assistant Add-on.',
      'Du antwortest knapp, hilfreich und auf Deutsch.',
      'Du hast Zugriff auf Tools – nutze sie, wenn nötig.',
    ].join('\n');
  }
}

/** Build the agent config with dynamic personality injection. */
function buildAgent() {
  const profile = getProfile();
  const basePrompt = loadButlerPrompt();
  const personality = personalityPrompt();
  return {
    name: 'butler',
    systemPrompt: `${basePrompt}\n\n## Persoenlichkeit & Profil\n${personality}`,
    model: profile.modelOverride || undefined,
  };
}

const WEB_SESSION = 'web';

export async function startWebServer(): Promise<void> {
  const app = Fastify({ logger: false });

  // Health
  app.get('/health', async () => ({
    status: 'ok', version: '0.2.6', uptime: process.uptime(), startedAt: STARTUP_TIME,
    mode: appConfig.isAddon ? 'addon' : 'standalone',
    memory: { heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) },
  }));

  // Dashboard
  app.get('/', async (req, reply) => {
    reply.type('text/html');
    return dashboardHtml((req.headers['x-ingress-path'] as string) || '');
  });

  // ── Chat API (Agentic Loop via Web) ─────────────────────
  app.post<{ Body: { message: string } }>('/api/chat', async (req, reply) => {
    const message = req.body?.message;
    if (!message || typeof message !== 'string') {
      reply.status(400);
      return { error: 'Missing "message" field' };
    }
    log.info('Web chat request', { length: message.length });

    // Onboarding: intercept if first-time setup
    if (needsOnboarding() || isOnboarding(WEB_SESSION)) {
      if (!isOnboarding(WEB_SESSION)) {
        // First message triggers onboarding start
        const greeting = startOnboarding(WEB_SESSION);
        return { response: greeting, iterations: 0, toolCalls: [] };
      }
      const response = await processOnboarding(WEB_SESSION, message);
      return { response, iterations: 0, toolCalls: [] };
    }

    // Normal: agentic loop with dynamic personality
    const agent = buildAgent();

    // 1. Load history
    const record = await store.read<{ messages: ChatMessage[] } & store.StoredRecord>('conversations', WEB_SESSION);
    const history = record?.messages || [];

    // 2. Run loop (passing history)
    const result = await runAgenticLoop(message, agent, undefined, history);

    // 3. Persist updated history
    const newMessages: ChatMessage[] = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: result.response }
    ];

    // Keep it efficient: last 20 messages (~10 turns)
    const limited = newMessages.slice(-20);
    await store.upsert('conversations', WEB_SESSION, { messages: limited });

    return result;
  });

  app.get('/api/chat/history', async () => {
    const record = await store.read<{ messages: ChatMessage[] } & store.StoredRecord>('conversations', WEB_SESSION);
    return record?.messages || [];
  });

  // ── Onboarding status ─────────────────────────────────
  app.get('/api/onboarding', async () => {
    return { needed: needsOnboarding() };
  });

  // ── Settings API ───────────────────────────────────────
  app.get('/api/settings', async () => {
    const profile = getProfile();
    return {
      agent: { name: profile.botName, status: 'active' },
      profile,
      model: profile.modelOverride || appConfig.openRouterDefaultModel,
      mode: appConfig.isAddon ? 'addon' : 'standalone',
      tools: getToolInfos(),
      uptime: process.uptime(),
      memory: { heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) },
      haAvailable: !!(appConfig.supervisorToken && appConfig.haApiUrl),
      telegramConfigured: !!appConfig.telegramBotToken,
      availableModels: Array.from(new Set([
        appConfig.openRouterDefaultModel,
        'google/gemini-2.5-flash-preview',
        'google/gemini-2.0-flash-001',
        'anthropic/claude-sonnet-4',
        'anthropic/claude-3.5-sonnet',
        'deepseek/deepseek-chat',
        'openai/gpt-4o',
        'openai/gpt-4.1-mini',
      ]))
    };
  });

  app.put<{ Body: Partial<Profile> }>(
    '/api/profile',
    async (req) => {
      const updated = await saveProfile(req.body ?? {});
      return updated;
    },
  );

  // ── Tool toggle API ──────────────────────────────────
  app.put<{ Body: { name: string; enabled: boolean } }>(
    '/api/tools/toggle',
    async (req) => {
      const { name, enabled } = req.body ?? {};
      if (!name || typeof enabled !== 'boolean') {
        return { error: 'name (string) and enabled (boolean) required' };
      }
      const ok = await setToolEnabled(name, enabled);
      if (!ok) return { error: `Tool "${name}" not found` };
      return { name, enabled, tools: getToolInfos() };
    },
  );

  // ── Logs API ───────────────────────────────────────────
  app.get('/api/logs', async () => {
    return {
      entries: getLogBuffer(),
      uptime: process.uptime(),
      memory: { heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) },
    };
  });

  app.get('/api/actions', async () => {
    const actions = await actionLog.listActions(100);
    return { count: actions.length, actions };
  });

  app.delete('/api/actions', async () => {
    await actionLog.clearActions();
    return { cleared: true };
  });

  app.post<{ Body: { id: string } }>('/api/actions/rollback', async (req, reply) => {
    const id = req.body?.id;
    if (!id) { reply.status(400); return { error: 'Missing action ID' }; }
    
    const action = await actionLog.getActionById(id);
    if (!action || !action.rollback) {
      reply.status(404);
      return { error: 'Rollback data not found for this action' };
    }

    const { domain, service, entity_id, data } = action.rollback;
    log.info('Executing rollback', { id, domain, service, entity_id });
    
    try {
      // Use HA client directly for rollback to avoid infinite loops or recursion
      const { callService } = await import('../core/ha-client.js');
      const res = await callService(domain, service, { entity_id, ...data });
      
      // Log the rollback itself as a new action
      await actionLog.logAction('system', `Rollback: ${domain}.${service} auf ${entity_id}`, 'rollback');
      
      return res;
    } catch (err) {
      log.error('Rollback failed', { error: String(err) });
      reply.status(500);
      return { error: 'Rollback execution failed' };
    }
  });

  app.get('/api/tools/details', async () => {
    return getToolDefinitions();
  });

  app.delete('/api/logs', async () => {
    clearLogBuffer();
    return { cleared: true };
  });

  // ── Backlog API ──────────────────────────────────────────
  app.get('/api/backlog', async () => {
    const tasks = await backlog.listTasks();
    return { count: tasks.length, tasks };
  });

  app.post<{ Body: Parameters<typeof backlog.createTask>[0] }>('/api/backlog', async (req) => {
    return backlog.createTask(req.body);
  });

  app.put<{ Params: { id: string }; Body: Parameters<typeof backlog.updateTask>[1] }>(
    '/api/backlog/:id',
    async (req, reply) => {
      const task = await backlog.updateTask(req.params.id, req.body ?? {});
      if (!task) { reply.status(404); return { error: 'not found' }; }
      return task;
    },
  );

  app.delete<{ Params: { id: string } }>('/api/backlog/:id', async (req, reply) => {
    const ok = await backlog.deleteTask(req.params.id);
    if (!ok) { reply.status(404); return { error: 'not found' }; }
    return { deleted: true };
  });

  // ── Store CRUD ──────────────────────────────────────────
  app.get<{ Params: { c: string } }>('/api/:c', async (req, reply) => {
    if (!VALID.has(req.params.c)) { reply.status(400); return { error: 'invalid' }; }
    return store.list(req.params.c as CollectionName);
  });

  app.post<{ Params: { c: string }; Body: Record<string, unknown> }>('/api/:c', async (req, reply) => {
    if (!VALID.has(req.params.c)) { reply.status(400); return { error: 'invalid' }; }
    return store.create(req.params.c as CollectionName, req.body ?? {});
  });

  app.delete<{ Params: { c: string; id: string } }>('/api/:c/:id', async (req, reply) => {
    if (!VALID.has(req.params.c)) { reply.status(400); return { error: 'invalid' }; }
    const ok = await store.remove(req.params.c as CollectionName, req.params.id);
    if (!ok) { reply.status(404); return { error: 'not found' }; }
    return { deleted: true };
  });

  const port = appConfig.ingressPort;
  const host = appConfig.isAddon ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ port, host });
  log.info('Web server started', { host, port });
}
