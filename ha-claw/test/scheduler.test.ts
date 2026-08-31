import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcNextRun, nextTimeOfDay } from '../src/storage/scheduler.js';
import { createJob, initSchedulerForTests, runDueJobs } from '../src/storage/scheduler.js';

describe('calcNextRun formats', () => {
  const now = new Date('2026-06-15T10:00:00.000Z');

  it('every 5m', () => {
    const next = calcNextRun('every 5m', now);
    assert.equal(next, new Date(now.getTime() + 5 * 60_000).toISOString());
  });

  it('every 2h', () => {
    const next = calcNextRun('every 2h', now);
    assert.equal(next, new Date(now.getTime() + 2 * 3600_000).toISOString());
  });

  it('once +5m and once +1h30m', () => {
    assert.equal(calcNextRun('once +5m', now), new Date(now.getTime() + 5 * 60_000).toISOString());
    assert.equal(
      calcNextRun('once +1h30m', now),
      new Date(now.getTime() + 90 * 60_000).toISOString(),
    );
  });

  it('rejects unknown format', () => {
    assert.equal(calcNextRun('whenever', now), null);
  });
});

describe('once HH:MM today-or-tomorrow', () => {
  it('fires later today when the clock is still ahead', () => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    const next = new Date(calcNextRun('once 14:30', now)!);
    assert.equal(next.getHours(), 14);
    assert.equal(next.getMinutes(), 30);
    assert.equal(next.getDate(), now.getDate());
  });

  it('rolls to tomorrow when the time has already passed', () => {
    const now = new Date();
    now.setHours(18, 0, 0, 0);
    const next = new Date(calcNextRun('once 14:30', now)!);
    assert.equal(next.getHours(), 14);
    assert.equal(next.getMinutes(), 30);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    assert.equal(next.getDate(), tomorrow.getDate());
  });
});

describe('daily / weekdays / weekly', () => {
  it('daily uses nextTimeOfDay', () => {
    const now = new Date();
    now.setHours(6, 0, 0, 0);
    const next = new Date(calcNextRun('daily 07:00', now)!);
    assert.equal(next.getHours(), 7);
    assert.equal(next.getMinutes(), 0);
  });

  it('weekdays skip Saturday', () => {
    // 2026-06-20 is a Saturday
    const sat = new Date(2026, 5, 20, 9, 0, 0, 0);
    const next = new Date(nextTimeOfDay(sat, 8, 0, [1, 2, 3, 4, 5]));
    assert.equal(next.getDay(), 1);
    assert.equal(next.getHours(), 8);
  });

  it('weekly mon lands on Monday', () => {
    const wed = new Date(2026, 5, 17, 9, 0, 0, 0);
    const next = new Date(calcNextRun('weekly mon 08:00', wed)!);
    assert.equal(next.getDay(), 1);
    assert.equal(next.getHours(), 8);
  });
});

describe('DST Europe/Berlin', () => {
  it('spring forward: 02:00 on the missing hour still produces a valid Date', () => {
    // 2026-03-29 02:00 does not exist in Europe/Berlin. setHours must not throw.
    const before = new Date(2026, 2, 29, 1, 30, 0, 0);
    const iso = nextTimeOfDay(before, 2, 30);
    assert.ok(iso);
    assert.ok(!Number.isNaN(new Date(iso).getTime()));
  });

  it('autumn fallback: 02:30 still resolves to a single next instant', () => {
    const before = new Date(2026, 9, 25, 1, 0, 0, 0);
    const iso = nextTimeOfDay(before, 2, 30);
    assert.ok(iso);
    assert.ok(!Number.isNaN(new Date(iso).getTime()));
  });
});

describe('scheduler overlap', () => {
  it('a long run is not fired a second time while running', async () => {
    let starts = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });

    await initSchedulerForTests(async () => {
      starts += 1;
      await gate;
      return 'done';
    });

    const job = await createJob({ name: 'slow', schedule: 'every 5m', message: 'x' });
    job.nextRunAt = new Date(0).toISOString();

    const first = runDueJobs(new Date());
    await new Promise(r => setTimeout(r, 20));
    await runDueJobs(new Date());
    release();
    await first;

    assert.equal(starts, 1);
    assert.ok(job.nextRunAt && new Date(job.nextRunAt).getTime() > Date.now() - 1000);
  });
});
