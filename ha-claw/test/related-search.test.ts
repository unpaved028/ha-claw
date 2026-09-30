import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entityIdsFromRelatedResult, relatedItemType } from '../src/core/ha-client.js';

describe('search/related for YAML automations', () => {
  it('asks Core for the automation or script, not for a generic entity', () => {
    assert.equal(relatedItemType('automation.flur'), 'automation');
    assert.equal(relatedItemType('script.gute_nacht'), 'script');
    assert.equal(relatedItemType('light.flur'), 'entity');
  });

  it('keeps entity ids from every Core bucket that holds them', () => {
    const ids = entityIdsFromRelatedResult(
      {
        entity: ['binary_sensor.flur_motion', 'light.flur', 'automation.flur', 'script.nested'],
        area: ['kitchen'],
        device: ['abc123'],
        script: ['script.nested'],
        scene: ['scene.film'],
        group: ['group.lichter'],
        person: ['person.rena'],
        automation: ['automation.other'],
        config_entry: ['abc.def'],
        blueprint: ['homeassistant/motion_light.yaml'],
      },
      'automation.flur',
    );
    assert.deepEqual(ids, [
      'binary_sensor.flur_motion',
      'light.flur',
      'script.nested',
      'automation.other',
      'scene.film',
      'group.lichter',
      'person.rena',
    ]);
  });

  it('reads a script id that arrived only in the script bucket', () => {
    assert.deepEqual(entityIdsFromRelatedResult({ script: 'script.nested' }, 'automation.flur'), [
      'script.nested',
    ]);
  });

  it('returns nothing when the result has no entity ids', () => {
    assert.deepEqual(
      entityIdsFromRelatedResult({ area: ['kitchen'], device: ['abc123'] }, 'automation.flur'),
      [],
    );
    assert.deepEqual(entityIdsFromRelatedResult(null, 'automation.flur'), []);
  });
});
