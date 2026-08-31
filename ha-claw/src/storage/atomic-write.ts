/**
 * atomic-write.ts – One lock per path, one temp-and-rename helper.
 *
 * Monolithic JSON files (scheduler, learning, profile, …) are read-modify-write.
 * Without a lock, concurrent Web and Telegram requests overwrite each other.
 * A fixed `.tmp` name is also a collision: two writers truncate the same file.
 * Unique temp names plus rename make a crash mid-write leave the previous file
 * intact.
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const tails = new Map<string, Promise<unknown>>();

/** Run `fn` with exclusive access to `path`. Callers that read-modify-write must do both inside. */
export function withPathLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(path) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  tails.set(
    path,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** Write JSON (or any string) via a unique temp file, then rename over `path`. */
export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmp, contents, 'utf-8');
  await rename(tmp, path);
}

export async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(data, null, 2));
}
