import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  callsNotifyService,
  collectRefs,
  getAutomationIndex,
  hasSunSignal,
  indexFromConfigs,
  loadAutomationIndex,
  resetAutomationIndexCache,
  walkConfig,
} from '../src/core/automation-index.js';
import { findMissingRefs, knownDomains } from '../src/core/health-signals.js';
import { findCoverageGaps } from '../src/core/coverage-report.js';

function motionLightConfig(motion: string, light: string): Record<string, unknown> {
  return {
    alias: 'Flur Nachtlicht',
    mode: 'restart',
    triggers: [{ trigger: 'state', entity_id: motion, to: 'on' }],
    actions: [{ action: 'light.turn_on', target: { entity_id: light } }],
  };
}

describe('collectRefs / walkConfig', () => {
  it('collects entity_id, device_id and template mentions', () => {
    const entities = new Set<string>();
    const devices = new Set<string>();
    collectRefs(
      {
        trigger: { platform: 'state', entity_id: 'binary_sensor.gone' },
        action: {
          device_id: 'abcdefghijklmnopqrst',
          entity_id: 'light.ok',
          data: "{{ states('sensor.other') }}",
        },
      },
      entities,
      devices,
    );
    assert.ok(entities.has('binary_sensor.gone'));
    assert.ok(entities.has('light.ok'));
    assert.ok(entities.has('sensor.other'));
    assert.ok(devices.has('abcdefghijklmnopqrst'));
  });

  it('walks modern trigger/action keys and records mode plus services', () => {
    const walked = walkConfig(motionLightConfig('binary_sensor.hall', 'light.hall'));
    assert.deepEqual(walked.entityRefs, ['binary_sensor.hall', 'light.hall']);
    assert.deepEqual(walked.triggerPlatforms, ['state']);
    assert.equal(walked.mode, 'restart');
    assert.deepEqual(walked.services, ['light.turn_on']);
  });

  it('detects a sun trigger and notify services', () => {
    const sun = walkConfig({
      triggers: [{ trigger: 'sun', event: 'sunset' }],
      actions: [{ action: 'cover.set_cover_position', target: { entity_id: 'cover.west' } }],
    });
    assert.ok(hasSunSignal(sun));
    assert.ok(sun.entityRefs.includes('cover.west'));

    const viaEntity = walkConfig({
      triggers: [{ trigger: 'numeric_state', entity_id: 'sun.sun', attribute: 'elevation' }],
      actions: [{ service: 'cover.close_cover', entity_id: 'cover.west' }],
    });
    assert.ok(hasSunSignal(viaEntity));

    const notify = walkConfig({
      triggers: [{ trigger: 'state', entity_id: 'binary_sensor.leak' }],
      actions: [{ service: 'persistent_notification.create', data: { message: 'leak' } }],
    });
    assert.ok(callsNotifyService(notify.services));
    assert.ok(notify.entityRefs.includes('binary_sensor.leak'));
  });
});

describe('broken refs from the index', () => {
  it('flags a missing entity and a missing device the same way as before', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.x',
        label: 'X',
        config: {
          trigger: { entity_id: 'light.dead' },
          action: { device_id: 'deaddevice0000001', service: 'light.turn_on' },
        },
      },
    ]);
    const rec = index.records[0]!;
    const items = findMissingRefs(
      [
        {
          entityId: rec.entityId,
          label: rec.label,
          entityRefs: rec.entityRefs,
          deviceRefs: rec.deviceRefs,
        },
      ],
      new Set(['automation.x', 'light.live']),
      new Set(['livedevice00000001']),
      new Set(['light', 'automation']),
    );
    assert.equal(items.length, 1);
    assert.deepEqual(items[0]?.entities, ['device:deaddevi', 'light.dead']);
  });

  it('ignores unknown domains and self-references', () => {
    const walked = walkConfig({
      trigger: { entity_id: 'automation.x' },
      action: { data: '{{ foobar.not_a_domain }}' },
    });
    const items = findMissingRefs(
      [{ entityId: 'automation.x', label: 'X', entityRefs: walked.entityRefs, deviceRefs: [] }],
      new Set(['automation.x']),
      new Set(),
      knownDomains([{ entity_id: 'automation.x' }]),
    );
    assert.equal(items.length, 0);
  });
});

