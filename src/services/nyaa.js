import { invoke } from "@tauri-apps/api/core";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

function buildKey({ fansub = "", query = "", category = "" }) {
  return `${fansub}::${query}::${category}`.toLowerCase();
}

export function getCachedNyaaFeed({ fansub = "", query = "", category = "", ttlMs = DEFAULT_TTL_MS }) {
  const key = buildKey({ fansub, query, category });
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry;
}

export async function fetchNyaaFeed({ fansub = "", query = "", category = "1_2", force = false, ttlMs = DEFAULT_TTL_MS }) {
  const key = buildKey({ fansub, query, category });

  if (!force) {
    const cached = getCachedNyaaFeed({ fansub, query, category, ttlMs });
    if (cached) return cached;
    if (inFlight.has(key)) return inFlight.get(key);
  }

  const request = invoke("fetch_nyaa", { query, fansub, category })
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
