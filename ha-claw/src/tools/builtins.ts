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
import { logAction } from '../storage/action-log.js';

export function registerBuiltinTools(): void {
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
    async (args) => {
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
    async (args) => {
      const record = await store.read(
        args['collection'] as CollectionName,
        args['id'] as string,
      );
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
    async (args) => {
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
    async (args) => {
      const ok = await store.remove(
        args['collection'] as CollectionName,
        args['id'] as string,
      );
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
        type: 'array', items: { type: 'string' },
        description: 'Keywords for later retrieval (auto-extracted if omitted)',
      },
      ttl_days: {
        type: 'number',
        description: 'Days until expiry (0 = permanent, default 0)',
      },
    },
    async (args) => {
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
    async (args) => {
      const results = await mem.searchCards(
        args['query'] as string,
        (args['max_results'] as number) ?? 5,
      );
      return {
        count: results.length,
        memories: results.map((r) => ({
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
    async (args) => {
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
    async (args) => {
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
        cards: cards.map((c) => ({
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
        type: 'array', items: { type: 'string' },
        description: 'Optional keywords for the task',
      },
    },
    async (args) => {
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
      await logAction('task', `Optimierung vorgeschlagen: ${task.id} - ${task.title}`, 'backlog_propose');
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
        enum: ['proposed', 'approved', 'in_progress', 'done', 'rejected'],
      },
      priority: {
        type: 'string',
        description: 'Filter by priority: low, medium, high',
        enum: ['low', 'medium', 'high'],
      },
    },
    async (args) => {
      const tasks = await backlog.listTasks({
        status: args['status'] as backlog.TaskStatus | undefined,
        priority: args['priority'] as backlog.Priority | undefined,
      });
      return {
        count: tasks.length,
        tasks: tasks.map((t) => ({
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
        enum: ['proposed', 'approved', 'in_progress', 'done', 'rejected'],
      },
      priority: {
        type: 'string',
        description: 'New priority',
        enum: ['low', 'medium', 'high'],
      },
      title: { type: 'string', description: 'Updated title' },
    },
    async (args) => {
      const updates: Record<string, unknown> = {};
      if (args['status']) updates['status'] = args['status'];
      if (args['priority']) updates['priority'] = args['priority'];
      if (args['title']) updates['title'] = args['title'];
      const task = await backlog.updateTask(
        args['id'] as string,
        updates as Parameters<typeof backlog.updateTask>[1],
      );
      if (task && args['status']) {
        await logAction('task', `Status von ${task.id} geändert auf: ${task.status}`, 'backlog_update');
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
    async (args) => {
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
    async (args) => {
      const ok = await backlog.deleteTask(args['id'] as string);
      return ok ? { deleted: true } : { error: 'Task not found' };
    },
    { dangerous: true, required: ['id'] },
  );
}