describe('coverage from config, not names', () => {
  const areaMap = {
    Flur: ['binary_sensor.flur_bewegung', 'light.flur'],
    Bad: ['binary_sensor.bad_bewegung', 'light.bad', 'cover.bad'],
    Keller: ['binary_sensor.keller_leck'],
  };

  const states = [
    {
      entity_id: 'binary_sensor.flur_bewegung',
      attributes: { device_class: 'motion' },
    },
    { entity_id: 'light.flur', attributes: {} },
    {
      entity_id: 'binary_sensor.bad_bewegung',
      attributes: { device_class: 'motion' },
    },
    { entity_id: 'light.bad', attributes: {} },
    { entity_id: 'cover.bad', attributes: {} },
    {
      entity_id: 'binary_sensor.keller_leck',
      attributes: { device_class: 'moisture' },
    },
  ];

  it('does not treat an automation named nachtlicht as a motion-light gap', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.flur_nachtlicht',
        config: motionLightConfig('binary_sensor.flur_bewegung', 'light.flur'),
      },
    ]);
    const gaps = findCoverageGaps(states, areaMap, index);
    assert.equal(
      gaps.find(g => g.key === 'motion_light:Flur'),
      undefined,
    );
    assert.ok(gaps.some(g => g.key === 'motion_light:Bad'));
  });

  it('still reports a gap when only the name mentions motion', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.flur_bewegung_irgendwas',
        config: {
          alias: 'Bewegung Flur',
          triggers: [{ trigger: 'time', at: '22:00:00' }],
          actions: [{ action: 'notify.notify', data: { message: 'hi' } }],
        },
      },
    ]);
    const gaps = findCoverageGaps(states, areaMap, index);
    assert.ok(gaps.some(g => g.key === 'motion_light:Flur'));
  });

  it('does not mark every room covered because one automation is named cover', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.cover_something',
        config: {
          alias: 'Cover West',
          triggers: [{ trigger: 'sun', event: 'sunset' }],
          actions: [{ action: 'cover.close_cover', target: { entity_id: 'cover.west' } }],
        },
      },
    ]);
    const gaps = findCoverageGaps(states, areaMap, index);
    assert.ok(gaps.some(g => g.key === 'cover_sun:Bad'));
  });

  it('covers a room when the automation references that cover and the sun', () => {
    const index = indexFromConfigs([
      {
        entityId: 'automation.bad_sonne',
        config: {
          triggers: [{ platform: 'sun', event: 'sunrise' }],
          actions: [{ service: 'cover.open_cover', entity_id: 'cover.bad' }],
        },
      },
    ]);
    const gaps = findCoverageGaps(states, areaMap, index);
    assert.equal(
      gaps.find(g => g.key === 'cover_sun:Bad'),
      undefined,
    );
  });

  it('requires a notify service for leak coverage, not just the sensor name', () => {
    const namedOnly = indexFromConfigs([
      {
        entityId: 'automation.leck_alarm',
        config: {
          alias: 'Leck Keller',
          triggers: [{ trigger: 'state', entity_id: 'binary_sensor.keller_leck' }],
          actions: [{ action: 'light.turn_on', target: { entity_id: 'light.keller' } }],
        },
      },
    ]);
    assert.ok(
      findCoverageGaps(states, areaMap, namedOnly).some(g => g.key === 'leak_notify:Keller'),
    );

    const withNotify = indexFromConfigs([
      {
        entityId: 'automation.leck_push',
        config: {
          triggers: [{ trigger: 'state', entity_id: 'binary_sensor.keller_leck' }],
          actions: [{ service: 'notify.mobile_app', data: { message: 'leak' } }],
        },
      },
    ]);
    assert.equal(
      findCoverageGaps(states, areaMap, withNotify).find(g => g.key === 'leak_notify:Keller'),
      undefined,
    );
  });

  it('treats yaml-only entity_id attributes as refs (motion+light) but not as sun/notify', () => {
    const index = indexFromConfigs(
      [
        {
          entityId: 'automation.yaml_flur',
          yamlOnly: true,
          config: { entity_id: ['binary_sensor.flur_bewegung', 'light.flur'] },
        },
      ],
      { uiScanned: 0, yamlOnly: 1 },
    );
    const gaps = findCoverageGaps(states, areaMap, index);
    assert.equal(
      gaps.find(g => g.key === 'motion_light:Flur'),
      undefined,
    );
    assert.ok(gaps.some(g => g.key === 'cover_sun:Bad'));
    assert.ok(gaps.some(g => g.key === 'leak_notify:Keller'));
  });

  it('requires a climate service for a window+climate gap, not just the names', () => {
    const climateStates = [
      ...states,
      { entity_id: 'binary_sensor.bad_fenster', attributes: { device_class: 'window' } },
      { entity_id: 'climate.bad', attributes: {} },
    ];
    const climateAreas = {
      ...areaMap,
      Bad: [...areaMap.Bad, 'binary_sensor.bad_fenster', 'climate.bad'],
    };

    const namedOnly = indexFromConfigs([
      {
        entityId: 'automation.fenster_alarm',
        config: {
          alias: 'Fenster Bad',
          triggers: [{ trigger: 'state', entity_id: 'binary_sensor.bad_fenster' }],
          actions: [{ action: 'light.turn_on', target: { entity_id: 'light.bad' } }],
        },
      },
    ]);
    assert.ok(
      findCoverageGaps(climateStates, climateAreas, namedOnly).some(
        g => g.key === 'climate_window:Bad',
      ),
    );

    const pauses = indexFromConfigs([
      {
        entityId: 'automation.bad_pause',
        config: {
          triggers: [{ trigger: 'state', entity_id: 'binary_sensor.bad_fenster', to: 'on' }],
          actions: [{ action: 'climate.turn_off', target: { entity_id: 'climate.bad' } }],
          mode: 'restart',
        },
      },
    ]);
    const paused = findCoverageGaps(climateStates, climateAreas, pauses);
    assert.equal(
      paused.find(g => g.key === 'climate_window:Bad'),
      undefined,
    );
    assert.ok(paused.every(g => g.action && g.action.sketch));
  });

  it('covers climate away only when presence and a climate service are referenced', () => {
    const awayStates = [
      ...states,
      { entity_id: 'person.rene', attributes: {} },
      { entity_id: 'climate.bad', attributes: {} },
    ];
    const awayAreas = { ...areaMap, Bad: [...areaMap.Bad, 'climate.bad'] };

    const missing = findCoverageGaps(awayStates, awayAreas, indexFromConfigs([]));
    assert.ok(missing.some(g => g.key === 'climate_away:Bad'));

    const covered = indexFromConfigs([
      {
        entityId: 'automation.away',
        config: {
          triggers: [{ trigger: 'state', entity_id: 'person.rene', to: 'not_home' }],
          actions: [{ service: 'climate.set_temperature', target: { entity_id: 'climate.bad' } }],
        },
      },
    ]);
    assert.equal(
      findCoverageGaps(awayStates, awayAreas, covered).find(g => g.key === 'climate_away:Bad'),
      undefined,
    );
  });

  it('does not invent a motion-light gap when the room has no lights', () => {
    const gaps = findCoverageGaps(
      [{ entity_id: 'binary_sensor.only_motion', attributes: { device_class: 'motion' } }],
      { Dach: ['binary_sensor.only_motion'] },
      indexFromConfigs([]),
    );
    assert.deepEqual(gaps, []);
  });
});

describe('automation index cache', () => {
  beforeEach(() => {
    resetAutomationIndexCache();
  });

  it('reuses the walk until the cache is reset', async () => {
    let calls = 0;
    const fetchConfig = async () => {
      calls += 1;
      return motionLightConfig('binary_sensor.a', 'light.a');
    };
    const states = [{ entity_id: 'automation.a', attributes: { id: 'a' } }];

    await getAutomationIndex(states, { fetchConfig });
    await getAutomationIndex(states, { fetchConfig });
    assert.equal(calls, 1);

    resetAutomationIndexCache();
    await getAutomationIndex(states, { fetchConfig });
    assert.equal(calls, 2);
  });

  it('counts yaml-only configs that have no entity_id attributes', async () => {
    const index = await loadAutomationIndex(
      [
        { entity_id: 'automation.ui', attributes: { id: 'ui' } },
        { entity_id: 'automation.yaml', attributes: { id: 'yaml' } },
      ],
      async (_kind, id) => (id === 'ui' ? { triggers: [], actions: [] } : null),
    );
    assert.equal(index.uiScanned, 1);
    assert.equal(index.yamlOnly, 1);
    assert.equal(index.records.length, 1);
  });
});
