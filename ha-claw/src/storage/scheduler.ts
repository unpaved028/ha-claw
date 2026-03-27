/**
 * scheduler.ts – Cron-like job scheduler for HA-Claw.
 *
 * Allows the bot to schedule recurring tasks (e.g., "check temperature every 30 min",
 * "open blinds daily at 07:00"). Jobs are persisted and survive restarts.
 *
 * Schedule formats:
 * - "every 5m"      → every 5 minutes
 * - "every 2h"      → every 2 hours
 * - "daily 07:00"   → every day at 07:00
 * - "daily 22:30"   → every day at 22:30
 * - "weekdays 08:00"→ Mon–Fri at 08:00
 * - "weekends 10:00"→ Sat–Sun at 10:00
 *
 * Each job fires a message through the agentic loop as if the user sent it.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../core/logger.js';

const log = createLogger('scheduler');

// ── Types ────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;          // human-readable schedule string
  message: string;           // message to send to the agentic loop
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastResult: string | null; // truncated last response
}

type JobExecutor = (job: ScheduledJob) => Promise<string>;

// ── Storage ──────────────────────────────────────────────────

const STORE_DIR = process.env['HA_CLAW_DATA'] || '/data/store';
const SCHEDULER_FILE = join(STORE_DIR, 'scheduler.json');

let jobs: ScheduledJob[] = [];
let tickTimer: ReturnType<typeof setInterval> | null = null;
let executor: JobExecutor | null = null;

async function persist(): Promise<void> {
  try {
    await mkdir(STORE_DIR, { recursive: true });
    await writeFile(SCHEDULER_FILE, JSON.stringify(jobs, null, 2));
  } catch (err) {
    log.warn('Failed to persist scheduler', { error: String(err) });
  }
}

// ── Init & Shutdown ──────────────────────────────────────────

export async function initScheduler(exec: JobExecutor): Promise<void> {
  executor = exec;
  try {
    const raw = await readFile(SCHEDULER_FILE, 'utf-8');
    jobs = JSON.parse(raw);
    log.info('Scheduler loaded', { jobs: jobs.length });
  } catch {
    jobs = [];
    log.info('Scheduler initialized (empty)');
  }

  // Recalculate next run times
  for (const job of jobs) {
    if (job.enabled) {
      job.nextRunAt = calcNextRun(job.schedule);
    }
  }
  await persist();

  // Tick every 30 seconds
  tickTimer = setInterval(() => tick(), 30_000);
  log.info('Scheduler started (30s tick)');
}

export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

// ── Tick (check & execute due jobs) ──────────────────────────

async function tick(): Promise<void> {
  const now = new Date();
  for (const job of jobs) {
    if (!job.enabled || !job.nextRunAt) continue;
    const next = new Date(job.nextRunAt);
    if (now >= next) {
      log.info('Job firing', { id: job.id, name: job.name });
      try {
        const result = executor ? await executor(job) : '(no executor)';
        job.lastRunAt = now.toISOString();
        job.lastResult = result.slice(0, 300);
        job.runCount++;
        job.nextRunAt = calcNextRun(job.schedule);
        log.info('Job completed', { id: job.id, nextRun: job.nextRunAt });
      } catch (err) {
        job.lastRunAt = now.toISOString();
        job.lastResult = `ERROR: ${String(err).slice(0, 200)}`;
        job.nextRunAt = calcNextRun(job.schedule);
        log.error('Job failed', { id: job.id, error: String(err) });
      }
      await persist();
    }
  }
}

// ── Schedule Parser ──────────────────────────────────────────

function calcNextRun(schedule: string): string | null {
  const now = new Date();
  const s = schedule.trim().toLowerCase();

  // "every Xm" or "every Xh"
  const everyMatch = s.match(/^every\s+(\d+)\s*(m|min|h|hr|hour)s?$/);
  if (everyMatch) {
    const val = parseInt(everyMatch[1]!, 10);
    const unit = everyMatch[2]!;
    const ms = unit.startsWith('h') ? val * 60 * 60_000 : val * 60_000;
    return new Date(now.getTime() + ms).toISOString();
  }

  // "daily HH:MM"
  const dailyMatch = s.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (dailyMatch) {
    return nextTimeOfDay(now, parseInt(dailyMatch[1]!, 10), parseInt(dailyMatch[2]!, 10));
  }

  // "weekdays HH:MM"
  const wdMatch = s.match(/^weekdays\s+(\d{1,2}):(\d{2})$/);
  if (wdMatch) {
    return nextTimeOfDay(now, parseInt(wdMatch[1]!, 10), parseInt(wdMatch[2]!, 10), [1, 2, 3, 4, 5]);
  }

  // "weekends HH:MM"
  const weMatch = s.match(/^weekends\s+(\d{1,2}):(\d{2})$/);
  if (weMatch) {
    return nextTimeOfDay(now, parseInt(weMatch[1]!, 10), parseInt(weMatch[2]!, 10), [0, 6]);
  }

  log.warn('Unknown schedule format', { schedule });
  return null;
}

function nextTimeOfDay(now: Date, hour: number, minute: number, allowedDays?: number[]): string {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);

  // If today's time has passed, start from tomorrow
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }

  // If day filter, advance to next allowed day
  if (allowedDays) {
    let safety = 0;
    while (!allowedDays.includes(candidate.getDay()) && safety < 8) {
      candidate.setDate(candidate.getDate() + 1);
      safety++;
    }
  }

  return candidate.toISOString();
}

// ── CRUD ─────────────────────────────────────────────────────

export async function createJob(opts: {
  name: string;
  schedule: string;
  message: string;
}): Promise<ScheduledJob> {
  // Validate schedule
  const nextRun = calcNextRun(opts.schedule);
  if (!nextRun) {
    throw new Error(`Ungueltiges Schedule-Format: "${opts.schedule}". Erlaubt: "every 5m", "every 2h", "daily 07:00", "weekdays 08:00", "weekends 10:00"`);
  }

  const job: ScheduledJob = {
    id: 'J-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: opts.name,
    schedule: opts.schedule,
    message: opts.message,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    nextRunAt: nextRun,
    runCount: 0,
    lastResult: null,
  };

  jobs.push(job);
  await persist();
  log.info('Job created', { id: job.id, name: job.name, schedule: job.schedule, nextRun });
  return job;
}

export async function listJobs(): Promise<ScheduledJob[]> {
  return jobs;
}

export async function getJob(id: string): Promise<ScheduledJob | null> {
  return jobs.find(j => j.id === id) ?? null;
}

export async function toggleJob(id: string, enabled: boolean): Promise<ScheduledJob | null> {
  const job = jobs.find(j => j.id === id);
  if (!job) return null;
  job.enabled = enabled;
  if (enabled) {
    job.nextRunAt = calcNextRun(job.schedule);
  } else {
    job.nextRunAt = null;
  }
  await persist();
  log.info(`Job ${enabled ? 'enabled' : 'disabled'}`, { id });
  return job;
}

export async function updateJob(id: string, updates: {
  name?: string;
  schedule?: string;
  message?: string;
}): Promise<ScheduledJob | null> {
  const job = jobs.find(j => j.id === id);
  if (!job) return null;
  if (updates.name) job.name = updates.name;
  if (updates.message) job.message = updates.message;
  if (updates.schedule) {
    const nextRun = calcNextRun(updates.schedule);
    if (!nextRun) throw new Error(`Ungueltiges Schedule-Format: "${updates.schedule}"`);
    job.schedule = updates.schedule;
    job.nextRunAt = nextRun;
  }
  await persist();
  return job;
}

export async function deleteJob(id: string): Promise<boolean> {
  const idx = jobs.findIndex(j => j.id === id);
  if (idx < 0) return false;
  jobs.splice(idx, 1);
  await persist();
  log.info('Job deleted', { id });
  return true;
}

/**
 * Get scheduler summary for system prompt injection.
 */
export function getSchedulerSummary(): string {
  const active = jobs.filter(j => j.enabled);
  if (active.length === 0) return '';
  const lines = active.map(j =>
    `- [${j.id}] "${j.name}" (${j.schedule}) → "${j.message}"${j.nextRunAt ? ' | naechster Lauf: ' + new Date(j.nextRunAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ''}`
  );
  return `\n## Aktive Scheduled Jobs\n${lines.join('\n')}`;
}
