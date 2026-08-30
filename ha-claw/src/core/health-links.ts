/**
 * Frontend paths inside Home Assistant. From Ingress the add-on iframe must
 * open these with target=_top so the user leaves HA-Claw and lands on the
 * page where they can act. Standalone prepends the HA origin.
 */

import { appConfig } from './config.js';

export const HA_PATH = {
  device: (id: string) => `/config/devices/device/${id}`,
  entities: '/config/entities',
  automation: (id: string) => `/config/automation/edit/${encodeURIComponent(id)}`,
  script: (id: string) => `/config/script/edit/${encodeURIComponent(id)}`,
  scene: '/config/scene/dashboard',
  updates: '/config/updates',
  backup: '/config/backup',
  integration: (domain: string) => `/config/integrations/integration/${domain}`,
  addon: (slug: string) => `/hassio/addon/${encodeURIComponent(slug)}/info`,
  addons: '/hassio/dashboard',
  recorder: '/developer-tools/statistics',
  storage: '/hassio/system',
} as const;

/** Empty in the add-on (relative + target=_top). Origin in standalone. */
export function haFrontendBase(): string {
  if (appConfig.isAddon) return '';
  return appConfig.haApiUrl
    .replace(/\/$/, '')
    .replace(/\/core\/api$/i, '')
    .replace(/\/api$/i, '');
}

export function hrefForEntity(
  entityId: string,
  deviceId?: string | null,
  uniqueId?: string,
): string {
  if (entityId.startsWith('update.')) return HA_PATH.updates;
  if (entityId.startsWith('automation.') && uniqueId) return HA_PATH.automation(uniqueId);
  if (entityId.startsWith('script.') && uniqueId) return HA_PATH.script(uniqueId);
  if (entityId.startsWith('scene.')) return HA_PATH.scene;
  if (deviceId) return HA_PATH.device(deviceId);
  return HA_PATH.entities;
}
