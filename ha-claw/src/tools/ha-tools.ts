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
import { logAction, getActionById } from '../storage/action-log.js';
import { getCachedResult, setCachedResult } from './tool-cache.js';

const log = createLogger('ha-tools');

/** Domains safe for everyday control without user confirmation. */
const SAFE_DOMAINS = new Set([
  'light',
  'switch',
  'scene',
  'media_player',
  'cover',
  'fan',
  'input_boolean',
  'input_number',
  'input_select',
  'input_text',
  'climate',
  'vacuum',
  'humidifier',
  'water_heater',
  'script',
  'number',
  'select',
  'button',
]);

/** Expected state after common service calls (for verification). */
const EXPECTED_STATE: Record<string, string> = {
  turn_on: 'on',
  turn_off: 'off',
  open_cover: 'open',
  close_cover: 'closed',
  lock: 'locked',
  unlock: 'unlocked',
};

const ROLLBACK_MAP: Record<string, string> = {
  turn_on: 'turn_off',
  turn_off: 'turn_on',
  open_cover: 'close_cover',
  close_cover: 'open_cover',
  lock: 'unlock',
  unlock: 'lock',
};

function getRollback(
  domain: string,
  service: string,
  entityId: string | string[],
  data: Record<string, unknown>,
) {
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
    'Get current state and attributes of one or more Home Assistant entities. Supports batching for efficiency.',
    {
      entity_id: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Single entity ID or array of entity IDs',
      },
    },
    async args => {
      const input = args['entity_id'] as string | string[];
      const entityIds = Array.isArray(input) ? input : [input];
      
      const results = await Promise.all(entityIds.map(async eid => {
        const cacheKey = `state:${eid}`;
        const cached = getCachedResult(cacheKey);
        if (cached) return cached;

        try {
          const state = await ha.getState(eid);
          const res = {
            entity_id: state.entity_id,
            state: state.state,
            friendly_name: state.attributes['friendly_name'] ?? null,
            attributes: state.attributes,
            last_changed: state.last_changed,
          };
          setCachedResult(cacheKey, res, 5000);
          return res;
        } catch (err) {
          return { entity_id: eid, error: 'Entity not found or HA error' };
        }
      }));

      return Array.isArray(input) ? { results } : results[0];
    },
    { required: ['entity_id'] },
  );

  // ── ha_search_entities ───────────────────────────────────
  registerTool(
    'ha_search_entities',
    'Search Home Assistant entities by name, domain, or area/room. Returns a list of matching entity IDs with their current state. Use this to find entities before interacting with them.',
    {
      query: {
        type: 'string',
        description: 'Search term (matched against entity_id and friendly_name)',
      },
      domain: {
        type: 'string',
        description: 'Optional: filter by domain (e.g. "light", "sensor")',
      },
      area: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Optional: area name or array of area names (e.g. "Living Room", ["Kitchen", "Garden"])',
      },
      floor: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Optional: floor name or array of floor names (e.g. "Ground", ["First", "Basement"])',
      },
      device_class: {
        type: 'string',
        description: 'Optional: filter by device_class (e.g. "motion", "temperature")',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 50)',
      },
    },
    async args => {
      const query = ((args['query'] as string) ?? '').toLowerCase();
      const domain = (args['domain'] as string) ?? '';
      const areaInput = args['area'] as string | string[] | undefined;
      const floorInput = args['floor'] as string | string[] | undefined;
      const deviceClassFilter = ((args['device_class'] as string) ?? '').toLowerCase();
      const limit = (args['limit'] as number) ?? 50;

      const areaFilters = areaInput ? (Array.isArray(areaInput) ? areaInput.map(a => a.toLowerCase()) : [areaInput.toLowerCase()]) : null;
      const floorFilters = floorInput ? (Array.isArray(floorInput) ? floorInput.map(f => f.toLowerCase()) : [floorInput.toLowerCase()]) : null;

      // Resolve floor → areas if floorFilter is set
      let floorAreaNames: Set<string> | null = null;
      if (floorFilters) {
        const floorMap = await ha.getFloorAreaMap();
        floorAreaNames = new Set<string>();
        for (const [floorName, areas] of Object.entries(floorMap)) {
          if (floorFilters.some(ff => floorName.toLowerCase().includes(ff))) {
            for (const a of areas) floorAreaNames.add(a.toLowerCase());
          }
        }
      }

      // Resolve area → entity_ids
      let areaEntityIds: Set<string> | null = null;
      if (areaFilters || floorAreaNames) {
        const areaMap = await ha.getAreaEntityMap();
        areaEntityIds = new Set<string>();
        for (const [areaName, entityIds] of Object.entries(areaMap)) {
          const lowerName = areaName.toLowerCase();
          const matchFloor = floorAreaNames ? floorAreaNames.has(lowerName) : true;
          const matchArea = areaFilters ? areaFilters.some(af => lowerName.includes(af)) : true;
          
          if (matchFloor && matchArea) {
            for (const eid of entityIds) areaEntityIds.add(eid);
          }
        }
      }

      const allStates = await ha.getStates();

      const filtered = allStates
        .filter(s => {
          if (domain && !s.entity_id.startsWith(domain + '.')) return false;
          if (areaEntityIds && !areaEntityIds.has(s.entity_id)) return false;
          if (deviceClassFilter) {
            const dc = String(s.attributes['device_class'] ?? '').toLowerCase();
            if (dc !== deviceClassFilter) return false;
          }
          if (!query) return true;
          const name = String(s.attributes['friendly_name'] ?? '').toLowerCase();
          return s.entity_id.includes(query) || name.includes(query);
        })
        .slice(0, limit)
        .map(s => ({
          entity_id: s.entity_id,
          state: s.state,
          friendly_name: s.attributes['friendly_name'] ?? null,
          device_class: s.attributes['device_class'] ?? null,
        }));

      return { count: filtered.length, entities: filtered };
    },
    { required: [] },
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
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Target entity ID or list of entity IDs (batching)',
      },
      data: {
        type: 'object',
        description: 'Optional service data (e.g. {"brightness": 128, "color_temp": 300})',
      },
    },
    async args => {
      const domain = args['domain'] as string;
      const service = args['service'] as string;
      const entityIds = Array.isArray(args['entity_id'])
        ? (args['entity_id'] as string[])
        : [args['entity_id'] as string];
      const extraData = (args['data'] as Record<string, unknown>) ?? {};

      if (!SAFE_DOMAINS.has(domain)) {
        return {
          error: `Domain "${domain}" is not allowed in ha_call_service. Use ha_call_service_dangerous for security-sensitive domains.`,
        };
      }

      // Capture states before action
      const statesBefore: Record<string, string | null> = {};
      for (const eid of entityIds) {
        try {
          statesBefore[eid] = (await ha.getState(eid)).state;
        } catch {
          statesBefore[eid] = null;
        }
      }

      const res = await ha.callService(domain, service, {
        entity_id: entityIds.length === 1 ? entityIds[0] : entityIds,
        ...extraData,
      });

      // Clear cache for these entities
      for (const eid of entityIds) {
        setCachedResult(`state:${eid}`, undefined, 0);
      }

      const rollback = getRollback(domain, service, entityIds.length === 1 ? entityIds[0]! : entityIds, extraData);
      await logAction(
        'switch',
        `${domain}.${service} auf ${entityIds.join(', ')}`,
        'ha_call_service',
        rollback,
      );

      // Feedback loop: verify states changed
      const verifications: Record<string, any> = {};
      let anyFailed = false;

      try {
        const waitMs = domain === 'climate' ? 3000 : 1500;
        await new Promise(r => setTimeout(r, waitMs));

        for (const eid of entityIds) {
          try {
            const afterEntity = await ha.getState(eid);
            const stateAfter = afterEntity.state;
            const stateBefore = statesBefore[eid] ?? null;

            let verified: boolean;
            if (domain === 'climate' && service === 'set_temperature') {
              const targetTemp = extraData['temperature'] as number | undefined;
              const currentTemp = afterEntity.attributes['temperature'] as number | undefined;
              verified = targetTemp !== undefined && currentTemp === targetTemp;
            } else {
              const expectedState = EXPECTED_STATE[service];
              verified = expectedState ? stateAfter === expectedState : stateAfter !== stateBefore;
            }

            verifications[eid] = { verified, stateBefore, stateAfter };
            if (!verified) anyFailed = true;
          } catch {
            verifications[eid] = { verified: false, error: 'Could not fetch state after action' };
            anyFailed = true;
          }
        }
      } catch {
        /* non-critical */
      }

      const result: Record<string, unknown> = { ...res, verifications };
      if (anyFailed) {
        const failedIds = Object.entries(verifications)
          .filter(([_, v]) => !v.verified)
          .map(([id]) => id);
        result.IMPORTANT_WARNING = `WARNUNG: Einige Aktionen konnten nicht verifiziert werden: ${failedIds.join(', ')}. Bitte dem Nutzer ehrlich mitteilen!`;
      }
      return result;
    },
    { dangerous: false, required: ['domain', 'service', 'entity_id'], complexity: 1 },
  );

  // ── ha_light_set_scene ────────────────────────────────────
  registerTool(
    'ha_light_set_scene',
    'Activate a light scene. This is a shorthand for scene.turn_on.',
    {
      scene_id: {
        type: 'string',
        description: 'The scene entity ID (e.g. "scene.abendlicht")',
      },
    },
    async args => {
      const sceneId = args['scene_id'] as string;
      const res = await ha.callService('scene', 'turn_on', { entity_id: sceneId });
      await logAction('switch', `Szene aktiviert: ${sceneId}`, 'ha_light_set_scene');
      return res;
    },
    { required: ['scene_id'] },
  );

  // ── ha_light_set_color ────────────────────────────────────
  registerTool(
    'ha_light_set_color',
    'Set color or color temperature of one or more lights. Also turns them on if they are off.',
    {
      entity_id: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Target light entity ID(s)',
      },
      rgb_color: {
        type: 'array',
        items: { type: 'number' },
        description: 'RGB color as array [r, g, b] (0-255)',
      },
      color_temp: {
        type: 'number',
        description: 'Color temperature in mireds (e.g. 153 to 500)',
      },
      brightness_pct: {
        type: 'number',
        description: 'Brightness percentage (0-100)',
      },
    },
    async args => {
      const entityId = args['entity_id'] as string | string[];
      const data: Record<string, any> = { entity_id: entityId };
      if (args['rgb_color']) data['rgb_color'] = args['rgb_color'];
      if (args['color_temp']) data['color_temp'] = args['color_temp'];
      if (args['brightness_pct']) data['brightness_pct'] = args['brightness_pct'];

      const res = await ha.callService('light', 'turn_on', data);

      // Clear cache
      const ids = Array.isArray(entityId) ? entityId : [entityId];
      for (const eid of ids) setCachedResult(`state:${eid}`, undefined, 0);

      await logAction(
        'switch',
        `Lichtfarbe/Temp angepasst fuer ${Array.isArray(entityId) ? entityId.join(', ') : entityId}`,
        'ha_light_set_color',
      );
      return res;
    },
    { required: ['entity_id'] },
  );

  // ── ha_get_entities_by_label ──────────────────────────────
  registerTool(
    'ha_get_entities_by_label',
    'Find all entities that have a specific label assigned.',
    {
      label: { type: 'string', description: 'Label ID or name (case-insensitive)' },
    },
    async args => {
      const label = (args['label'] as string).toLowerCase();
      const entitiesWithLabels = await ha.getEntitiesWithLabels();
      const filtered = entitiesWithLabels.filter(e => {
        return e.labels.some((l: string) => l.toLowerCase() === label);
      });
      return { label, count: filtered.length, entities: filtered.map(f => f.entity_id) };
    },
    { required: ['label'] },
  );

  // ── action_log_rollback ──────────────────────────────────
  registerTool(
    'action_log_rollback',
    'Revert a previous action if it has rollback information. Use the ID from action_log_list.',
    {
      action_id: { type: 'string', description: 'ID of the action to rollback' },
    },
    async args => {
      const id = args['action_id'] as string;
      const action = await getActionById(id);
      if (!action) return { error: `Action ${id} not found.` };
      if (!action.rollback) return { error: `Action ${id} has no rollback information.` };

      const { domain, service, entity_id, data } = action.rollback;
      const res = await ha.callService(domain, service, { ...data, entity_id });
      
      await logAction(
        'system',
        `Rollback ausgeführt für Aktion ${id}: ${action.description}`,
        'action_log_rollback',
      );
      
      return { success: true, original_action: action.description, rollback_result: res };
    },
    { required: ['action_id'], dangerous: true },
  );

  // ── ha_call_service_dangerous (security-sensitive domains) ─
  registerTool(
    'ha_call_service_dangerous',
    'Call a Home Assistant service for SECURITY-SENSITIVE domains (lock, alarm_control_panel, automation, homeassistant, notify, rest_command, shell_command, etc.). Requires user confirmation before execution.',
    {
      domain: {
        type: 'string',
        description:
          'Service domain (e.g. "lock", "alarm_control_panel", "automation", "homeassistant")',
      },
      service: {
        type: 'string',
        description: 'Service name (e.g. "lock", "unlock", "trigger", "reload")',
      },
      entity_id: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Target entity ID or list of entity IDs (optional for some services)',
      },
    },
    async args => {
      const domain = args['domain'] as string;
      const service = args['service'] as string;
      const entityId = args['entity_id'] as string | string[] | undefined;
      const extraData = (args['data'] as Record<string, unknown>) ?? {};

      const payload: Record<string, unknown> = { ...extraData };
      if (entityId) payload['entity_id'] = entityId;

      const res = await ha.callService(domain, service, payload);

      // Clear cache
      if (Array.isArray(entityId)) {
        for (const eid of entityId) setCachedResult(`state:${eid}`, undefined, 0);
      } else if (entityId) {
        setCachedResult(`state:${entityId}`, undefined, 0);
      }

      const rollback = entityId ? getRollback(domain, service, entityId, extraData) : undefined;
      await logAction(
        'switch',
        `${domain}.${service}${entityId ? ' auf ' + (Array.isArray(entityId) ? entityId.join(', ') : entityId) : ''}`,
        'ha_call_service_dangerous',
        rollback,
      );
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
      states.forEach(s => {
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
    async args => {
      const filterFloor = ((args['floor'] as string) ?? '').toLowerCase();
      const [areaMap, floorMap] = await Promise.all([ha.getAreaEntityMap(), ha.getFloorAreaMap()]);

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
    async args => {
      const entityId = args['entity_id'] as string;
      if (!entityId) return { error: 'entity_id is required' };

      const members = await ha.getGroupMembers(entityId);
      if (members.length === 0) {
        return { error: `No members found for ${entityId} (not a group or empty)` };
      }

      const memberStates = await Promise.all(
        members.map(async mid => {
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

  // ── ha_get_automation_config ───────────────────────────
  registerTool(
    'ha_get_automation_config',
    'Get the full configuration of a Home Assistant automation including triggers, conditions, and actions. Use this to understand what an automation does.',
    {
      entity_id: {
        type: 'string',
        description: 'The automation entity ID (e.g. "automation.motion_light_flur")',
      },
    },
    async args => {
      const entityId = args['entity_id'] as string;
      if (!entityId || !entityId.startsWith('automation.')) {
        return { error: 'entity_id must start with "automation."' };
      }
      return ha.getAutomationConfig(entityId);
    },
    { required: ['entity_id'] },
  );

  // ── ha_save_automation_config ─────────────────────────────
  registerTool(
    'ha_save_automation_config',
    'Update the configuration of an existing Home Assistant automation. WARNING: This will overwrite the existing configuration. Use ha_get_automation_config first to get the current config.',
    {
      id: {
        type: 'string',
        description:
          'The internal ID of the automation (NOT the entity_id). You get this from the "id" attribute of the automation state or the "id" field in the config.',
      },
      config: {
        type: 'object',
        description: 'The new automation configuration (triggers, conditions, actions, etc.)',
      },
    },
    async args => {
      const id = args['id'] as string;
      const config = args['config'] as Record<string, unknown>;
      if (!id || !config) return { error: 'id and config are required' };
      return ha.saveAutomationConfig(id, config);
    },
    { dangerous: true, required: ['id', 'config'], complexity: 3 },
  );

  // ── ha_get_script_config ────────────────────────────────
  registerTool(
    'ha_get_script_config',
    'Get the full configuration of a Home Assistant script including the sequence of actions. Use this to understand what a script does.',
    {
      entity_id: {
        type: 'string',
        description: 'The script entity ID (e.g. "script.gute_nacht")',
      },
    },
    async args => {
      const entityId = args['entity_id'] as string;
      if (!entityId || !entityId.startsWith('script.')) {
        return { error: 'entity_id must start with "script."' };
      }
      return ha.getScriptConfig(entityId);
    },
    { required: ['entity_id'] },
  );

  // ── ha_save_script_config ────────────────────────────────
  registerTool(
    'ha_save_script_config',
    'Update the configuration of an existing Home Assistant script. WARNING: This will overwrite the existing configuration. Use ha_get_script_config first to get the current config.',
    {
      id: {
        type: 'string',
        description: 'The internal ID of the script (NOT the entity_id).',
      },
      config: {
        type: 'object',
        description: 'The new script configuration (sequence, fields, etc.)',
      },
    },
    async args => {
      const id = args['id'] as string;
      const config = args['config'] as Record<string, unknown>;
      if (!id || !config) return { error: 'id and config are required' };
      return ha.saveScriptConfig(id, config);
    },
    { dangerous: true, required: ['id', 'config'], complexity: 3 },
  );

  // ── ha_call_service_dangerous ──────────────────────────────
  registerTool(
    'ha_call_service_dangerous',
    'Call ANY Home Assistant service on one or more entities. Use this for sensitive domains like lock, alarm_control_panel, automation, or homeassistant. Requires user confirmation.',
    {
      domain: {
        type: 'string',
        description: 'The domain of the service (e.g. "lock", "alarm_control_panel")',
      },
      service: {
        type: 'string',
        description: 'The service name (e.g. "lock", "unlock", "arm_away")',
      },
      entity_id: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } }
        ],
        description: 'Target entity ID or list of entity IDs',
      },
      data: {
        type: 'object',
        description: 'Optional service data',
      },
    },
    async args => {
      const domain = args['domain'] as string;
      const service = args['service'] as string;
      const entityIds = Array.isArray(args['entity_id'])
        ? (args['entity_id'] as string[])
        : [args['entity_id'] as string];
      const extraData = (args['data'] as Record<string, unknown>) ?? {};

      // Capture states before action
      const statesBefore: Record<string, string | null> = {};
      for (const eid of entityIds) {
        try {
          statesBefore[eid] = (await ha.getState(eid)).state;
        } catch {
          statesBefore[eid] = null;
        }
      }

      const res = await ha.callService(domain, service, {
        entity_id: entityIds.length === 1 ? entityIds[0] : entityIds,
        ...extraData,
      });

      // Clear cache
      for (const eid of entityIds) setCachedResult(`state:${eid}`, undefined, 0);

      const rollback = getRollback(domain, service, entityIds.length === 1 ? entityIds[0]! : entityIds, extraData);
      await logAction(
        'system',
        `${domain}.${service} auf ${entityIds.join(', ')}`,
        'ha_call_service_dangerous',
        rollback,
      );

      return { ...res, warning: 'Aktion an sicherheitssensiblen Bereich gesendet.' };
    },
    { dangerous: true, required: ['domain', 'service', 'entity_id'], complexity: 2 },
  );

  log.info('HA tools registered', { count: 12 });
}
