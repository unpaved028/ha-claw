/**
 * ha-tools.ts – Home Assistant tools for the agentic loop.
 *
 * These tools let the AI agent interact with Home Assistant:
 * - Read entity states
 * - Search entities
 * - Call services (turn on/off, etc.)
 * - Get HA system info
 *
 * Service calls are split by risk level:
 * - SAFE domains (light, switch, scene, media_player, cover, fan, input_boolean,
 *   input_number, input_select, input_text, climate, vacuum, humidifier, water_heater,
 *   script, number, select, button) → no confirmation needed
 * - DANGEROUS domains (lock, alarm_control_panel, automation, homeassistant, notify,
 *   persistent_notification, rest_command, shell_command, …) → confirmation required
 */

import { registerTool } from './registry.js';
import * as ha from '../core/ha-client.js';
import { createLogger } from '../core/logger.js';
import { logAction } from '../storage/action-log.js';

const log = createLogger('ha-tools');

/** Domains safe for everyday control without user confirmation. */
const SAFE_DOMAINS = new Set([
  'light', 'switch', 'scene', 'media_player', 'cover', 'fan',
  'input_boolean', 'input_number', 'input_select', 'input_text',
  'climate', 'vacuum', 'humidifier', 'water_heater',
  'script', 'number', 'select', 'button',
]);

/** Expected state after common service calls (for verification). */
const EXPECTED_STATE: Record<string, string> = {
  'turn_on': 'on',
  'turn_off': 'off',
  'open_cover': 'open',
  'close_cover': 'closed',
  'lock': 'locked',
  'unlock': 'unlocked',
};

const ROLLBACK_MAP: Record<string, string> = {
  'turn_on': 'turn_off',
  'turn_off': 'turn_on',
  'open_cover': 'close_cover',
  'close_cover': 'open_cover',
  'lock': 'unlock',
  'unlock': 'lock',
};

function getRollback(domain: string, service: string, entityId: string, data: Record<string, unknown>) {
  const reverse = ROLLBACK_MAP[service];
  if (reverse) {
    return { domain, service: reverse, entity_id: entityId, data };
  }
  return undefined;
}

