import { useCallback, useEffect, useRef } from "react";
import { getAnimeDetailsBatch } from "../services/api";
import { isAiringMetadataStale, isAnimeActivelyAiring } from "../utils/airingStatus";
import { useStore } from "./useStore";

const AIRING_METADATA_REFRESH_MS = 60 * 60 * 1000;
const INACTIVE_METADATA_REFRESH_MS = 14 * 24 * 60 * 60 * 1000;

const REMOTE_METADATA_FIELDS = [
  "mal_id",
  "malId",
  "anilistId",
  "title",
  "title_english",
  "title_romaji",
  "title_native",
  "synonyms",
  "images",
  "coverImage",
  "bannerImage",
  "synopsis",
  "score",
  "rank",
  "popularity",
  "rating",
  "type",
  "format",
  "status",
  "episodes",
  "totalEpisodes",
  "episodeList",
  "duration",
  "genres",
  "demographics",
  "studios",
  "source",
  "airedDate",
  "startDate",
  "aired",
  "members",
  "favorites",
  "isAdult",
  "year",
  "season",
  "nextAiringEpisode",
  "endDate",
];

function getAnimeSyncId(entryKey, anime) {
  const rawId = anime?.malId ?? anime?.mal_id ?? entryKey;
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getLastFetchAgeMs(anime, nowMs) {
  const lastFetchAt = anime?.lastMetadataFetch ? new Date(anime.lastMetadataFetch).getTime() : 0;
  return Number.isFinite(lastFetchAt) && lastFetchAt > 0 ? nowMs - lastFetchAt : Infinity;
}

function hasImportantMetadataMissing(anime) {
  const hasCover = Boolean(anime?.coverImage || anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.small_image_url);
  const hasSynopsis = Boolean(anime?.synopsis && anime.synopsis !== "No description available.");
  const hasStudios = Array.isArray(anime?.studios) && anime.studios.length > 0;
  const hasRank = anime?.rank !== null && anime?.rank !== undefined;
  const hasTotalEpisodes = Number.isFinite(Number(anime?.totalEpisodes)) && Number(anime.totalEpisodes) > 0;

  return !hasCover || !hasSynopsis || !hasStudios || !hasRank || !hasTotalEpisodes;
}

export function shouldRefreshAnimeMetadata(anime, nowMs = Date.now()) {
  if (!anime) return false;

  const ageMs = getLastFetchAgeMs(anime, nowMs);
  if (isAnimeActivelyAiring(anime)) {
    return isAiringMetadataStale(anime, nowMs) || ageMs === Infinity || ageMs >= AIRING_METADATA_REFRESH_MS;
  }

  return (
    ageMs === Infinity ||
    ageMs >= INACTIVE_METADATA_REFRESH_MS ||
    (hasImportantMetadataMissing(anime) && ageMs >= AIRING_METADATA_REFRESH_MS)
  );
}

export function selectAnimeMetadataSyncCandidates(myAnimes, nowMs = Date.now()) {
  const candidates = [];
  const seenIds = new Set();

  for (const [entryKey, anime] of Object.entries(myAnimes || {})) {
    const id = getAnimeSyncId(entryKey, anime);
    if (!id || seenIds.has(id) || !shouldRefreshAnimeMetadata(anime, nowMs)) continue;

    seenIds.add(id);
    candidates.push({ id, entryKey });
  }

  return candidates;
}

function buildFreshAnimeMap(freshAnimeList) {
  const map = new Map();

  for (const anime of freshAnimeList || []) {
    const id = getAnimeSyncId(null, anime);
    if (id) map.set(id, anime);
  }

  return map;
}

function valuesEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function mergeFreshAnimeMetadata(prevMyAnimes, candidates, freshAnimeList, nowIso = new Date().toISOString()) {
  const freshById = buildFreshAnimeMap(freshAnimeList);
  if (freshById.size === 0) return prevMyAnimes;

  let changed = false;
  const next = { ...prevMyAnimes };

  for (const { id, entryKey } of candidates) {
    const stored = next[entryKey];
    const fresh = freshById.get(id);
    if (!stored) continue;

    if (!fresh) continue;

    const patch = {};
    let hasFieldChanges = false;

    for (const field of REMOTE_METADATA_FIELDS) {
      if (!(field in fresh)) continue;

      const freshValue = fresh[field] ?? null;
      const storedValue = stored[field] ?? null;
      if (!valuesEqual(freshValue, storedValue)) {
        patch[field] = freshValue;
        hasFieldChanges = true;
      }
    }

    next[entryKey] = {
      ...stored,
      ...patch,
      lastMetadataFetch: nowIso,
    };
    changed = true;
  }

  return changed ? next : prevMyAnimes;
}

export function useAnimeMetadataSync() {
  const { data, setMyAnimes } = useStore();
  const myAnimesRef = useRef(data.myAnimes);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    myAnimesRef.current = data.myAnimes;
  }, [data.myAnimes]);

  const runSync = useCallback(async () => {
    if (syncInFlightRef.current) return;

    const candidates = selectAnimeMetadataSyncCandidates(myAnimesRef.current);
    if (candidates.length === 0) return;

    syncInFlightRef.current = true;
    try {
      const freshAnimeList = await getAnimeDetailsBatch(candidates.map((candidate) => candidate.id));
      if (!freshAnimeList?.length) return;

      const nowIso = new Date().toISOString();
      const projectedMyAnimes = mergeFreshAnimeMetadata(myAnimesRef.current, candidates, freshAnimeList, nowIso);
      if (projectedMyAnimes === myAnimesRef.current) return;

      await setMyAnimes((prev) => mergeFreshAnimeMetadata(prev, candidates, freshAnimeList, nowIso));
    } catch (error) {
      console.error("[useAnimeMetadataSync] Error syncing anime metadata:", error);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [setMyAnimes]);

  useEffect(() => {
    void runSync();
  }, [data.myAnimes, runSync]);
}
