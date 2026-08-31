import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedAddonPeer, normalizeIp } from '../src/web/ingress-allow.js';

describe('isAllowedAddonPeer', () => {
  it('allows the Ingress gateway and loopback', () => {
    assert.equal(isAllowedAddonPeer('172.30.32.2'), true);
    assert.equal(isAllowedAddonPeer('127.0.0.1'), true);
    assert.equal(isAllowedAddonPeer('::1'), true);
    assert.equal(isAllowedAddonPeer('::ffff:172.30.32.2'), true);
  });

  it('allows the Supervisor hassio network for watchdog', () => {
    assert.equal(isAllowedAddonPeer('172.30.32.1'), true);
    assert.equal(isAllowedAddonPeer('172.30.33.10'), true);
  });

  it('rejects a published-port client', () => {
    assert.equal(isAllowedAddonPeer('192.168.1.20'), false);
    assert.equal(isAllowedAddonPeer('10.0.0.4'), false);
    assert.equal(isAllowedAddonPeer('8.8.8.8'), false);
  });

  it('normalizes IPv4-mapped IPv6', () => {
    assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
  });
});
