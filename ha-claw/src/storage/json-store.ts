/**
 * json-store.ts – Lightweight JSON file storage for HA Add-on.
 *
 * Designed for HA Green (limited resources):
 * - One JSON file per record (no large monolithic files)
 * - Atomic writes (temp → rename) to prevent corruption
 * - No native dependencies (unlike SQLite)
 * - /data/ is persistent across add-on restarts and updates
 * - /data/ is included in HA backups automatically
 *
 * Storage layout:
 *   /data/store/notes/       → User notes & knowledge
 *   /data/store/conversations/ → Chat history
 *   /data/store/memory/      → Agent persistent memory
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('storage');

const STORE_ROOT = join(appConfig.dataPath, 'store');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Initialize storage directories
// ---------------------------------------------------------------------------

const COLLECTIONS = ['notes', 'conversations', 'memory', 'usage'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export async function initStorage(): Promise<void> {
  for (const col of COLLECTIONS) {
    await mkdir(join(STORE_ROOT, col), { recursive: true });
  }
  log.info('Storage initialized', { root: STORE_ROOT });
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

function filePath(collection: CollectionName, id: string): string {
  // Security: prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeId !== id) {
    throw new Error(`🚫 Invalid record ID: ${id}`);
  }
  return join(STORE_ROOT, collection, `${safeId}.json`);
}

/** Create a new record. Returns the generated ID. */
export async function create<T extends Record<string, unknown>>(
  collection: CollectionName,
  data: T,
): Promise<StoredRecord & T> {
  const id = randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  const record = {
    id,
    createdAt: now,
    updatedAt: now,
    ...data,
  } as StoredRecord & T;

  await atomicWrite(filePath(collection, id), record);
  log.debug('Record created', { collection, id });
  return record;
}

/** Read a single record by ID. Returns null if not found. */
export async function read<T extends StoredRecord>(
  collection: CollectionName,
  id: string,
): Promise<T | null> {
  try {
    const raw = await readFile(filePath(collection, id), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** List all records in a collection. Lightweight – reads all files. */
export async function list<T extends StoredRecord>(collection: CollectionName): Promise<T[]> {
  const dir = join(STORE_ROOT, collection);
  try {
    const files = await readdir(dir);
    const records: T[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(dir, file), 'utf-8');
      records.push(JSON.parse(raw) as T);
    }
    // Sort by updatedAt descending (newest first)
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return records;
  } catch {
    return [];
  }
}

/** Update an existing record (partial update, merges fields). */
export async function update<T extends Record<string, unknown>>(
  collection: CollectionName,
  id: string,
  data: Partial<T>,
): Promise<StoredRecord | null> {
  const existing = await read(collection, id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...data,
    id, // ID is immutable
    createdAt: existing.createdAt, // createdAt is immutable
    updatedAt: new Date().toISOString(),
  };

  await atomicWrite(filePath(collection, id), updated);
  log.debug('Record updated', { collection, id });
  return updated;
}

/** Upsert a record (create or update) with a specific ID. */
export async function upsert<T extends Record<string, unknown>>(
  collection: CollectionName,
  id: string,
  data: T,
): Promise<StoredRecord & T> {
  const existing = await read(collection, id);
  const now = new Date().toISOString();

  const record = {
    ...(existing || {}),
    ...data,
    id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  } as StoredRecord & T;

  await atomicWrite(filePath(collection, id), record);
  log.debug('Record upserted', { collection, id });
  return record;
}

/** Delete a record by ID. Returns true if it existed. */
export async function remove(collection: CollectionName, id: string): Promise<boolean> {
  try {
    await unlink(filePath(collection, id));
    log.debug('Record deleted', { collection, id });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Atomic write: write to temp file, then rename. Prevents partial/corrupt writes. */
async function atomicWrite(path: string, data: unknown): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, path);
}
