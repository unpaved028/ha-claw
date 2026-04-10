/**
 * scheduler.ts – Cron-like job scheduler for HA-Claw.
 *
 * Allows the bot to schedule recurring tasks (e.g., "check temperature every 30 min",
 * "open blinds daily at 07:00"). Jobs are persisted and survive restarts.
 *
 * Schedule formats (recurring):
 * - "every 5m"         → every 5 minutes
 * - "every 2h"         → every 2 hours
 * - "daily 07:00"      → every day at 07:00
 * - "daily 22:30"      → every day at 22:30
 * - "weekdays 08:00"   → Mon–Fri at 08:00
 * - "weekends 10:00"   → Sat–Sun at 10:00
 * - "weekly mon 08:00" → every Monday at 08:00
 *
 * Schedule formats (one-shot):
 * - "once +5m"         → in 5 minutes (then auto-disabled)
 * - "once +2h"         → in 2 hours
 * - "once +1h30m"      → in 1 hour 30 minutes
 * - "once 14:30"       → at 14:30 today (or tomorrow if past)
 *
 * Each job fires a message through the agentic loop as if the user sent it.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../core/logger.js';
import { getCircuitBreakerState } from '../core/openrouter.js';

const log = createLogger('scheduler');

// ── Types ────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // human-readable schedule string
  message: string; // message to send to the agentic loop
  enabled: boolean;
  oneshot: boolean; // one-time job (auto-disabled after execution)
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

  // Recalculate next run times (skip oneshot – they keep their original fire time)
  for (const job of jobs) {
    if (job.enabled && !job.oneshot) {
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

  // Wenn der Circuit Breaker offen ist, führen wir in diesem Tick keine Jobs aus.
  // Sie bleiben in der Queue, da ihr nextRunAt in der Vergangenheit liegt
  // und beim nächsten Tick (alle 30s) wieder geprüft wird.
  if (getCircuitBreakerState().isOpen) {
    // Da wir alle 30s ticken, loggen wir dies nur kurz (oder gar nicht, um Spam zu vermeiden).
    return;
  }

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
        if (job.oneshot) {
          job.enabled = false;
          job.nextRunAt = null;
          log.info('One-shot job completed and disabled', { id: job.id });
        } else {
          job.nextRunAt = calcNextRun(job.schedule);
          log.info('Job completed', { id: job.id, nextRun: job.nextRunAt });
        }
      } catch (err) {
        job.lastRunAt = now.toISOString();
        job.lastResult = `ERROR: ${String(err).slice(0, 200)}`;
        if (job.oneshot) {
          job.enabled = false;
          job.nextRunAt = null;
          log.error('One-shot job failed and disabled', { id: job.id, error: String(err) });
        } else {
          job.nextRunAt = calcNextRun(job.schedule);
          log.error('Job failed', { id: job.id, error: String(err) });
        }
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
    return nextTimeOfDay(
      now,
      parseInt(wdMatch[1]!, 10),
      parseInt(wdMatch[2]!, 10),
      [1, 2, 3, 4, 5],
    );
  }

  // "weekends HH:MM"
  const weMatch = s.match(/^weekends\s+(\d{1,2}):(\d{2})$/);
  if (weMatch) {
    return nextTimeOfDay(now, parseInt(weMatch[1]!, 10), parseInt(weMatch[2]!, 10), [0, 6]);
  }

  // "weekly <day> HH:MM"
  const weeklyMatch = s.match(/^weekly\s+(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})$/);
  if (weeklyMatch) {
    const dayMap: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const day = dayMap[weeklyMatch[1]!]!;
    return nextTimeOfDay(now, parseInt(weeklyMatch[2]!, 10), parseInt(weeklyMatch[3]!, 10), [day]);
  }

  // "once +5m", "once +2h", "once +1h30m"
  const onceRelMatch = s.match(/^once\s+\+(?:(\d+)h)?(?:(\d+)m)?$/);
  if (onceRelMatch && (onceRelMatch[1] || onceRelMatch[2])) {
    const hours = parseInt(onceRelMatch[1] || '0', 10);
    const mins = parseInt(onceRelMatch[2] || '0', 10);
    const ms = (hours * 60 + mins) * 60_000;
    return new Date(now.getTime() + ms).toISOString();
  }

  // "once 14:30" – absolute time today (or tomorrow if past)
  const onceAbsMatch = s.match(/^once\s+(\d{1,2}):(\d{2})$/);
  if (onceAbsMatch) {
    return nextTimeOfDay(now, parseInt(onceAbsMatch[1]!, 10), parseInt(onceAbsMatch[2]!, 10));
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
  oneshot?: boolean;
}): Promise<ScheduledJob> {
  // Validate schedule
  const nextRun = calcNextRun(opts.schedule);
  if (!nextRun) {
    throw new Error(
      `Ungueltiges Schedule-Format: "${opts.schedule}". Erlaubt: "every 5m", "every 2h", "daily 07:00", "weekdays 08:00", "weekends 10:00", "weekly mon 08:00", "once +5m", "once 14:30"`,
    );
  }

  const job: ScheduledJob = {
    id: 'J-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: opts.name,
    schedule: opts.schedule,
    message: opts.message,
    enabled: true,
    oneshot: opts.oneshot ?? false,
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

export async function updateJob(
  id: string,
  updates: {
    name?: string;
    schedule?: string;
    message?: string;
  },
): Promise<ScheduledJob | null> {
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
  const lines = active.map(j => {
    const type = j.oneshot ? 'einmalig' : 'wiederkehrend';
    const nextInfo = j.nextRunAt
      ? ' | naechster Lauf: ' +
        new Date(j.nextRunAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
      : '';
    return `- [${j.id}] "${j.name}" (${j.schedule}, ${type}) → "${j.message}"${nextInfo}`;
  });
  return `\n## Aktive Scheduled Jobs\n${lines.join('\n')}`;
}
