import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useAnime } from "../context/AnimeContext";
import { useRecentAnimeContext } from "../context/RecentAnimeContext";
import { extractBaseTitle } from "../utils/titleIdentity";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import { formatRelativeDate, getLocalDayKey } from "../utils/dateFormat";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import TorrentSearchModal from "../components/ui/TorrentSearchModal";
import RetryPanel from "../components/ui/RetryPanel";
import { usePlayTracking } from "../hooks/usePlayTracking";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { getEpisodeTorrentAvailability } from "../utils/torrentAvailability";
import { buildRecentEpisodeOccurrences } from "../utils/recentEpisodes";
import styles from "./Recent.module.css";
import { DAY_NAMES, DAY_NAMES_SHORT } from "../utils/constants";

function Recent() {
  const { data } = useStore();
  const { loading, error, retryFetch } = useAnime();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("recientes");
  const [activeDay, setActiveDay] = useState(new Date().getDay());

  const { allAiringAnime, loadingExtra, errorExtra, retryExtra } = useRecentAnimeContext();
  const { data: torrentData, principalFansub } = useTorrent();

  const [torrentModalOpen, setTorrentModalOpen] = useState(false);
  const [torrentModalItems, setTorrentModalItems] = useState([]);
  const [torrentModalAnimeTitle, setTorrentModalAnimeTitle] = useState("");
  const [torrentModalMalId, setTorrentModalMalId] = useState(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalItem, setSearchModalItem] = useState(null);

  const { toast, showToast } = useToast();
  const { playingEp, handlePlayEpisode: trackPlay } = usePlayTracking((message, type) => showToast(message, type));

  const myAnimeMap = useMemo(() => {
    const map = {};
    Object.entries(data.myAnimes || {}).forEach(([id, anime]) => {
      map[id] = anime;
      map[Number(id)] = anime;
    });
    return map;
  }, [data.myAnimes]);

  // Memoize only torrent-relevant fields to avoid unnecessary recalculations
  // Fields like downloadIntentAt, lastUpdated change frequently but don't affect torrent matching
  const torrentRelevantMyAnimeMap = useMemo(() => {
    const map = {};
    Object.entries(data.myAnimes || {}).forEach(([id, anime]) => {
      map[id] = {
        torrentAlias: anime.torrentAlias,
        torrentSearchTerm: anime.torrentSearchTerm,
        torrentTitle: anime.torrentTitle,
        synonyms: anime.synonyms,
        watchedEpisodes: anime.watchedEpisodes,
        folderName: anime.folderName,
      };
      map[Number(id)] = map[id];
    });
    return map;
  }, [data.myAnimes]);

  // Create a stable key for torrentRelevantMyAnimeMap to prevent unnecessary recalculations
  const torrentRelevantKey = useMemo(() => {
    return Object.entries(data.myAnimes || {})
      .map(([id, anime]) =>
        `${id}:${anime.torrentAlias || ''}:${anime.torrentSearchTerm || ''}:${anime.torrentTitle || ''}:${JSON.stringify(anime.synonyms || [])}:${JSON.stringify(anime.watchedEpisodes || [])}:${anime.folderName || ''}`
      )
      .join('|');
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
        const localFolder = Object.values(data.localFiles || {}).find((folder) => {
          if (stored?.folderName && folder.folderName === stored.folderName) return true;
          const id = String(animeId);
          if (folder.resolvedMalId && String(folder.resolvedMalId) === id) return true;
          return false;
        });
        const localFiles = localFolder?.files || [];

        return {
          ...anime,
          storedData: stored,
          watchedEps,
          localFiles,
        };
      });
  }, [allAiringAnime, myAnimeMap, data.localFiles]);

  const groupedByDay = useMemo(() => {
    const groups = {};

    myAiringAnime.forEach((anime) => {
      buildRecentEpisodeOccurrences(anime).forEach(({ ep: episode, airedAt, isEstimated }) => {
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
  }, [myAiringAnime]);

  const [torrentMatchesMap, setTorrentMatchesMap] = useState({});
  const [showTorrentSpinner, setShowTorrentSpinner] = useState(false);

  useEffect(() => {
    if (!torrentData || torrentData.length === 0 || groupedByDay.length === 0) {
      setTorrentMatchesMap({});
      setShowTorrentSpinner(false);
      return;
    }

    setShowTorrentSpinner(false);

    // Delay showing spinner to avoid flash for fast calculations
    const spinnerTimer = setTimeout(() => {
      setShowTorrentSpinner(true);
    }, 150);

    // Usar setTimeout para ceder el control al hilo principal y que cambie la pagina rápido.
    // Especialmente importante para calculos pesados de Jaro-Winkler cuando hay muchos torrents.
    const timerId = setTimeout(() => {
      const matchesMap = {};
      groupedByDay.forEach(({ episodes }) => {
        episodes.forEach(({ anime, ep }) => {
          const stored = torrentRelevantMyAnimeMap[anime.malId] || torrentRelevantMyAnimeMap[anime.mal_id];
          const key = `${anime.malId || anime.mal_id}-${ep}`;
          matchesMap[key] = getEpisodeTorrentAvailability(
            anime.title,
            anime.title_english || null,
            ep,
            torrentData,
            principalFansub,
            stored?.torrentAlias,
            stored?.torrentSearchTerm,
            stored?.torrentTitle,
            stored?.synonyms || [],
          );
        });
      });
      setTorrentMatchesMap(matchesMap);
      setShowTorrentSpinner(false);
      clearTimeout(spinnerTimer);
    }, 10);

    return () => {
      clearTimeout(timerId);
      clearTimeout(spinnerTimer);
    };
  }, [groupedByDay, torrentData, torrentRelevantKey, principalFansub]);

  const scheduleByDay = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => []);

    myAiringAnime.forEach((anime) => {
      if (!anime.nextAiringEpisode) return;
      const nextDate = new Date(anime.nextAiringEpisode.airingAt * 1000);
      const dayOfWeek = nextDate.getDay();
      groups[dayOfWeek].push({
        anime,
        nextEp: anime.nextAiringEpisode.episode,
        airingAt: anime.nextAiringEpisode.airingAt * 1000,
        timeUntil: anime.nextAiringEpisode.timeUntilAiring,
      });
    });

    return groups;
  }, [myAiringAnime]);

  const shouldShowApiUnavailableState = hasTrackedAnime && allAiringAnime.length === 0 && !loading && !loadingExtra;

  const handleRetryAll = useCallback(async () => {
    await retryFetch();
    await retryExtra?.();
  }, [retryFetch, retryExtra]);

  const handlePlayEpisode = useCallback(
    (animeId, epNumber, filePath) => {
      trackPlay(animeId, epNumber, filePath);
    },
    [trackPlay],
  );

  const formatTimeUntil = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (error) {
    return (
      <div className={styles.page}>
        <RetryPanel message={error} onRetry={retryFetch} />
      </div>
    );
  }

  if (loading || loadingExtra) {
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
      </header>

      {activeTab === "recientes" ? (
        <div className={styles.recentContent}>
          {shouldShowApiUnavailableState ? (
            <RetryPanel
              message="No se pudo cargar la programacion reciente desde AniList. Tus series siguen en tu lista, pero la API no respondio."
              onRetry={handleRetryAll}
            />
          ) : groupedByDay.length === 0 ? (
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

                          if (showTorrentSpinner) return <div className={styles.torrentSpinner}></div>;
                          if (matches.length > 0) {
                            return (
                              <button
                                className={`${styles.torrentBtn} ${hasPrincipalMatch ? styles.torrentBtnPrincipal : styles.torrentBtnAlt}`}
                                title={
                                  principalFansub && hasPrincipalMatch
                                    ? `Descargar en ${principalFansub}`
                                    : principalFansub
                                      ? `No disponible en ${principalFansub}. Hay alternativas de otros grupos.`
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
                                {principalFansub ? (hasPrincipalMatch ? "DISPONIBLE" : "ALTERNATIVA") : "DISPONIBLE"}
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
                                  ep,
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
                        ) : playingEp?.animeId === (anime.malId || anime.mal_id) && playingEp?.epNumber === ep ? (
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
                                handlePlayEpisode(anime.malId || anime.mal_id, ep, localFile.path);
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
              scheduleByDay[activeDay].map(({ anime, nextEp, airingAt, timeUntil }) => {
                const isAired = timeUntil <= 0;
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
                        ) : (
                          <span className={styles.countdownBadge}>EN {formatTimeUntil(timeUntil)}</span>
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
        epNumber={searchModalItem?.ep}
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