export function registerHATools(): void {
  // ... (lines 34-100 unchanged)
  // (Note: Skipping re-pasting ha_get_state and ha_search_entities for brevity, 
  // but they must remain in the file)
  // ── ha_get_state ─────────────────────────────────────────
  registerTool(
    'ha_get_state',
    'Get the current state and attributes of a Home Assistant entity (e.g. light.living_room, sensor.temperature).',
    {
      entity_id: {
        type: 'string',
        description: 'The entity ID (e.g. "light.wohnzimmer", "sensor.temperature_outdoor")',
      },
    },
    async (args) => {
      const state = await ha.getState(args['entity_id'] as string);
      return {
        entity_id: state.entity_id,
        state: state.state,
        friendly_name: state.attributes['friendly_name'] ?? null,
        attributes: state.attributes,
        last_changed: state.last_changed,
      };
    },
    { required: ['entity_id'] },
  );

  // ── ha_search_entities ───────────────────────────────────
  registerTool(
    'ha_search_entities',
    'Search Home Assistant entities by name or domain. Returns a list of matching entity IDs with their current state. Use this to find entities before interacting with them.',
    {
      query: {
        type: 'string',
        description: 'Search term (matched against entity_id and friendly_name)',
      },
      domain: {
        type: 'string',
        description: 'Optional: filter by domain (e.g. "light", "sensor", "switch", "climate")',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 20)',
      },
    },
    async (args) => {
      const query = ((args['query'] as string) ?? '').toLowerCase();
      const domain = (args['domain'] as string) ?? '';
      const limit = (args['limit'] as number) ?? 20;

      const allStates = await ha.getStates();

      const filtered = allStates
        .filter((s) => {
          if (domain && !s.entity_id.startsWith(domain + '.')) return false;
          if (!query) return true;
          const name = String(s.attributes['friendly_name'] ?? '').toLowerCase();
          return s.entity_id.includes(query) || name.includes(query);
        })
        .slice(0, limit)
        .map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          friendly_name: s.attributes['friendly_name'] ?? null,
        }));

      return { count: filtered.length, entities: filtered };
    },
    { required: ['query'] },
  );

  // ── ha_call_service (safe everyday domains) ─────────────
  registerTool(
    'ha_call_service',
    `Call a Home Assistant service to control everyday devices. Use this for: lights, switches, scenes, media players, covers, fans, climate/thermostats, vacuums, input helpers, scripts, and buttons. This tool does NOT require user confirmation. For security-sensitive domains (lock, alarm, automation, homeassistant), use ha_call_service_dangerous instead.`,
    {
      domain: {
        type: 'string',
        description: `Service domain. Allowed: ${[...SAFE_DOMAINS].join(', ')}`,
      },
      service: {
        type: 'string',
        description: 'Service name (e.g. "turn_on", "turn_off", "toggle", "set_temperature")',
      },
      entity_id: {
        type: 'string',
        description: 'Target entity ID',
      },
      data: {
        type: 'object',
        description: 'Optional service data (e.g. {"brightness": 128, "color_temp": 300})',
      },
    },
    async (args) => {
      const domain = args['domain'] as string;
      const service = args['service'] as string;
      const entityId = args['entity_id'] as string;
      const extraData = (args['data'] as Record<string, unknown>) ?? {};

      if (!SAFE_DOMAINS.has(domain)) {
        return { error: `Domain "${domain}" is not allowed in ha_call_service. Use ha_call_service_dangerous for security-sensitive domains.` };
      }

      // Capture state before action
      let stateBefore: string | null = null;
      try { stateBefore = (await ha.getState(entityId)).state; } catch { /* ignore */ }

      const res = await ha.callService(domain, service, {
        entity_id: entityId,
        ...extraData,
      });
      const rollback = getRollback(domain, service, entityId, extraData);
      await logAction('switch', `${domain}.${service} auf ${entityId}`, 'ha_call_service', rollback);

      // Feedback loop: verify state changed
      let verification: { verified: boolean; stateBefore: string | null; stateAfter: string | null; warning?: string } | undefined;
      try {
        const waitMs = domain === 'climate' ? 3000 : 1500;
        await new Promise(r => setTimeout(r, waitMs));
        const afterEntity = await ha.getState(entityId);
        const stateAfter = afterEntity.state;

        let verified: boolean;
        if (domain === 'climate' && service === 'set_temperature') {
          // For set_temperature, check the temperature attribute, not the state
          const targetTemp = extraData['temperature'] as number | undefined;
          const currentTemp = afterEntity.attributes['temperature'] as number | undefined;
          verified = targetTemp !== undefined && currentTemp === targetTemp;
        } else {
          const expectedState = EXPECTED_STATE[service];
          verified = expectedState
            ? stateAfter === expectedState
            : stateAfter !== stateBefore; // fallback: state should have changed
        }

        verification = { verified, stateBefore, stateAfter };
        if (!verified) {
          log.warn('Action verification failed', { entityId, service, stateBefore, stateAfter });
          verification.warning = `WARNUNG: Aktion "${service}" auf "${entityId}" konnte nicht verifiziert werden. Zustand vorher: ${stateBefore}, nachher: ${stateAfter}. Die Aktion wurde moeglicherweise NICHT ausgefuehrt. Bitte dem Nutzer ehrlich mitteilen!`;
        }
      } catch { /* verification is non-critical */ }

      const result: Record<string, unknown> = { ...res, verification };
      if (verification && !verification.verified && verification.warning) {
        result.IMPORTANT_WARNING = verification.warning;
      }
      return result;
    },
    { dangerous: false, required: ['domain', 'service', 'entity_id'], complexity: 1 },
  );

  // ── ha_call_service_dangerous (security-sensitive domains) ─
  registerTool(
    'ha_call_service_dangerous',
    'Call a Home Assistant service for SECURITY-SENSITIVE domains (lock, alarm_control_panel, automation, homeassistant, notify, rest_command, shell_command, etc.). Requires user confirmation before execution.',
    {
      domain: {
        type: 'string',
        description: 'Service domain (e.g. "lock", "alarm_control_panel", "automation", "homeassistant")',
      },
      service: {
        type: 'string',
        description: 'Service name (e.g. "lock", "unlock", "trigger", "reload")',
      },
      entity_id: {
        type: 'string',
        description: 'Target entity ID (optional for some services)',
      },
      data: {
        type: 'object',
        description: 'Optional service data',
      },
    },
    async (args) => {
      const domain = args['domain'] as string;
      const service = args['service'] as string;
      const entityId = args['entity_id'] as string | undefined;
      const extraData = (args['data'] as Record<string, unknown>) ?? {};

      const payload: Record<string, unknown> = { ...extraData };
      if (entityId) payload['entity_id'] = entityId;

      const res = await ha.callService(domain, service, payload);
      const rollback = entityId ? getRollback(domain, service, entityId, extraData) : undefined;
      await logAction('switch', `${domain}.${service}${entityId ? ' auf ' + entityId : ''}`, 'ha_call_service_dangerous', rollback);
      return res;
    },
    { dangerous: true, required: ['domain', 'service'], complexity: 2 },
  );

  // ── ha_get_config ────────────────────────────────────────
  registerTool(
    'ha_get_config',
    'Get Home Assistant configuration info (version, location, timezone, unit system).',
    {},
    async () => {
      const config = await ha.getConfig();
      return {
        version: config['version'],
        location_name: config['location_name'],
        time_zone: config['time_zone'],
        latitude: config['latitude'],
        longitude: config['longitude'],
        unit_system: config['unit_system'],
        elevation: config['elevation'],
      };
    },
  );

  // ── ha_get_all_entities ──────────────────────────────────
  registerTool(
    'ha_get_all_entities',
    'Get a summary of ALL entities in Home Assistant, grouped by domain. Uses this to understand what is available.',
    {},
    async () => {
      const states = await ha.getStates();
      const domains: Record<string, number> = {};
      states.forEach((s) => {
        const d = s.entity_id.split('.')[0]!;
        domains[d] = (domains[d] ?? 0) + 1;
      });
      return {
        total_entities: states.length,
        domains,
      };
    },
  );

  // ── ha_list_areas ────────────────────────────────────────
  registerTool(
    'ha_list_areas',
    'List all areas/rooms in Home Assistant with their floor assignments and entity counts. Use this to understand the spatial structure of the home.',
    {
      floor: {
        type: 'string',
        description: 'Optional: filter by floor name (e.g. "Erdgeschoss")',
      },
    },
    async (args) => {
      const filterFloor = ((args['floor'] as string) ?? '').toLowerCase();
      const [areaMap, floorMap] = await Promise.all([
        ha.getAreaEntityMap(),
        ha.getFloorAreaMap(),
      ]);

      // Build reverse map: area → floor
      const areaToFloor = new Map<string, string>();
      for (const [floorName, areaNames] of Object.entries(floorMap)) {
        for (const aName of areaNames) {
          areaToFloor.set(aName, floorName);
        }
      }

      // Build result grouped by floor
      const floors: Record<string, { area: string; entity_count: number }[]> = {};
      for (const [areaName, entityIds] of Object.entries(areaMap)) {
        const floorName = areaToFloor.get(areaName) || 'Kein Stockwerk';
        if (filterFloor && floorName.toLowerCase() !== filterFloor) continue;
        if (!floors[floorName]) floors[floorName] = [];
        floors[floorName].push({ area: areaName, entity_count: entityIds.length });
      }

      return { floors };
    },
  );

  // ── ha_resolve_group ────────────────────────────────────
  registerTool(
    'ha_resolve_group',
    'Resolve a group entity to its individual member entities with their current states. Use this to understand what devices belong to a group.',
    {
      entity_id: {
        type: 'string',
        description: 'The group entity ID (e.g. "group.all_lights", "group.wohnzimmer")',
      },
    },
    async (args) => {
      const entityId = args['entity_id'] as string;
      if (!entityId) return { error: 'entity_id is required' };

      const members = await ha.getGroupMembers(entityId);
      if (members.length === 0) {
        return { error: `No members found for ${entityId} (not a group or empty)` };
      }

      const memberStates = await Promise.all(
        members.map(async (mid) => {
          try {
            const s = await ha.getState(mid);
            return {
              entity_id: mid,
              state: s.state,
              friendly_name: s.attributes['friendly_name'] ?? null,
            };
          } catch {
            return { entity_id: mid, state: 'unknown', friendly_name: null };
          }
        }),
      );

      return { group: entityId, member_count: members.length, members: memberStates };
    },
    { required: ['entity_id'] },
  );

  // ── ha_get_automation_config ────────────────────────────
  registerTool(
    'ha_get_automation_config',
    'Get the full configuration of a Home Assistant automation including triggers, conditions, and actions. Use this to understand what an automation does.',
    {
      entity_id: {
        type: 'string',
        description: 'The automation entity ID (e.g. "automation.motion_light_flur")',
      },
    },
    async (args) => {
      const entityId = args['entity_id'] as string;
      if (!entityId || !entityId.startsWith('automation.')) {
        return { error: 'entity_id must start with "automation."' };
      }

      return ha.getAutomationConfig(entityId);
    },
    { required: ['entity_id'] },
  );

  log.info('HA tools registered', { count: 9 });
}
