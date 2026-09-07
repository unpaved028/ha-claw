import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findingsFromCoverage } from '../src/core/proactive-analysis.js';
import { isRetiredAnalysisTitle, sourceKeyFromTitle } from '../src/storage/backlog.js';

describe('findingsFromCoverage', () => {
  it('uses the gap key as sourceKey and leak_notify as high priority', () => {
    const findings = findingsFromCoverage([
      {
        key: 'motion_light:Flur',
        kind: 'motion_light',
        area: 'Flur',
        detail: '2 Bewegungsmelder und 1 Lichter, aber keine Automation die sie verbindet.',
        entities: ['binary_sensor.flur_bewegung', 'light.flur'],
        suggestedBlueprint: 'Official: Motion-activated Light',
        action: {
          trigger: ['binary_sensor.flur_bewegung'],
          targets: ['light.flur'],
          mode: 'restart',
          sketch: 'state binary_sensor.flur_bewegung → on',
        },
      },
      {
        key: 'leak_notify:Keller',
        kind: 'leak_notify',
        area: 'Keller',
        detail: '1 Leck-Sensor ohne Benachrichtigung.',
        entities: ['binary_sensor.keller_leck'],
        suggestedBlueprint: 'moisture → notify',
        action: {
          trigger: ['binary_sensor.keller_leck'],
          targets: ['binary_sensor.keller_leck'],
          mode: 'single',
          sketch: 'binary_sensor.keller_leck on → notify',
        },
      },
    ]);
    assert.equal(findings[0]?.sourceKey, 'motion_light:Flur');
    assert.equal(findings[0]?.priority, 'medium');
    assert.equal(findings[1]?.sourceKey, 'leak_notify:Keller');
    assert.equal(findings[1]?.priority, 'high');
    assert.match(findings[0]?.title ?? '', /Flur/);
    assert.match(findings[1]?.toBe ?? '', /moisture → notify/);
    assert.match(findings[1]?.toBe ?? '', /notify/);
  });
});

describe('retired analysis titles', () => {
  it('matches live counts to the representative titles', () => {
    assert.ok(isRetiredAnalysisTitle('12 Lichter tagsüber an'));
    assert.ok(isRetiredAnalysisTitle('Keine Rauchmelder in Home Assistant integriert'));
    assert.ok(isRetiredAnalysisTitle('3 Geräte im Standby verbrauchen 14W'));
    assert.ok(isRetiredAnalysisTitle('Bewegungsmelder ohne Licht-Automatisierung'));
    assert.equal(isRetiredAnalysisTitle('Flur: something new'), false);
  });

  it('collapses counts the same way sourceKeyFromTitle always did', () => {
    assert.equal(
      sourceKeyFromTitle('59 Geräte nicht erreichbar'),
      sourceKeyFromTitle('0 Geräte nicht erreichbar'),
    );
  });
});
