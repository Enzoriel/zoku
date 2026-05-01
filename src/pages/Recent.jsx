import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useAnime } from "../context/AnimeContext";
import { useRecentAnimeContext } from "../context/RecentAnimeContext";
import { extractBaseTitle } from "../utils/titleIdentity";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import { useLibrary } from "../context/LibraryContext";
import { getBestFolderMatch } from "../utils/libraryView";
import { formatRelativeDate, getLocalDayKey } from "../utils/dateFormat";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import TorrentSearchModal from "../components/ui/TorrentSearchModal";
import RetryPanel from "../components/ui/RetryPanel";
import { usePlayback } from "../hooks/usePlayback";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { getBatchEpisodeTorrentAvailability } from "../utils/torrentAvailability";
import { buildRecentEpisodeOccurrences } from "../utils/recentEpisodes";
import { getEffectiveTorrentSourceFansub } from "../utils/torrentConfig";
import styles from "./Recent.module.css";
import { DAY_NAMES, DAY_NAMES_SHORT } from "../utils/constants";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RECENT_MS = 14 * DAY_MS;

function getAnimeKey(anime) {
  return String(anime.malId || anime.mal_id || anime.id || anime.title);
}

function normalizeStatus(status) {
  return String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isFinishedStatus(status) {
  return status.includes("finished") || status.includes("finalizado");
}

function isAiringLikeStatus(status) {
  return status.includes("airing") || status.includes("releasing") || status.includes("emision");
}

function getTotalEpisodeCount(anime) {
  const counts = [anime?.episodes, anime?.totalEpisodes, anime?.episodeList?.length]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return counts.length > 0 ? Math.max(...counts) : 0;
}

function Recent() {
  const { data, libraryScopeReady } = useStore();
  const { loading, error, retryFetch } = useAnime();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("recientes");
  const [activeDay, setActiveDay] = useState(new Date().getDay());

  const { allAiringAnime, loadingExtra, errorExtra, retryExtra } = useRecentAnimeContext();
  const { data: torrentData, principalFansub, getItemsForFansub } = useTorrent();
  const { localFilesIndex, performSync } = useLibrary();

  const [torrentModalOpen, setTorrentModalOpen] = useState(false);
  const [torrentModalItems, setTorrentModalItems] = useState([]);
  const [torrentModalAnimeTitle, setTorrentModalAnimeTitle] = useState("");
  const [torrentModalMalId, setTorrentModalMalId] = useState(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalItem, setSearchModalItem] = useState(null);
  const [fansubFilter, setFansubFilter] = useState("all");

  const { toast } = useToast();
  useEffect(() => {
    if (data.folderPath && libraryScopeReady) {
      performSync();
    }
  }, [data.folderPath, libraryScopeReady, performSync]);
  const { playingEp, playEpisode } = usePlayback();

  const myAnimeMap = useMemo(() => {
    const map = {};
    Object.entries(data.myAnimes || {}).forEach(([id, anime]) => {
      map[id] = anime;
      map[Number(id)] = anime;
    });
    return map;
  }, [data.myAnimes]);

  const torrentRelevantMyAnimeMap = useMemo(() => {
    const map = {};
    Object.entries(data.myAnimes || {}).forEach(([id, anime]) => {
      map[id] = {
        torrentAlias: anime.torrentAlias,
        torrentSearchTerm: anime.torrentSearchTerm,
        torrentTitle: anime.torrentTitle,
        torrentSourceFansub: anime.torrentSourceFansub || null,
        synonyms: anime.synonyms,
        watchedEpisodes: anime.watchedEpisodes,
        folderName: anime.folderName,
      };
      map[Number(id)] = map[id];
    });
    return map;
  }, [data.myAnimes]);

  const hasTrackedAnime = useMemo(() => Object.keys(data.myAnimes || {}).length > 0, [data.myAnimes]);

  const myAiringAnime = useMemo(() => {
    return allAiringAnime
      .filter((anime) => {
        const animeId = anime.malId || anime.mal_id;
        return myAnimeMap[animeId] || myAnimeMap[Number(animeId)] || myAnimeMap[String(animeId)];
      })
      .map((anime) => {
        const animeId = anime.malId || anime.mal_id;
        const stored = myAnimeMap[animeId] || myAnimeMap[Number(animeId)] || myAnimeMap[String(animeId)];
        const watchedEps = stored?.watchedEpisodes || [];
        const localFolder = getBestFolderMatch({ ...stored, malId: animeId }, data.localFiles, localFilesIndex);
        const localFiles = localFolder?.files || [];

        return {
          ...anime,
          storedData: stored,
          assignedFansub: getEffectiveTorrentSourceFansub(stored, principalFansub),
          watchedEps,
          localFiles,
        };
      });
  }, [allAiringAnime, myAnimeMap, data.localFiles, principalFansub, localFilesIndex]);

  const availableFansubFilters = useMemo(() => {
    const counts = new Map();
    myAiringAnime.forEach((anime) => {
      if (!anime.assignedFansub) return;
      counts.set(anime.assignedFansub, (counts.get(anime.assignedFansub) || 0) + 1);
    });

    const options = [{ key: "all", label: "TODOS" }];
    if (principalFansub && counts.has(principalFansub)) {
      options.push({ key: principalFansub, label: principalFansub });
    }

    Array.from(counts.keys())
      .filter((fansub) => fansub !== principalFansub)
      .sort((a, b) => a.localeCompare(b))
      .forEach((fansub) => {
        options.push({ key: fansub, label: fansub });
      });

    return options;
  }, [myAiringAnime, principalFansub]);

  useEffect(() => {
    if (availableFansubFilters.some((option) => option.key === fansubFilter)) return;
    setFansubFilter("all");
  }, [availableFansubFilters, fansubFilter]);

  const filteredAiringAnime = useMemo(() => {
    if (fansubFilter === "all") return myAiringAnime;
    return myAiringAnime.filter((anime) => anime.assignedFansub === fansubFilter);
  }, [myAiringAnime, fansubFilter]);

  const [nowMs, setNowMs] = useState(Date.now());

  const recentOccurrencesMap = useMemo(() => {
    const map = new Map();

    myAiringAnime.forEach((anime) => {
      const occurrences = buildRecentEpisodeOccurrences(anime, nowMs) || [];
      map.set(getAnimeKey(anime), occurrences);
    });

    return map;
  }, [myAiringAnime, nowMs]);

  useEffect(() => {
    let nextTransitionAtMs = null;
    let shouldCatchUp = false;
    const realNowMs = Date.now();

    const registerTransition = (candidateMs) => {
      if (!Number.isFinite(candidateMs) || candidateMs <= 0) return;

      if (candidateMs <= realNowMs) {
        if (candidateMs > nowMs) shouldCatchUp = true;
        return;
      }

      if (!nextTransitionAtMs || candidateMs < nextTransitionAtMs) {
        nextTransitionAtMs = candidateMs;
      }
    };

    myAiringAnime.forEach((anime) => {
      const airingAtMs = Number(anime.nextAiringEpisode?.airingAt || 0) * 1000;
      if (Number.isFinite(airingAtMs) && airingAtMs > 0) {
        const previousAiringAtMs = airingAtMs - WEEK_MS;

        [previousAiringAtMs, previousAiringAtMs + DAY_MS, airingAtMs, airingAtMs + DAY_MS].forEach(registerTransition);
      }

      const recentOccurrences = recentOccurrencesMap.get(getAnimeKey(anime)) || [];
      recentOccurrences.forEach(({ airedAt }) => {
        registerTransition(airedAt + DAY_MS);
        registerTransition(airedAt + RECENT_MS + 1);
      });
    });

    if (shouldCatchUp) {
      setNowMs(realNowMs);
      return;
    }

    if (!nextTransitionAtMs) return;

    const timeUntil = nextTransitionAtMs - realNowMs + 1000;
    if (timeUntil <= 0) {
      setNowMs(realNowMs);
      return;
    }

    const timeoutId = setTimeout(() => {
      setNowMs(Date.now());
    }, Math.min(timeUntil, 2147483647));

    return () => clearTimeout(timeoutId);
  }, [myAiringAnime, nowMs, recentOccurrencesMap]);

  useEffect(() => {
    if (activeTab !== "horario") return;

    setNowMs(Date.now());

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, [activeTab]);

  const getScheduleEntry = useCallback(
    (anime) => {
      const animeKey = getAnimeKey(anime);
      const recentOccurrences = recentOccurrencesMap.get(animeKey) || [];
      const latestRecent = recentOccurrences[0] || null;
      const normalizedStatus = normalizeStatus(anime?.status);
      const nextAiring = anime.nextAiringEpisode;
      const totalEpisodeCount = getTotalEpisodeCount(anime);

      if (latestRecent && latestRecent.airedAt <= nowMs && nowMs - latestRecent.airedAt < DAY_MS) {
        return {
          anime,
          nextEp: latestRecent.ep,
          airingAt: latestRecent.airedAt,
          status: "aired_recently",
        };
      }

      if (!nextAiring) {
        if (latestRecent && isFinishedStatus(normalizedStatus)) {
          return {
            anime,
            nextEp: latestRecent.ep,
            airingAt: latestRecent.airedAt,
            status: "finished",
          };
        }

        if (latestRecent && isAiringLikeStatus(normalizedStatus)) {
          return {
            anime,
            nextEp: latestRecent.ep,
            airingAt: latestRecent.airedAt,
            status: "hiatus_or_unknown",
          };
        }

        if (totalEpisodeCount > 0 && latestRecent && latestRecent.ep >= totalEpisodeCount) {
          return {
            anime,
            nextEp: latestRecent.ep,
            airingAt: latestRecent.airedAt,
            status: "finished",
          };
        }

        return null;
      }

      const airingAtMs = Number(nextAiring.airingAt || 0) * 1000;
      if (!Number.isFinite(airingAtMs) || airingAtMs <= 0) return null;
      const nextEpisodeNumber = Number(nextAiring.episode || 0);
      const previousAiringAtMs = airingAtMs - WEEK_MS;
      const previousEpisode = Math.max(nextEpisodeNumber - 1, 0);

      let effectivePreviousAiringAtMs = previousAiringAtMs;
      
      if (recentOccurrences.length > 0 && previousEpisode > 0) {
        const matchingOccurrence = recentOccurrences.find(o => o.ep === previousEpisode);
        if (matchingOccurrence) {
          effectivePreviousAiringAtMs = matchingOccurrence.airedAt;
        }
      }

      if (previousEpisode > 0 && effectivePreviousAiringAtMs <= nowMs && nowMs - effectivePreviousAiringAtMs < DAY_MS) {
        return {
          anime,
          nextEp: previousEpisode,
          airingAt: effectivePreviousAiringAtMs,
          status: "aired_recently",
        };
      }

      if (airingAtMs > nowMs) {
        return {
          anime,
          nextEp: nextEpisodeNumber,
          airingAt: airingAtMs,
          status: "upcoming",
        };
      }

      if (nowMs - airingAtMs < DAY_MS) {
        return {
          anime,
          nextEp: nextEpisodeNumber,
          airingAt: airingAtMs,
          status: "aired_recently",
        };
      }

      if (isFinishedStatus(normalizedStatus) || (totalEpisodeCount > 0 && nextEpisodeNumber > totalEpisodeCount)) {
        return latestRecent
          ? {
              anime,
              nextEp: latestRecent.ep,
              airingAt: latestRecent.airedAt,
              status: "finished",
            }
          : null;
      }

      if (!isAiringLikeStatus(normalizedStatus) && !latestRecent) {
        return null;
      }

      return {
        anime,
        nextEp: nextEpisodeNumber + 1,
        airingAt: airingAtMs + WEEK_MS,
        status: "upcoming",
      };
    },
    [nowMs, recentOccurrencesMap],
  );

  const groupedByDay = useMemo(() => {
    const groups = {};

    filteredAiringAnime.forEach((anime) => {
      const recentOccurrences = recentOccurrencesMap.get(getAnimeKey(anime)) || [];
      recentOccurrences.forEach(({ ep: episode, airedAt, isEstimated }) => {
        const date = new Date(airedAt);
        const dayKey = getLocalDayKey(date);
        if (!groups[dayKey]) groups[dayKey] = { date, episodes: [] };

        const localFile = anime.localFiles.find((file) => {
          const number =
            file.episodeNumber ??
            extractEpisodeNumber(file.name, [
              anime.title,
              anime.title_english,
              ...(anime.storedData?.synonyms || []),
              anime.storedData?.folderName,
            ]);
          return number !== null && number === episode;
        });

        groups[dayKey].episodes.push({
          anime,
          ep: episode,
          isWatched: anime.watchedEps.includes(episode),
          localFile: localFile || null,
          airedAt,
          isEstimated,
        });
      });
    });

    return Object.entries(groups)
      .sort(([first], [second]) => second.localeCompare(first))
      .map(([key, value]) => ({
        key,
        date: value.date,
        episodes: value.episodes.sort((first, second) => {
          if (second.airedAt !== first.airedAt) return second.airedAt - first.airedAt;
          return second.ep - first.ep;
        }),
      }));
  }, [filteredAiringAnime, recentOccurrencesMap]);

  const [torrentMatchesMap, setTorrentMatchesMap] = useState({});

  useEffect(() => {
    if (!torrentData || torrentData.length === 0 || groupedByDay.length === 0) {
      setTorrentMatchesMap({});
      return;
    }

    const timerId = setTimeout(() => {
      const batchEpisodes = [];
      groupedByDay.forEach(({ episodes: dayEps }) => {
        dayEps.forEach(({ anime, ep }) => {
          const stored = torrentRelevantMyAnimeMap[anime.malId] || torrentRelevantMyAnimeMap[anime.mal_id];
          const assignedFansub = getEffectiveTorrentSourceFansub(stored, principalFansub);
          batchEpisodes.push({
            anime,
            ep,
            stored,
            torrentItems: getItemsForFansub(assignedFansub),
            key: `${anime.malId || anime.mal_id}-${ep}`,
            assignedFansub,
          });
        });
      });

      const matchesMap = getBatchEpisodeTorrentAvailability(batchEpisodes, torrentData, principalFansub);
      setTorrentMatchesMap(matchesMap);
    }, 10);

    return () => clearTimeout(timerId);
  }, [groupedByDay, torrentData, torrentRelevantMyAnimeMap, principalFansub, getItemsForFansub]);

  const scheduleByDay = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => []);

    myAiringAnime.forEach((anime) => {
      const entry = getScheduleEntry(anime);
      if (!entry) return;
      const nextDate = new Date(entry.airingAt);
      const dayOfWeek = nextDate.getDay();
      groups[dayOfWeek].push(entry);
    });

    return groups;
  }, [myAiringAnime, getScheduleEntry]);

  const shouldShowApiUnavailableState = hasTrackedAnime && !!errorExtra && !loadingExtra;

  const handleRetryAll = useCallback(async () => {
    await retryFetch();
    await retryExtra?.();
  }, [retryFetch, retryExtra]);

  const handlePlayEpisode = useCallback(
    (animeId, epNumber, filePath, candidateFiles) => {
      playEpisode({
        animeId,
        episodeNumber: epNumber,
        filePath,
        candidateFiles,
      });
    },
    [playEpisode],
  );

  const formatTimeUntil = (airingAt) => {
    const seconds = Math.floor((airingAt - nowMs) / 1000);
    if (seconds <= 0) return "YA EMITIDO";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `EN ${days}d ${hours}h`;
    if (hours > 0) return `EN ${hours}h ${minutes}m`;
    return `EN ${minutes}m`;
  };

  if (error) {
    return (
      <div className={styles.page}>
        <RetryPanel message={error} onRetry={retryFetch} />
      </div>
    );
  }

  if ((loading || loadingExtra) && allAiringAnime.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState} aria-busy="true">
          <div className={styles.loadingSpinner} />
          <p>{loading ? "Sincronizando con AniList..." : "Cargando series adicionales..."}</p>
        </div>
      </div>
    );
  }

  if (errorExtra) {
    return (
      <div className={styles.page}>
        <RetryPanel message={errorExtra} onRetry={retryExtra} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.pageTitle}>{activeTab === "recientes" ? "RECIENTES" : "HORARIO"}</h1>
          <p className={styles.pageSubtitle}>
            {activeTab === "recientes"
              ? "Ultimos episodios recientes de tus series"
              : "Proximos episodios estimados de esta semana"}
          </p>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "recientes" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("recientes")}
          >
            RECIENTES
          </button>
          <button
            className={`${styles.tab} ${activeTab === "horario" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("horario")}
          >
            HORARIO
          </button>
        </div>
        {activeTab === "recientes" && availableFansubFilters.length > 1 && (
          <div>
            <select
              className={styles.fansubFilterSelect}
              value={fansubFilter}
              onChange={(event) => setFansubFilter(event.target.value)}
              aria-label="Filtrar por fansub asignado"
            >
              {availableFansubFilters.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {activeTab === "recientes" ? (
        <div className={styles.recentContent}>
          {errorExtra && allAiringAnime.length === 0 ? (
            <RetryPanel message={errorExtra} onRetry={retryExtra} />
          ) : (
            <>
              {errorExtra && (
                <div className={styles.warningBanner}>
                  Algunas series adicionales no pudieron cargarse.{" "}
                  <button onClick={retryExtra}>Reintentar</button>
                </div>
              )}
              {groupedByDay.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No hay episodios recientes de tus series en emision.</p>
                  <span>
                    {hasTrackedAnime ? "Vuelve a revisar mas tarde." : "Anade series a tu lista desde Descubrir."}
                  </span>
                </div>
              ) : (
                groupedByDay.map(({ key, date, episodes }) => (
                  <div key={key} className={styles.dayGroup}>
                    <div className={styles.dayHeader}>
                      <span className={styles.dayLabel}>{formatRelativeDate(date)}</span>
                      <span className={styles.dayDate}>
                        {date
                          .toLocaleDateString("es", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })
                          .toUpperCase()}
                      </span>
                    </div>
                    <div className={styles.episodeList}>
                      {episodes.map(({ anime, ep, isWatched, localFile, isEstimated }) => (
                        <div
                          key={`${anime.malId}-${ep}`}
                          className={`${styles.episodeRow} ${isWatched ? styles.watched : ""}`}
                          onClick={() => navigate(`/anime/${anime.malId || anime.mal_id}`)}
                          role="button"
                          tabIndex={0}
                          aria-label={`Ir a ${anime.title} - Episodio ${ep}`}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(`/anime/${anime.malId || anime.mal_id}`);
                            }
                          }}
                        >
                          <div className={styles.animePoster}>
                            <img
                              src={anime.coverImage || anime.images?.jpg?.small_image_url}
                              alt={anime.title}
                              loading="lazy"
                            />
                          </div>
                          <div className={styles.episodeInfo}>
                            <span className={styles.animeTitle}>{anime.title}</span>
                            <span className={styles.epNumber}>Episodio {ep}</span>
                          </div>
                          <div className={styles.episodeActions} onClick={(event) => event.stopPropagation()}>
                            {(() => {
                              if (localFile || isWatched) return null;
                              const keyForEpisode = `${anime.malId || anime.mal_id}-${ep}`;
                              const availability = torrentMatchesMap[keyForEpisode] || {
                                matches: [],
                                hasPrincipalMatch: false,
                                status: "missing",
                              };
                              const matches = availability.matches;
                              const hasPrincipalMatch = availability.hasPrincipalMatch;

                              if (matches.length > 0) {
                                return (
                                  <button
                                    className={`${styles.torrentBtn} ${hasPrincipalMatch ? styles.torrentBtnPrincipal : styles.torrentBtnAlt}`}
                                    title={
                                      hasPrincipalMatch
                                        ? `Descargar desde ${anime.assignedFansub || "torrent disponible"}`
                                        : "Se encontraron torrents disponibles."
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setTorrentModalItems(matches);
                                      setTorrentModalAnimeTitle(anime.title);
                                      setTorrentModalMalId(anime.malId || anime.mal_id);
                                      setTorrentModalOpen(true);
                                    }}
                                  >
                                    DISPONIBLE
                                  </button>
                                );
                              }

                              return (
                                <button
                                  className={`${styles.torrentBtn} ${styles.torrentBtnAlt}`}
                                  title="Buscar torrent manualmente en otras pestanas"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const stored = torrentRelevantMyAnimeMap[anime.malId || anime.mal_id];
                                    const query =
                                      stored?.torrentSearchTerm ||
                                      extractBaseTitle(stored?.torrentTitle || stored?.torrentAlias || anime.title);

                                    setSearchModalItem({
                                      title: query,
                                      malId: anime.malId || anime.mal_id,
                                    });
                                    setSearchModalOpen(true);
                                  }}
                                >
                                  Buscar
                                </button>
                              );
                            })()}

                            {isWatched ? (
                              <span className={styles.watchedBadge}>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                                VISTO
                              </span>
                            ) : Number(playingEp?.animeId) === Number(anime.malId || anime.mal_id) &&
                              playingEp?.epNumber === ep ? (
                              <span className={styles.playingBadge}>REPRODUCIENDO</span>
                            ) : localFile ? (
                              localFile.isDownloading ? (
                                <button
                                  className={styles.downloadingBtn}
                                  disabled
                                  title="El cliente externo esta procesando el archivo (.part / .!qB)"
                                >
                                  DESCARGANDO
                                </button>
                              ) : (
                                <button
                                  className={styles.playBtn}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handlePlayEpisode(anime.malId || anime.mal_id, ep, localFile.path, anime.localFiles);
                                  }}
                                  title="Reproducir"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                  REPRODUCIR
                                </button>
                              )
                            ) : (
                              <span className={styles.pendingBadge}>PENDIENTE</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      ) : (
        <div className={styles.scheduleContent}>
          <div className={styles.daySelector}>
            {DAY_NAMES_SHORT.map((day, index) => (
              <button
                key={index}
                className={`${styles.dayBtn} ${activeDay === index ? styles.activeDayBtn : ""}`}
                onClick={() => setActiveDay(index)}
              >
                <span className={styles.dayBtnName}>{day}</span>
                {scheduleByDay[index].length > 0 && (
                  <span className={styles.dayBtnCount}>{scheduleByDay[index].length}</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.scheduleGrid}>
            {scheduleByDay[activeDay].length === 0 ? (
              <div className={styles.emptyState}>
                <p>No hay episodios programados para {DAY_NAMES[activeDay].toLowerCase()}.</p>
              </div>
            ) : (
              scheduleByDay[activeDay].map(({ anime, nextEp, airingAt, status }) => {
                const isAired = status === "aired_recently";
                const badgeLabel =
                  status === "finished" ? "FINALIZADO" : status === "hiatus_or_unknown" ? "SIN FECHA" : null;
                return (
                  <div
                    key={anime.malId}
                    className={`${styles.scheduleCard} ${isAired ? styles.aired : ""}`}
                    onClick={() => navigate(`/anime/${anime.malId || anime.mal_id}`)}
                  >
                    <div className={styles.scheduleCardPoster}>
                      <img
                        src={anime.coverImage || anime.images?.jpg?.large_image_url}
                        alt={anime.title}
                        loading="lazy"
                      />
                      <div className={styles.scheduleCardOverlay}>
                        <span className={styles.scheduleEp}>EP {nextEp}</span>
                      </div>
                    </div>
                    <div className={styles.scheduleCardInfo}>
                      <h3 className={styles.scheduleCardTitle}>{anime.title}</h3>
                      <div className={styles.scheduleCardMeta}>
                        {isAired ? (
                          <span className={styles.airedBadge}>YA EMITIDO</span>
                        ) : badgeLabel ? (
                          <span className={styles.pendingBadge}>{badgeLabel}</span>
                        ) : (
                          <span className={styles.countdownBadge}>{formatTimeUntil(airingAt)}</span>
                        )}
                        <span className={styles.scheduleTime}>
                          {new Date(airingAt).toLocaleTimeString("es", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <TorrentDownloadModal
        isOpen={torrentModalOpen}
        onClose={() => setTorrentModalOpen(false)}
        animeTitle={torrentModalAnimeTitle}
        items={torrentModalItems}
        malId={torrentModalMalId}
      />

      <TorrentSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        animeTitle={searchModalItem?.title}
        malId={searchModalItem?.malId}
      />

      {toast && (
        <div className={styles.toast} data-type={toast.type} role="alert" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default Recent;
