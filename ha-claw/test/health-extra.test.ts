import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findEnergyMetaEntityIds,
  findOutageClusters,
  findStuckUpdates,
  formatRepairNote,
  looksLikeEnergyOrPower,
  outageClusterSeverity,
  parseRepairIssues,
} from '../src/core/health-extra.js';

const now = new Date('2026-09-08T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

describe('energy_meta', () => {
  it('flags power/energy sensors that have no state_class', () => {
    const ids = findEnergyMetaEntityIds([
      {
        entity_id: 'sensor.plug_power',
        state: '12',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
      },
      {
        entity_id: 'sensor.plug_energy',
        state: '1.2',
        attributes: {
          device_class: 'energy',
          unit_of_measurement: 'kWh',
          state_class: 'total_increasing',
        },
      },
      {
        entity_id: 'sensor.kw_only',
        state: '0.3',
        attributes: { unit_of_measurement: 'kW' },
      },
      {
        entity_id: 'sensor.temp',
        state: '21',
        attributes: { device_class: 'temperature' },
      },
      {
        entity_id: 'sensor.dead_watt',
        state: 'unavailable',
        attributes: { unit_of_measurement: 'W' },
      },
    ]);
    assert.deepEqual(ids.sort(), ['sensor.kw_only', 'sensor.plug_power']);
  });

  it('does not treat a temperature sensor as energy', () => {
    assert.equal(
      looksLikeEnergyOrPower({
        entity_id: 'sensor.temp',
        state: '20',
        attributes: { device_class: 'temperature' },
      }),
      false,
    );
  });
});

describe('stuck_updates', () => {
  it('flags update.* on for 14 days and detects a stuck HA stack update', () => {
    const result = findStuckUpdates(
      [
        {
          entity_id: 'update.plug_firmware',
          state: 'on',
          attributes: { title: 'Plug' },
          last_changed: daysAgo(15),
        },
        {
          entity_id: 'update.fresh_fw',
          state: 'on',
          attributes: { title: 'Fresh' },
          last_changed: daysAgo(2),
        },
        {
          entity_id: 'update.home_assistant_core_update',
          state: 'on',
          attributes: { title: 'Home Assistant Core' },
          last_changed: daysAgo(16),
        },
        {
          entity_id: 'update.done',
          state: 'off',
          attributes: {},
          last_changed: daysAgo(20),
        },
      ],
      now,
    );
    assert.deepEqual(result.entityIds.sort(), [
      'update.home_assistant_core_update',
      'update.plug_firmware',
    ]);
    assert.equal(result.stackStuck, true);
  });

  it('does not treat a two-day pending update as stuck', () => {
    const result = findStuckUpdates(
      [
        {
          entity_id: 'update.os_update',
          state: 'on',
          attributes: { title: 'Operating System' },
          last_changed: daysAgo(2),
        },
      ],
      now,
    );
    assert.deepEqual(result.entityIds, []);
    assert.equal(result.stackStuck, false);
  });
});

function fourZigbeeDevices(entryId: string, start = 1) {
  const entities = [];
  const devices = [];
  for (let i = start; i < start + 4; i++) {
    const id = `dev-${entryId}-${i}`;
    devices.push({ id, name: `Dev ${i}`, name_by_user: null, config_entries: [entryId] });
    entities.push({
      entity_id: `binary_sensor.node_${i}`,
      device_id: id,
      config_entry_id: entryId,
    });
  }
  return { entities, devices };
}

describe('outage_cluster', () => {
  it('needs four devices on the same config entry', () => {
    const four = fourZigbeeDevices('zha');
    const snapshot = {
      ...four,
      entries: [{ entry_id: 'zha', domain: 'zha', title: 'Zigbee' }],
    };
    const hit = findOutageClusters(
      four.entities.map(e => e.entity_id),
      snapshot,
    );
    assert.equal(hit.items.length, 1);
    assert.equal(hit.items[0]?.label, 'Zigbee');
    assert.equal(hit.maxClusterSize, 4);
    assert.equal(outageClusterSeverity(hit.items.length, hit.maxClusterSize), 'warn');

    const threeIds = four.entities.slice(0, 3).map(e => e.entity_id);
    const miss = findOutageClusters(threeIds, snapshot);
    assert.equal(miss.items.length, 0);
    assert.equal(outageClusterSeverity(0, 0), 'ok');
  });

  it('is critical at three clusters or ten devices in one', () => {
    assert.equal(outageClusterSeverity(3, 4), 'critical');
    assert.equal(outageClusterSeverity(1, 10), 'critical');
    assert.equal(outageClusterSeverity(2, 4), 'warn');
  });

  it('skips an empty registry and does not claim first-run recoveries', () => {
    const empty = findOutageClusters(['sensor.x'], {
      entities: [],
      devices: [],
      entries: [],
    });
    assert.equal(empty.items.length, 0);

    const four = fourZigbeeDevices('mqtt');
    const first = findOutageClusters(
      four.entities.map(e => e.entity_id),
      {
        ...four,
        entries: [{ entry_id: 'mqtt', domain: 'mqtt', title: 'MQTT' }],
      },
      null,
    );
    assert.equal(first.recoveredDeviceCount, 0);
  });

  it('counts devices that were reachable on the previous hourly sample', () => {
    const four = fourZigbeeDevices('zha');
    const snapshot = {
      ...four,
      entries: [{ entry_id: 'zha', domain: 'zha', title: 'Zigbee' }],
    };
    const result = findOutageClusters(
      four.entities.map(e => e.entity_id),
      snapshot,
      ['stem:other'],
    );
    assert.equal(result.recoveredDeviceCount, 4);
  });
});

describe('repairs', () => {
  it('parses the HA envelope and skips dismissed issues', () => {
    const issues = parseRepairIssues({
      issues: [
        { domain: 'hue', issue_id: 'bridge', severity: 'error' },
        { domain: 'mqtt', issue_id: 'old', dismissed_version: '2024.1.0' },
        { domain: 'homeassistant', issue_id: 'yaml' },
      ],
    });
    assert.deepEqual(issues.map(i => i.domain).sort(), ['homeassistant', 'hue']);
    assert.deepEqual(parseRepairIssues(null), []);
    assert.deepEqual(parseRepairIssues({ issues: [] }), []);
  });

  it('notes overlap with failed integrations instead of inventing a second card', () => {
    const copy = {
      repairsOpen: (n: number, list: string) => `Repairs: ${n} (${list}).`,
      repairsSame: 'Same as this card.',
    };
    const overlap = formatRepairNote(
      [{ domain: 'hue', issue_id: 'a', severity: 'error' }],
      new Set(['hue']),
      copy,
    );
    assert.equal(overlap, 'Repairs: 1 (hue). Same as this card.');
    const extra = formatRepairNote(
      [
        { domain: 'hue', issue_id: 'a', severity: 'error' },
        { domain: 'homeassistant', issue_id: 'b', severity: 'warning' },
      ],
      new Set(['hue']),
      copy,
    );
    assert.equal(extra, 'Repairs: 2 (hue, homeassistant).');
    assert.equal(formatRepairNote([], new Set(['hue']), copy), undefined);
  });
});
