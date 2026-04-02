/**
 * builtins.ts – Built-in tools for the agentic loop.
 *
 * These tools are always available regardless of MCP connections.
 * They cover basic system info and JSON store access.
 */

import { registerTool } from './registry.js';
import * as store from '../storage/json-store.js';
import type { CollectionName } from '../storage/json-store.js';
import * as mem from '../storage/memory-cards.js';
import * as backlog from '../storage/backlog.js';
import * as scheduler from '../storage/scheduler.js';
import * as learning from '../storage/learning.js';
import { runAnalysis } from '../core/proactive-analysis.js';
import { logAction } from '../storage/action-log.js';
import { saveProfile, needsOnboarding } from '../core/profile.js';

export function registerBuiltinTools(): void {
  // ── save_onboarding_profile ───────────────────────────────
  registerTool(
    'save_onboarding_profile',
    'Save the user profile after onboarding. Call this once you have collected bot name, user name, and personality preferences through natural conversation.',
    {
      bot_name: {
        type: 'string',
        description: 'The chosen name for the bot (e.g. "Jarvis", "Alfred")',
      },
      user_name: { type: 'string', description: "The user's name" },
      directness: { type: 'number', description: 'Directness 1-5 (1=diplomatic, 5=very direct)' },
      formality: { type: 'number', description: 'Formality 1-5 (1=casual, 5=professional)' },
      humor: { type: 'number', description: 'Humor 1-5 (1=factual only, 5=very humorous)' },
      verbosity: { type: 'number', description: 'Verbosity 1-5 (1=terse, 5=detailed)' },
    },
    async args => {
      if (!needsOnboarding()) {
        return {
          error: 'Onboarding already completed. Use profile settings to change personality.',
        };
      }
      const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
      const botName = (args['bot_name'] as string).trim();
      const userName = (args['user_name'] as string).trim();
      await saveProfile({
        botName,
        userName,
        personality: {
          directness: clamp((args['directness'] as number) ?? 4),
          formality: clamp((args['formality'] as number) ?? 3),
          humor: clamp((args['humor'] as number) ?? 3),
          verbosity: clamp((args['verbosity'] as number) ?? 2),
        },
        onboardingComplete: true,
      });
      await logAction(
        'system',
        `Onboarding abgeschlossen: Bot=${botName}, User=${userName}`,
        'save_onboarding_profile',
      );
      return { saved: true, botName, userName };
    },
    { required: ['bot_name', 'user_name', 'directness', 'formality', 'humor', 'verbosity'] },
  );

  // ── get_current_time ─────────────────────────────────────
  registerTool(
    'get_current_time',
    'Returns the current date and time in ISO format with timezone.',
    {},
    async () => ({
      iso: new Date().toISOString(),
      local: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
      unix: Date.now(),
    }),
  );

  // ── store_list ───────────────────────────────────────────
  registerTool(
    'store_list',
    'List all records in a collection. Collections: notes, conversations, memory.',
    {
      collection: {
        type: 'string',
        description: 'Collection name: notes, conversations, or memory',
        enum: ['notes', 'conversations', 'memory'],
      },
    },
    async args => {
      const records = await store.list(args['collection'] as CollectionName);
      return { count: records.length, records };
    },
    { required: ['collection'] },
  );

  // ── store_read ───────────────────────────────────────────
  registerTool(
    'store_read',
    'Read a specific record by ID from a collection.',
    {
      collection: {
        type: 'string',
        description: 'Collection name: notes, conversations, or memory',
        enum: ['notes', 'conversations', 'memory'],
      },
      id: { type: 'string', description: 'Record ID' },
    },
    async args => {
      const record = await store.read(args['collection'] as CollectionName, args['id'] as string);
      return record ?? { error: 'Record not found' };
    },
    { required: ['collection', 'id'] },
  );

  // ── store_write ──────────────────────────────────────────
  registerTool(
    'store_write',
    'Create a new record in a collection. Returns the created record with its generated ID.',
    {
      collection: {
        type: 'string',
        description: 'Collection name: notes, conversations, or memory',
        enum: ['notes', 'conversations', 'memory'],
      },
      title: { type: 'string', description: 'Title of the record' },
      content: { type: 'string', description: 'Content of the record' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
    },
    async args => {
      const col = args['collection'] as CollectionName;
      const res = await store.create(col, {
        title: args['title'] ?? 'Untitled',
        content: args['content'] ?? '',
        tags: args['tags'] ?? [],
      });
      if (col === 'notes') {
        await logAction('note', `Notiz erstellt: ${res.title}`, 'store_write');
      }
      return res;
    },
    { required: ['collection', 'content'] },
  );

  // ── store_delete ─────────────────────────────────────────
  registerTool(
    'store_delete',
    'Delete a record by ID from a collection. This action is irreversible.',
    {
      collection: {
        type: 'string',
        description: 'Collection name',
        enum: ['notes', 'conversations', 'memory'],
      },
      id: { type: 'string', description: 'Record ID to delete' },
    },
    async args => {
      const ok = await store.remove(args['collection'] as CollectionName, args['id'] as string);
      return ok ? { deleted: true } : { error: 'Record not found' };
    },
    { dangerous: true, required: ['collection', 'id'] },
  );

  // ── memory_remember ─────────────────────────────────────
  registerTool(
    'memory_remember',
    'Save a fact, decision, preference, or context as a memory card. Use this proactively when you learn something important about the user, their home, preferences, or when making decisions that should persist across conversations.',
    {
      title: { type: 'string', description: 'Short summary of the memory (max 80 chars)' },
      content: { type: 'string', description: 'Detailed content of the memory' },
      category: {
        type: 'string',
        description: 'Category: fact, decision, preference, context, routine',
        enum: ['fact', 'decision', 'preference', 'context', 'routine'],
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Keywords for later retrieval (auto-extracted if omitted)',
      },
      ttl_days: {
        type: 'number',
        description: 'Days until expiry (0 = permanent, default 0)',
      },
    },
    async args => {
      const card = await mem.createCard({
        title: args['title'] as string,
        content: args['content'] as string,
        category: (args['category'] as mem.MemoryCard['category']) ?? 'fact',
        tags: args['tags'] as string[] | undefined,
        ttlDays: (args['ttl_days'] as number) ?? 0,
      });
      await logAction('system', `Erinnerung gespeichert: ${card.title}`, 'memory_remember');
      return { saved: true, id: card.id, title: card.title, tags: card.tags };
    },
    { required: ['title', 'content'] },
  );

  // ── memory_recall ──────────────────────────────────────
  registerTool(
    'memory_recall',
    'Search memory cards by keywords. Returns the most relevant memories for a query. Use this when you need context from previous conversations.',
    {
      query: { type: 'string', description: 'Search query (keywords, topic, or question)' },
      max_results: { type: 'number', description: 'Max results (default 5)' },
    },
    async args => {
      const results = await mem.searchCards(
        args['query'] as string,
        (args['max_results'] as number) ?? 5,
      );
      return {
        count: results.length,
        memories: results.map(r => ({
          id: r.card.id,
          title: r.card.title,
          content: r.card.content,
          category: r.card.category,
          tags: r.card.tags,
          score: +r.score.toFixed(2),
          version: r.card.version,
          updatedAt: r.card.updatedAt,
        })),
      };
    },
    { required: ['query'] },
  );

  // ── memory_update ──────────────────────────────────────
  registerTool(
    'memory_update',
    'Update an existing memory card with new information. Keeps version history.',
    {
      id: { type: 'string', description: 'Memory card ID to update' },
      content: { type: 'string', description: 'Updated content' },
      title: { type: 'string', description: 'Updated title (optional)' },
    },
    async args => {
      const updated = await mem.updateCard(args['id'] as string, {
        content: args['content'] as string,
        title: args['title'] as string | undefined,
      });
      return updated
        ? { updated: true, id: updated.id, version: updated.version }
        : { error: 'Memory card not found' };
    },
    { required: ['id', 'content'] },
  );

  // ── memory_forget ──────────────────────────────────────
  registerTool(
    'memory_forget',
    'Delete a memory card permanently. Use when information is outdated or wrong.',
    {
      id: { type: 'string', description: 'Memory card ID to delete' },
    },
    async args => {
      const ok = await mem.deleteCard(args['id'] as string);
      return ok ? { deleted: true } : { error: 'Memory card not found' };
    },
    { dangerous: true, required: ['id'] },
  );

  // ── memory_list ────────────────────────────────────────
  registerTool(
    'memory_list',
    'List all memory cards (titles and metadata, no full content). Use to get an overview of stored memories.',
    {},
    async () => {
      const cards = await mem.listCards();
      return {
        count: cards.length,
        cards: cards.map(c => ({
          id: c.id,
          title: c.title,
          category: c.category,
          tags: c.tags,
          version: c.version,
          updatedAt: c.updatedAt,
          ttlDays: c.ttlDays,
        })),
      };
    },
  );

  // ── get_system_info ──────────────────────────────────────
  registerTool(
    'get_system_info',
    'Returns system information: uptime, memory usage, Node.js version.',
    {},
    async () => {
      const mem = process.memoryUsage();
      return {
        uptime_seconds: Math.floor(process.uptime()),
        heap_mb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
        rss_mb: +(mem.rss / 1024 / 1024).toFixed(1),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      };
    },
  );

  // ── backlog_propose ─────────────────────────────────────
  registerTool(
    'backlog_propose',
    'Propose a new optimization task for the Smart Home backlog. Use when you identify improvement potential during conversations (energy, comfort, automation, security, maintenance).',
    {
      title: { type: 'string', description: 'Short task title (max 80 chars)' },
      as_is: { type: 'string', description: 'Current state (what exists now)' },
      to_be: { type: 'string', description: 'Desired state (what it should become)' },
      impact: { type: 'string', description: 'Expected benefit (energy savings, comfort, etc.)' },
      priority: {
        type: 'string',
        description: 'Priority: low, medium, high',
        enum: ['low', 'medium', 'high'],
      },
      category: {
        type: 'string',
        description: 'Category: energy, comfort, security, automation, maintenance',
        enum: ['energy', 'comfort', 'security', 'automation', 'maintenance'],
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional keywords for the task',
      },
    },
    async args => {
      const task = await backlog.createTask({
        title: args['title'] as string,
        asIs: args['as_is'] as string,
        toBe: args['to_be'] as string,
        impact: args['impact'] as string,
        priority: (args['priority'] as backlog.Priority) ?? 'medium',
        category: (args['category'] as string) ?? 'automation',
        tags: args['tags'] as string[] | undefined,
        proposedBy: 'agent',
      });
      await logAction(
        'task',
        `Optimierung vorgeschlagen: ${task.id} - ${task.title}`,
        'backlog_propose',
      );
      return { proposed: true, id: task.id, title: task.title, priority: task.priority };
    },
    { required: ['title', 'as_is', 'to_be', 'impact'] },
  );

  // ── backlog_list ────────────────────────────────────────
  registerTool(
    'backlog_list',
    'List all optimization tasks in the backlog. Optionally filter by status or priority.',
    {
      status: {
        type: 'string',
        description: 'Filter by status: proposed, approved, in_progress, done, rejected',
        enum: ['proposed', 'approved', 'in_progress', 'done', 'rejected', 'deferred'],
      },
      priority: {
        type: 'string',
        description: 'Filter by priority: low, medium, high',
        enum: ['low', 'medium', 'high'],
      },
    },
    async args => {
      const tasks = await backlog.listTasks({
        status: args['status'] as backlog.TaskStatus | undefined,
        priority: args['priority'] as backlog.Priority | undefined,
      });
      return {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status,
          category: t.category,
          proposedBy: t.proposedBy,
          updatedAt: t.updatedAt,
        })),
      };
    },
  );

  // ── backlog_update ──────────────────────────────────────
  registerTool(
    'backlog_update',
    'Update status or details of a backlog task (e.g., approve, start, complete, reject).',
    {
      id: { type: 'string', description: 'Task ID (e.g., T-A1B2C3)' },
      status: {
        type: 'string',
        description: 'New status: proposed, approved, in_progress, done, rejected',
        enum: ['proposed', 'approved', 'in_progress', 'done', 'rejected', 'deferred'],
      },
      priority: {
        type: 'string',
        description: 'New priority',
        enum: ['low', 'medium', 'high'],
      },
      title: { type: 'string', description: 'Updated title' },
    },
    async args => {
      const updates: Record<string, unknown> = {};
      if (args['status']) updates['status'] = args['status'];
      if (args['priority']) updates['priority'] = args['priority'];
      if (args['title']) updates['title'] = args['title'];
      const task = await backlog.updateTask(
        args['id'] as string,
        updates as Parameters<typeof backlog.updateTask>[1],
      );
      if (task && args['status']) {
        await logAction(
          'task',
          `Status von ${task.id} geändert auf: ${task.status}`,
          'backlog_update',
        );
      }
      return task
        ? { updated: true, id: task.id, status: task.status }
        : { error: 'Task not found' };
    },
    { required: ['id'] },
  );

  // ── backlog_detail ──────────────────────────────────────
  registerTool(
    'backlog_detail',
    'Get full details of a specific backlog task.',
    {
      id: { type: 'string', description: 'Task ID' },
    },
    async args => {
      const task = await backlog.getTask(args['id'] as string);
      return task ?? { error: 'Task not found' };
    },
    { required: ['id'] },
  );

  // ── backlog_delete ──────────────────────────────────────
  registerTool(
    'backlog_delete',
    'Delete a backlog task permanently.',
    {
      id: { type: 'string', description: 'Task ID to delete' },
    },
    async args => {
      const ok = await backlog.deleteTask(args['id'] as string);
      return ok ? { deleted: true } : { error: 'Task not found' };
    },
    { dangerous: true, required: ['id'] },
  );

  // ── schedule_create ──────────────────────────────────────
  registerTool(
    'schedule_create',
    'Create a scheduled/recurring job. The bot will automatically execute the given message at the specified times. Schedule formats: "every 5m", "every 2h", "daily 07:00", "weekdays 08:00", "weekends 10:00", "weekly mon 08:00".',
    {
      name: {
        type: 'string',
        description: 'Short name for the job (e.g. "Morgens Rollläden hoch")',
      },
      schedule: {
        type: 'string',
        description:
          'Schedule: "every 5m", "every 2h", "daily 07:00", "weekdays 08:00", "weekends 10:00", "weekly mon 08:00"',
      },
      message: {
        type: 'string',
        description: 'The message/command to execute (as if the user typed it in chat)',
      },
    },
    async args => {
      const job = await scheduler.createJob({
        name: args['name'] as string,
        schedule: args['schedule'] as string,
        message: args['message'] as string,
      });
      await logAction(
        'schedule',
        `Job erstellt: ${job.id} - ${job.name} (${job.schedule})`,
        'schedule_create',
      );
      return {
        created: true,
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        nextRun: job.nextRunAt,
      };
    },
    { required: ['name', 'schedule', 'message'] },
  );

  // ── schedule_list ────────────────────────────────────────
  registerTool(
    'schedule_list',
    'List all scheduled jobs with their status, next run time, and run count.',
    {},
    async () => {
      const all = await scheduler.listJobs();
      return {
        count: all.length,
        jobs: all.map(j => ({
          id: j.id,
          name: j.name,
          schedule: j.schedule,
          message: j.message,
          enabled: j.enabled,
          nextRunAt: j.nextRunAt,
          lastRunAt: j.lastRunAt,
          runCount: j.runCount,
        })),
      };
    },
  );

  // ── schedule_toggle ──────────────────────────────────────
  registerTool(
    'schedule_toggle',
    'Enable or disable a scheduled job.',
    {
      id: { type: 'string', description: 'Job ID (e.g. "J-A1B2C3")' },
      enabled: { type: 'boolean', description: 'true to enable, false to disable' },
    },
    async args => {
      const job = await scheduler.toggleJob(args['id'] as string, args['enabled'] as boolean);
      if (!job) return { error: 'Job not found' };
      await logAction(
        'schedule',
        `Job ${job.enabled ? 'aktiviert' : 'deaktiviert'}: ${job.id}`,
        'schedule_toggle',
      );
      return { id: job.id, enabled: job.enabled, nextRunAt: job.nextRunAt };
    },
    { required: ['id', 'enabled'] },
  );

  // ── schedule_delete ──────────────────────────────────────
  registerTool(
    'schedule_delete',
    'Delete a scheduled job permanently.',
    {
      id: { type: 'string', description: 'Job ID to delete' },
    },
    async args => {
      const ok = await scheduler.deleteJob(args['id'] as string);
      if (!ok) return { error: 'Job not found' };
      await logAction('schedule', `Job gelöscht: ${args['id']}`, 'schedule_delete');
      return { deleted: true };
    },
    { dangerous: true, required: ['id'] },
  );

  // ── schedule_once ──────────────────────────────────────────
  registerTool(
    'schedule_once',
    'Create a one-time timer or reminder. Fires once at the specified time, then auto-disables. Use for reminders ("Erinnere mich in 30min an den Muell") or delayed actions ("Schalte in 10min das Licht im Keller aus").',
    {
      name: {
        type: 'string',
        description: 'Short description (e.g. "Erinnerung: Muell rausbringen")',
      },
      delay: {
        type: 'string',
        description: 'When to fire: "5m", "2h", "1h30m" (relative) or "14:30" (absolute time)',
      },
      message: {
        type: 'string',
        description: 'The action or reminder message to execute (as if the user typed it in chat)',
      },
    },
    async args => {
      const delay = (args['delay'] as string).trim();
      // Convert to scheduler format: "14:30" → "once 14:30", "5m" → "once +5m"
      const schedule = /^\d{1,2}:\d{2}$/.test(delay) ? `once ${delay}` : `once +${delay}`;
      const job = await scheduler.createJob({
        name: args['name'] as string,
        schedule,
        message: args['message'] as string,
        oneshot: true,
      });
      await logAction(
        'schedule',
        `Einmaliger Job erstellt: ${job.id} - ${job.name} (${schedule})`,
        'schedule_once',
      );
      return { created: true, id: job.id, name: job.name, firesAt: job.nextRunAt };
    },
    { required: ['name', 'delay', 'message'] },
  );

  // ── analyze_home ─────────────────────────────────────────
  registerTool(
    'analyze_home',
    'Run a proactive analysis of the Home Assistant environment. Checks for: lights left on, stale sensors, unavailable devices, energy waste, open windows with active heating. Results are written to the backlog as improvement proposals.',
    {},
    async () => {
      const summary = await runAnalysis();
      return { summary };
    },
    { complexity: 2 },
  );

  // ── learn_correction ─────────────────────────────────────
  registerTool(
    'learn_correction',
    'Save a user correction so the same mistake is avoided in the future. Use this PROACTIVELY when the user says something like "Nein, nicht das", "Falsche Lampe", "Ich meinte X nicht Y".',
    {
      user_intent: { type: 'string', description: 'What the user originally wanted' },
      wrong_action: { type: 'string', description: 'What you did wrong' },
      correct_action: { type: 'string', description: 'What the correct action is' },
    },
    async args => {
      const c = await learning.addCorrection({
        userIntent: args['user_intent'] as string,
        wrongAction: args['wrong_action'] as string,
        correctAction: args['correct_action'] as string,
      });
      return { saved: true, id: c.id };
    },
    { required: ['user_intent', 'wrong_action', 'correct_action'] },
  );

  // ── learn_rule ───────────────────────────────────────────
  registerTool(
    'learn_rule',
    'Add a permanent rule to the system prompt. Use when you learn a general rule from user feedback that should always apply (e.g., "Immer zuerst im OG suchen wenn Bad gesagt wird").',
    {
      rule: {
        type: 'string',
        description: 'The rule to remember (one sentence, clear and actionable)',
      },
      reason: {
        type: 'string',
        description: 'Why this rule was added (user feedback, correction, etc.)',
      },
    },
    async args => {
      const p = await learning.addPromptPatch({
        rule: args['rule'] as string,
        reason: args['reason'] as string,
        source: 'correction',
      });
      return { saved: true, id: p.id, rule: p.rule };
    },
    { required: ['rule', 'reason'] },
  );

  // ── detect_patterns ──────────────────────────────────────
  registerTool(
    'detect_patterns',
    'Analyze usage history and detect recurring patterns (e.g., user turns off lights every day at 22:00). Returns newly detected patterns.',
    {},
    async () => {
      const newPatterns = await learning.detectPatterns();
      const suggestions = learning.getPatternSuggestions();
      return {
        newPatterns: newPatterns.length,
        suggestions: suggestions.map(p => ({
          id: p.id,
          description: p.description,
          occurrences: p.occurrences,
        })),
      };
    },
  );

  // ── list_learned ─────────────────────────────────────────
  registerTool(
    'list_learned',
    'List all learned corrections, rules, patterns, and error summaries. Use to show the user what the bot has learned.',
    {},
    async () => {
      const [corrections, patches, patterns, errors] = await Promise.all([
        learning.listCorrections(),
        learning.listPromptPatches(),
        learning.listPatterns(),
        Promise.resolve(learning.getErrorSummary()),
      ]);
      return {
        corrections: corrections.map(c => ({
          id: c.id,
          intent: c.userIntent,
          wrong: c.wrongAction,
          correct: c.correctAction,
          hits: c.hitCount,
        })),
        rules: patches.map(p => ({ id: p.id, rule: p.rule, enabled: p.enabled, source: p.source })),
        patterns: patterns.map(p => ({
          id: p.id,
          description: p.description,
          occurrences: p.occurrences,
        })),
        errors: errors.slice(0, 10),
      };
    },
  );
}
