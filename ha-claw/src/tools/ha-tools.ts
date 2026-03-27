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

const log = createLogger('ha-tools');

/** Domains safe for everyday control without user confirmation. */
const SAFE_DOMAINS = new Set([
  'light', 'switch', 'scene', 'media_player', 'cover', 'fan',
  'input_boolean', 'input_number', 'input_select', 'input_text',
  'climate', 'vacuum', 'humidifier', 'water_heater',
  'script', 'number', 'select', 'button',
]);

export function registerHATools(): void {
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

      return ha.callService(domain, service, {
        entity_id: entityId,
        ...extraData,
      });
    },
    { dangerous: false, required: ['domain', 'service', 'entity_id'] },
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

      return ha.callService(domain, service, payload);
    },
    { dangerous: true, required: ['domain', 'service'] },
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

  log.info('HA tools registered', { count: 6 });
}
