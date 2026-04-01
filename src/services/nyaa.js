import { invoke } from "@tauri-apps/api/core";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

function buildKey({ fansub = "", query = "" }) {
  return `${fansub}::${query}`.toLowerCase();
}

export function getCachedNyaaFeed({ fansub = "", query = "", ttlMs = DEFAULT_TTL_MS }) {
  const key = buildKey({ fansub, query });
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry;
}

export async function fetchNyaaFeed({ fansub = "", query = "", force = false, ttlMs = DEFAULT_TTL_MS }) {
  const key = buildKey({ fansub, query });

  if (!force) {
    const cached = getCachedNyaaFeed({ fansub, query, ttlMs });
    if (cached) return cached;
    if (inFlight.has(key)) return inFlight.get(key);
  }

  const request = invoke("fetch_nyaa", { query, fansub })
    .then((result) => {
      const entry = {
        data: result || [],
        timestamp: Date.now(),
      };
      cache.set(key, entry);
      return entry;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
