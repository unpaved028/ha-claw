import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSafeCallPolicy } from '../src/tools/safety-policy.js';

interface Case {
  name: string;
  domain: string;
  entityIds: string[];
  coverDeviceClass?: Record<string, string>;
  sceneTargets?: Record<string, string[]>;
  confirm: boolean;
}

const cases: Case[] = [
  { name: 'light.turn_on everyday', domain: 'light', entityIds: ['light.kitchen'], confirm: false },
  {
    name: 'switch.turn_off everyday',
    domain: 'switch',
    entityIds: ['switch.pump'],
    confirm: false,
  },
  {
    name: 'fan, climate, vacuum, humidifier',
    domain: 'climate',
    entityIds: ['climate.living'],
    confirm: false,
  },
  {
    name: 'input helper',
    domain: 'input_boolean',
    entityIds: ['input_boolean.guest'],
    confirm: false,
  },
  { name: 'media_player', domain: 'media_player', entityIds: ['media_player.tv'], confirm: false },
  { name: 'number / select', domain: 'number', entityIds: ['number.speed'], confirm: false },
  {
    name: 'window cover shutter',
    domain: 'cover',
    entityIds: ['cover.blind_eg'],
    coverDeviceClass: { 'cover.blind_eg': 'shutter' },
    confirm: false,
  },
  {
    name: 'window cover curtain',
    domain: 'cover',
    entityIds: ['cover.drape'],
    coverDeviceClass: { 'cover.drape': 'curtain' },
    confirm: false,
  },
  {
    name: 'cover without device_class stays everyday',
    domain: 'cover',
    entityIds: ['cover.unknown'],
    confirm: false,
  },
  {
    name: 'scene of lights',
    domain: 'scene',
    entityIds: ['scene.evening'],
    sceneTargets: { 'scene.evening': ['light.a', 'light.b'] },
    confirm: false,
  },
  { name: 'lock is guarded', domain: 'lock', entityIds: ['lock.front_door'], confirm: true },
  {
    name: 'alarm_control_panel is guarded',
    domain: 'alarm_control_panel',
    entityIds: ['alarm_control_panel.house'],
    confirm: true,
  },
  {
    name: 'script.turn_on is a bypass if allowed — must confirm',
    domain: 'script',
    entityIds: ['script.unlock_door'],
    confirm: true,
  },
  {
    name: 'button.press must confirm',
    domain: 'button',
    entityIds: ['button.reboot'],
    confirm: true,
  },
  {
    name: 'automation domain must confirm',
    domain: 'automation',
    entityIds: ['automation.x'],
    confirm: true,
  },
  {
    name: 'light domain + lock entity_id is rejected',
    domain: 'light',
    entityIds: ['lock.front_door'],
    confirm: true,
  },
  {
    name: 'batch prefix: one mismatched id rejects the call',
    domain: 'light',
    entityIds: ['light.ok', 'lock.sneak'],
    confirm: true,
  },
  {
    name: 'garage cover must confirm',
    domain: 'cover',
    entityIds: ['cover.garage'],
    coverDeviceClass: { 'cover.garage': 'garage' },
    confirm: true,
  },
  {
    name: 'gate cover must confirm',
    domain: 'cover',
    entityIds: ['cover.drive'],
    coverDeviceClass: { 'cover.drive': 'gate' },
    confirm: true,
  },
  {
    name: 'door cover must confirm',
    domain: 'cover',
    entityIds: ['cover.patio'],
    coverDeviceClass: { 'cover.patio': 'door' },
    confirm: true,
  },
  {
    name: 'mixed covers: one garage rejects the batch',
    domain: 'cover',
    entityIds: ['cover.blind', 'cover.garage'],
    coverDeviceClass: { 'cover.blind': 'shutter', 'cover.garage': 'garage' },
    confirm: true,
  },
  {
    name: 'scene targeting a lock must confirm',
    domain: 'scene',
    entityIds: ['scene.good_night'],
    sceneTargets: { 'scene.good_night': ['light.hall', 'lock.front_door'] },
    confirm: true,
  },
  {
    name: 'scene targeting alarm must confirm',
    domain: 'scene',
    entityIds: ['scene.leave'],
    sceneTargets: { 'scene.leave': ['alarm_control_panel.house'] },
    confirm: true,
  },
];

describe('evaluateSafeCallPolicy', () => {
  for (const c of cases) {
    it(c.name, () => {
      const err = evaluateSafeCallPolicy({
        domain: c.domain,
        entityIds: c.entityIds,
        coverDeviceClass: c.coverDeviceClass,
        sceneTargets: c.sceneTargets,
      });
      if (c.confirm) {
        assert.ok(err, `expected confirmation (error), got allow`);
      } else {
        assert.equal(err, null, `expected allow, got: ${err}`);
      }
    });
  }
});
