/**
 * tool-cache.ts – Simple TTL cache for tool results.
 * Used to avoid redundant HA API calls within the same agentic loop.
 */

interface CacheEntry {
  value: any;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 5000; // 5 seconds

/**
 * Get a value from the cache if it's not expired.
 */
export function getCachedResult(key: string): any | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Store a result in the cache.
 */
export function setCachedResult(key: string, value: any, ttl = DEFAULT_TTL): void {
  cache.set(key, {
    value,
    expiry: Date.now() + ttl,
  });
}

/**
 * Clear the cache (e.g. at the start of a new loop or after a service call).
 */
export function clearToolCache(): void {
  cache.clear();
}
