import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotifyEntity } from '../src/core/ha-notify.js';

describe('parseNotifyEntity', () => {
  it('accepts a full notify entity id', () => {
    assert.deepEqual(parseNotifyEntity('notify.mobile_app_pixel'), {
      domain: 'notify',
      service: 'mobile_app_pixel',
    });
  });

  it('normalises case', () => {
    assert.deepEqual(parseNotifyEntity('Notify.Mobile_App_Pixel'), {
      domain: 'notify',
      service: 'mobile_app_pixel',
    });
  });

  it('rejects empty, other domains and junk', () => {
    assert.equal(parseNotifyEntity(''), null);
    assert.equal(parseNotifyEntity(undefined), null);
    assert.equal(parseNotifyEntity('persistent_notification.create'), null);
    assert.equal(parseNotifyEntity('mobile_app_pixel'), null);
    assert.equal(parseNotifyEntity('notify.bad-id'), null);
  });
});
