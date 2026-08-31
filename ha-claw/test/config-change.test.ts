import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toYaml, unifiedDiff } from '../src/core/yaml-text.js';
import {
  extractEntityIds,
  formatPreviewText,
  validateAutomationConfig,
  validateScriptConfig,
} from '../src/core/config-change.js';
import { proposeFriendlyName } from '../src/core/naming-hygiene.js';
import { classifyEnergySensor, wattsOf } from '../src/core/energy-attribution.js';
import { parseOrphanItemId } from '../src/core/orphan-cleanup.js';

describe('toYaml / unifiedDiff', () => {
  it('renders objects, arrays and scalars', () => {
    const yaml = toYaml({
      alias: 'Motion light',
      triggers: [{ trigger: 'state', entity_id: 'binary_sensor.hall' }],
      actions: ['turn_on'],
      enabled: true,
    });
    assert.match(yaml, /alias: Motion light/);
    assert.match(yaml, /entity_id: binary_sensor.hall/);
    assert.match(yaml, /enabled: true/);
  });

  it('diffs alias A to B', () => {
    const diff = unifiedDiff(toYaml({ alias: 'A' }), toYaml({ alias: 'B' }), 'old', 'new');
    assert.match(diff, /--- old/);
    assert.match(diff, /\+alias: B/);
    assert.match(diff, /-alias: A/);
  });

  it('marks identical files', () => {
    const text = toYaml({ alias: 'same' });
    assert.match(unifiedDiff(text, text, 'a', 'b'), /\(no changes\)/);
  });
});

describe('validateConfig', () => {
  it('refuses an automation without trigger or action', () => {
    const errors = validateAutomationConfig({ alias: 'broken' });
    assert.ok(errors.some(e => e.includes('trigger')));
    assert.ok(errors.some(e => e.includes('action')));
  });

  it('accepts modern trigger/action keys', () => {
    assert.deepEqual(
      validateAutomationConfig({
        triggers: [{ trigger: 'homeassistant', event: 'start' }],
        actions: [{ action: 'light.turn_on', target: { entity_id: 'light.x' } }],
        mode: 'restart',
      }),
      [],
    );
  });

  it('refuses an unknown mode and unknown keys', () => {
    const errors = validateAutomationConfig({
      trigger: [{ platform: 'state' }],
      action: [{ service: 'light.turn_on' }],
      mode: 'forever',
      junk: true,
    });
    assert.ok(errors.some(e => e.includes('forever')));
    assert.ok(errors.some(e => e.includes('junk')));
  });

  it('refuses an empty script sequence', () => {
    const errors = validateScriptConfig({ alias: 'noop', sequence: [] });
    assert.ok(errors.some(e => e.includes('sequence')));
  });
});

describe('extractEntityIds', () => {
  it('collects entity_id fields and template mentions', () => {
    const ids = extractEntityIds({
      trigger: { entity_id: 'binary_sensor.motion' },
      action: {
        service: 'light.turn_on',
        target: { entity_id: ['light.hall', 'light.stairs'] },
        data: { message: '{{ states("sensor.temp") }}' },
      },
    });
    assert.deepEqual(ids, ['binary_sensor.motion', 'light.hall', 'light.stairs', 'sensor.temp']);
  });
});

describe('formatPreviewText', () => {
  it('includes title, missing note and blast list', () => {
    const text = formatPreviewText({
      kind: 'config_write',
      title: 'automation 1',
      currentMissing: true,
      yamlDiff: '--- a\n+++ b\n',
      blastRadius: [{ label: 'script.night', entities: ['light.hall'] }],
    });
    assert.match(text, /automation 1/);
    assert.match(text, /Keine aktuelle Config/);
    assert.match(text, /script.night/);
  });
});

describe('proposeFriendlyName', () => {
  it('prefixes area and domain when the stem has neither', () => {
    assert.equal(proposeFriendlyName('light.decke', 'Wohnzimmer'), 'Wohnzimmer Licht Decke');
  });

  it('does not repeat an area already in the stem', () => {
    assert.equal(proposeFriendlyName('light.og_bad', 'OG Bad'), 'Og Bad');
  });
});

describe('energy sensors', () => {
  it('classifies power and energy, converts kW', () => {
    const power = {
      entity_id: 'sensor.washer_power',
      state: '1.5',
      attributes: { device_class: 'power', unit_of_measurement: 'kW' },
    };
    const energy = {
      entity_id: 'sensor.washer_energy',
      state: '12',
      attributes: { device_class: 'energy', unit_of_measurement: 'kWh' },
    };
    assert.equal(classifyEnergySensor(power), 'power');
    assert.equal(classifyEnergySensor(energy), 'energy');
    assert.equal(wattsOf(power), 1500);
    assert.equal(classifyEnergySensor({ entity_id: 'light.x', state: 'on', attributes: {} }), null);
  });
});

describe('parseOrphanItemId', () => {
  it('parses device, stem, entity and junk', () => {
    assert.deepEqual(parseOrphanItemId('dev:abc'), { type: 'device', deviceId: 'abc' });
    assert.deepEqual(parseOrphanItemId('stem:lgt_eg'), { type: 'stem', stem: 'lgt_eg' });
    assert.deepEqual(parseOrphanItemId('light.kitchen'), {
      type: 'entity',
      entityId: 'light.kitchen',
    });
    assert.deepEqual(parseOrphanItemId('nope'), { type: 'invalid', id: 'nope' });
    assert.deepEqual(parseOrphanItemId(''), { type: 'invalid', id: '' });
  });
});
