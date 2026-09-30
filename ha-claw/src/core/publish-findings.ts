/**
 * publish-findings.ts – Mirror health and Care into Home Assistant entities.
 *
 * sensor.ha_claw_health and sensor.ha_claw_care_gaps let dashboards and
 * automations use the findings without opening the add-on.
 */

import { createLogger } from './logger.js';
import { isHAAvailable, setEntityState } from './ha-client.js';
import { getCachedSystemHealth } from './system-health.js';
import { buildCoverageReport } from './coverage-report.js';

const log = createLogger('publish-findings');

export async function publishFindings(): Promise<void> {
  if (!isHAAvailable()) return;
  try {
    const health = await getCachedSystemHealth();
    if (health) {
      const failing = health.checks.filter(c => c.severity !== 'ok').map(c => c.key);
      await setEntityState('sensor.ha_claw_health', health.severity, {
        friendly_name: 'HA-Claw health',
        icon: 'mdi:heart-pulse',
        failing,
        checked_at: health.checkedAt,
      });
    }
  } catch (err) {
    log.warn('Could not publish health entity', { error: String(err) });
  }

  try {
    const coverage = await buildCoverageReport();
    await setEntityState('sensor.ha_claw_care_gaps', String(coverage.gaps.length), {
      friendly_name: 'HA-Claw care gaps',
      icon: 'mdi:home-search',
      unit_of_measurement: 'gaps',
      state_class: 'measurement',
      checked_at: coverage.checkedAt,
    });
  } catch (err) {
    log.warn('Could not publish care entity', { error: String(err) });
  }
}
