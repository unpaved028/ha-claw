import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSessionId, sameSession, sessionSetCookie } from '../src/web/session.js';

describe('web confirmation session', () => {
  it('reads only a 32-hex ha_claw_sid cookie', () => {
    assert.equal(readSessionId(undefined), null);
    assert.equal(readSessionId('other=1'), null);
    assert.equal(readSessionId('ha_claw_sid=short'), null);
    assert.equal(
      readSessionId('theme=dark; ha_claw_sid=0123456789abcdef0123456789abcdef'),
      '0123456789abcdef0123456789abcdef',
    );
  });

  it('sets an HttpOnly cookie without a site-wide path', () => {
    const header = sessionSetCookie('0123456789abcdef0123456789abcdef');
    assert.match(header, /^ha_claw_sid=0123456789abcdef0123456789abcdef; HttpOnly; SameSite=Lax$/);
  });

  it('rejects a confirmation from another browser', () => {
    assert.equal(sameSession('abc', 'abc'), true);
    assert.equal(sameSession('abc', 'def'), false);
    assert.equal(sameSession('', 'abc'), false);
  });
});
