/**
 * builtins.ts – Built-in tools for the agentic loop.
 *
 * These tools are always available regardless of MCP connections.
 * They cover basic system info and JSON store access.
 */

import { registerTool } from './registry.js';
import * as store from '../storage/json-store.js';
import type { CollectionName } from '../storage/json-store.js';

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
      return store.create(args['collection'] as CollectionName, {
        title: args['title'] ?? 'Untitled',
        content: args['content'] ?? '',
        tags: args['tags'] ?? [],
      });
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
}
