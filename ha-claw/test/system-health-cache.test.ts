import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appConfig } from '../src/core/config.js';
import {
  getCachedSystemHealth,
  resetHealthCache,
  type SystemHealth,
} from '../src/core/system-health.js';

const storeDir = join(appConfig.dataPath, 'store');
const reportPath = join(storeDir, 'system-health-report.json');

function sampleReport(checkedAt: string): SystemHealth {
  return {
    checkedAt,
    severity: 'warn',
    totalEntities: 12,
    haBase: '',
    checks: [
      {
        key: 'low_battery',
        label: 'Batterie unter 20%',
        severity: 'warn',
        count: 1,
        detail: 'Fenster EG',
        entities: ['Fenster EG'],
        items: [{ id: 'dev:1', label: 'Fenster EG', entities: ['sensor.fenster_battery'] }],
        hint: 'Batterien zeitnah wechseln.',
      },
    ],
  };
}

describe('system health report cache', { concurrency: false }, () => {
  before(async () => {
    await mkdir(storeDir, { recursive: true });
  });

  beforeEach(() => {
    resetHealthCache();
  });

  it('hydrates the last report from disk after a restart', async () => {
    const report = sampleReport('2026-09-01T10:00:00.000Z');
    await writeFile(reportPath, JSON.stringify(report));

    const cached = await getCachedSystemHealth();
    assert.ok(cached);
    assert.equal(cached.checkedAt, report.checkedAt);
    assert.equal(cached.severity, 'warn');
    assert.equal(cached.checks[0]?.key, 'low_battery');
    assert.equal(cached.totalEntities, 12);
  });

  it('returns null when no report has been stored', async () => {
    await unlink(reportPath).catch(() => undefined);
    const cached = await getCachedSystemHealth();
    assert.equal(cached, null);
  });

  it('ignores a file that is not a health report', async () => {
    await writeFile(reportPath, JSON.stringify({ unavailable: { count: 3 } }));
    const cached = await getCachedSystemHealth();
    assert.equal(cached, null);
  });
});
