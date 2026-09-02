import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEALTH_CHECK_KEYS,
  NOTIFY_EVENT_IDS,
  defaultNotifyMatrix,
  healthEventId,
  mergeNotifyMatrix,
  parseNotifyMatrixBody,
  resetNotifyMatrixCache,
  shouldNotify,
} from '../src/core/notify-matrix.js';

describe('notify matrix defaults', () => {
  it('turns Telegram on for the pre-matrix events and off for per-check health', () => {
    const m = defaultNotifyMatrix();
    assert.equal(m.digest.telegram, true);
    assert.equal(m.new_task.telegram, true);
    assert.equal(m.task_done.telegram, true);
    assert.equal(m.task_fail.telegram, true);
    assert.equal(m.other_jobs.telegram, true);
    assert.equal(m.health_bundle.telegram, true);
    assert.equal(m[healthEventId('unavailable')].telegram, false);
    assert.equal(m.digest.chat, false);
    assert.equal(m.digest.ha_notify, false);
    assert.equal(m.digest.persistent, false);
  });

  it('lists one event id per health check', () => {
    const healthIds = NOTIFY_EVENT_IDS.filter(
      id => id.startsWith('health.') && id !== 'health_bundle',
    );
    assert.equal(healthIds.length, HEALTH_CHECK_KEYS.length);
  });
});

describe('mergeNotifyMatrix', () => {
  it('fills missing events from defaults and ignores unknown keys', () => {
    const m = mergeNotifyMatrix({
      digest: { telegram: false, chat: true },
      not_a_real_event: { telegram: true },
    });
    assert.equal(m.digest.telegram, false);
    assert.equal(m.digest.chat, true);
    assert.equal(m.digest.ha_notify, false);
    assert.equal(m.new_task.telegram, true);
    assert.equal('not_a_real_event' in m, false);
  });
});

describe('parseNotifyMatrixBody', () => {
  it('accepts a wrapped matrix and a bare matrix', () => {
    const wrapped = parseNotifyMatrixBody({
      matrix: { digest: { telegram: false, chat: true, ha_notify: false, persistent: true } },
    });
    assert.ok(wrapped);
    assert.equal(wrapped.digest.persistent, true);
    const bare = parseNotifyMatrixBody({
      digest: { telegram: false, chat: true, ha_notify: false, persistent: false },
    });
    assert.ok(bare);
    assert.equal(bare.digest.chat, true);
  });

  it('rejects arrays and non-objects', () => {
    assert.equal(parseNotifyMatrixBody(null), null);
    assert.equal(parseNotifyMatrixBody([]), null);
    assert.equal(parseNotifyMatrixBody('x'), null);
  });
});

describe('shouldNotify', () => {
  beforeEach(() => resetNotifyMatrixCache());

  it('reads the cell', () => {
    const m = defaultNotifyMatrix();
    m.digest.chat = true;
    assert.equal(shouldNotify(m, 'digest', 'chat'), true);
    assert.equal(shouldNotify(m, 'digest', 'ha_notify'), false);
  });
});
