/**
 * safety-policy.ts – Pure allowlist for ha_call_service.
 *
 * Kept free of I/O so a table test can pin every domain × device_class case
 * without talking to Home Assistant. ha-tools.ts fetches live state and then
 * calls evaluateSafeCallPolicy.
 */

/** Domains safe for everyday control without user confirmation. */
export const SAFE_DOMAINS = new Set([
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
  'number',
  'select',
]);

/** Domains that must never be reached without confirmation, not even indirectly. */
export const GUARDED_DOMAINS = new Set(['lock', 'alarm_control_panel']);

/** Cover device classes that guard a building entrance rather than a window. */
export const GUARDED_COVER_CLASSES = new Set(['garage', 'gate', 'door']);

export interface SafeCallInput {
  domain: string;
  entityIds: string[];
  /** entity_id → device_class, only consulted for domain === 'cover'. */
  coverDeviceClass?: Record<string, string>;
  /** scene entity_id → member entity_ids. */
  sceneTargets?: Record<string, string[]>;
}

/**
 * Reject entity IDs that do not belong to the requested service domain.
 * Without this the domain allowlist would be decorative.
 */
export function assertDomainMatches(domain: string, entityIds: string[]): string | null {
  const mismatched = entityIds.filter(eid => !eid.startsWith(`${domain}.`));
  if (mismatched.length === 0) return null;
  return `entity_id must belong to domain "${domain}". Mismatched: ${mismatched.join(', ')}`;
}

/**
 * Shared policy check for the non-confirming service tool.
 * Returns an error message when the call must not proceed, otherwise null.
 */
export function evaluateSafeCallPolicy(input: SafeCallInput): string | null {
  const { domain, entityIds } = input;

  if (!SAFE_DOMAINS.has(domain)) {
    return `Domain "${domain}" is not allowed in ha_call_service. Use ha_call_service_dangerous for security-sensitive domains (including script and button).`;
  }

  const mismatch = assertDomainMatches(domain, entityIds);
  if (mismatch) return mismatch;

  if (domain === 'cover') {
    const classes = input.coverDeviceClass ?? {};
    const guarded = entityIds.filter(eid => GUARDED_COVER_CLASSES.has(classes[eid] ?? ''));
    if (guarded.length > 0) {
      return `${guarded.join(', ')} guards an entrance (device_class garage/gate/door). Use ha_call_service_dangerous.`;
    }
  }

  if (domain === 'scene') {
    const targets = input.sceneTargets ?? {};
    const hits: string[] = [];
    for (const sceneId of entityIds) {
      for (const target of targets[sceneId] ?? []) {
        const targetDomain = String(target).split('.')[0] ?? '';
        if (GUARDED_DOMAINS.has(targetDomain)) hits.push(`${sceneId} -> ${target}`);
      }
    }
    if (hits.length > 0) {
      return `This scene targets a security-sensitive entity (${hits.join(', ')}). Use ha_call_service_dangerous.`;
    }
  }

  return null;
}
