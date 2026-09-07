import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_MAX_SAMPLES,
  appendHistorySample,
  lastDifferentHourSample,
  parseHealthHistory,
  type HealthHistorySample,
} from '../src/core/health-history.js';

function sample(at: string, count: number, ids: string[] = []): HealthHistorySample {
  return { checkedAt: at, severity: count > 0 ? 'warn' : 'ok', count, ids };
}

describe('health history ring', () => {
  it('replaces a same-hour sample instead of appending', () => {
    const first = appendHistorySample([], sample('2026-09-08T10:05:00.000Z', 2, ['stem:a']));
    const second = appendHistorySample(
      first,
      sample('2026-09-08T10:40:00.000Z', 5, ['stem:a', 'stem:b']),
    );
    assert.equal(second.length, 1);
    assert.equal(second[0]?.count, 5);
    assert.deepEqual(second[0]?.ids, ['stem:a', 'stem:b']);
  });

  it('keeps the last 24 hourly samples', () => {
    let rows: HealthHistorySample[] = [];
    for (let i = 0; i < 30; i++) {
      const hour = String(i).padStart(2, '0');
      const day = i < 24 ? '07' : '08';
      const h = i < 24 ? hour : String(i - 24).padStart(2, '0');
      rows = appendHistorySample(rows, sample(`2026-09-${day}T${h}:00:00.000Z`, i));
    }
    assert.equal(rows.length, HISTORY_MAX_SAMPLES);
    assert.equal(rows[0]?.count, 6);
    assert.equal(rows[23]?.count, 29);
  });

  it('returns the last sample from a different hour', () => {
    const rows = [
      sample('2026-09-08T09:00:00.000Z', 1, ['stem:old']),
      sample('2026-09-08T10:10:00.000Z', 3, ['stem:now']),
    ];
    const prev = lastDifferentHourSample(rows, '2026-09-08T10:55:00.000Z');
    assert.equal(prev?.count, 1);
    assert.deepEqual(prev?.ids, ['stem:old']);
    assert.equal(
      lastDifferentHourSample([sample('2026-09-08T10:00:00.000Z', 1)], '2026-09-08T10:30:00.000Z'),
      null,
    );
  });

  it('ignores a malformed file', () => {
    assert.deepEqual(parseHealthHistory(null).samples, {});
    assert.deepEqual(
      parseHealthHistory({ samples: { unavailable: [{ count: 'nope' }] } }).samples,
      {
        unavailable: [],
      },
    );
    const ok = parseHealthHistory({
      samples: {
        unavailable: [
          { checkedAt: '2026-09-08T09:00:00.000Z', severity: 'warn', count: 2, ids: ['stem:a'] },
        ],
      },
    });
    assert.equal(ok.samples['unavailable']?.[0]?.count, 2);
  });
});
