/**
 * ingress-allow.ts – Source-address check for add-on mode.
 *
 * Home Assistant asks Ingress-facing servers to accept only the Ingress
 * gateway 172.30.32.2. HEALTHCHECK talks to 127.0.0.1, and the Supervisor
 * watchdog comes from the hassio network 172.30.32.0/23. Everything else is
 * refused so publishing the port is not enough to reach the API.
 */

const INGRESS_GATEWAY = '172.30.32.2';
const HASSIO_NET = { a: 172, b: 30, c: 32, prefix: 23 };

export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice('::ffff:'.length);
  return trimmed;
}

function ipv4Parts(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  if (parts.some(n => n > 255)) return null;
  return parts;
}

function inHassioNet(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  // 172.30.32.0/23 → 172.30.32.0 – 172.30.33.255
  return p[0] === HASSIO_NET.a && p[1] === HASSIO_NET.b && (p[2] === 32 || p[2] === 33);
}

/** True when this peer may talk to the add-on HTTP server. */
export function isAllowedAddonPeer(ip: string | undefined | null): boolean {
  const n = normalizeIp(ip);
  if (n === '127.0.0.1' || n === '::1' || n === INGRESS_GATEWAY) return true;
  return inHassioNet(n);
}
