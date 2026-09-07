import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { indexFromConfigs } from '../src/core/automation-index.js';
import {
  findQualityIssues,
  hasNumericTemplateComparison,
  looksLikeNumericTemplate,
  triggerOrConditionHasBareDeviceId,
} from '../src/core/automation-quality.js';

const motionStates = [
  { entity_id: 'binary_sensor.flur_bewegung', attributes: { device_class: 'motion' } },
  { entity_id: 'light.flur', attributes: {} },
];

describe('quality walkers', () => {
  it('flags a device trigger without entity_id', () => {
    assert.equal(
      triggerOrConditionHasBareDeviceId({
        triggers: [{ trigger: 'device', device_id: 'abcdefghijklmnopqrst', domain: 'light' }],
        actions: [{ action: 'light.turn_on' }],
      }),
      true,
    );
    assert.equal(
      triggerOrConditionHasBareDeviceId({
        triggers: [{ trigger: 'state', entity_id: 'binary_sensor.flur_bewegung' }],
      }),
      false,
    );
  });

  it('recognises numeric templates and ignores is_state waits', () => {
    assert.equal(looksLikeNumericTemplate("{{ states('sensor.x') | float > 25 }}"), true);
    assert.equal(looksLikeNumericTemplate("{{ is_state('binary_sensor.x', 'on') }}"), false);
    assert.equal(
      hasNumericTemplateComparison({
        condition: 'template',
        value_template: "{{ states('sensor.temp') | float(0) > 23 }}",
      }),
      true,
    );
  });
});

describe('findQualityIssues', () => {
  it('reports device_id, motion mode single, and a clean automation as negative', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.devicey',
        label: 'Devicey',
        config: {
          triggers: [{ platform: 'device', device_id: 'abcdefghijklmnopqrst' }],
          actions: [{ action: 'light.turn_on', target: { entity_id: 'light.flur' } }],
        },
      },
      {
        entityId: 'automation.motion_single',
        label: 'Motion single',
        config: {
          mode: 'single',
          triggers: [{ trigger: 'state', entity_id: 'binary_sensor.flur_bewegung', to: 'on' }],
          actions: [
            { action: 'light.turn_on', target: { entity_id: 'light.flur' } },
            { delay: '00:02:00' },
            { action: 'light.turn_off', target: { entity_id: 'light.flur' } },
          ],
        },
      },
      {
        entityId: 'automation.numeric',
        label: 'Numeric',
        config: {
          triggers: [{ trigger: 'state', entity_id: 'sensor.temp' }],
          conditions: [
            { condition: 'template', value_template: "{{ states('sensor.temp') | float > 25 }}" },
          ],
          actions: [{ action: 'notify.notify' }],
        },
      },
      {
        entityId: 'automation.ok',
        label: 'Ok',
        config: {
          mode: 'restart',
          triggers: [{ trigger: 'state', entity_id: 'binary_sensor.flur_bewegung', to: 'on' }],
          actions: [
            { action: 'light.turn_on', target: { entity_id: 'light.flur' } },
            { delay: '00:02:00' },
          ],
        },
      },
    ]);
    const issues = findQualityIssues(index, motionStates);
    const kinds = issues.map(i => i.kind).sort();
    assert.deepEqual(kinds, ['device_id_trigger', 'motion_mode_single', 'numeric_as_template']);
    assert.equal(
      issues.find(i => i.entityId === 'automation.ok'),
      undefined,
    );
  });

  it('skips yaml-only automations', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.yaml',
        yamlOnly: true,
        config: { entity_id: ['binary_sensor.flur_bewegung', 'light.flur'] },
      },
    ]);
    assert.deepEqual(findQualityIssues(index, motionStates), []);
  });
});
