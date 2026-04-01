import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useAnime } from "../context/AnimeContext";
import { useRecentAnime } from "../hooks/useRecentAnime";
import { extractBaseTitle } from "../services/fileSystem";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { findTorrentMatches } from "../utils/torrentMatch";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import { formatRelativeDate, getLocalDayKey } from "../utils/dateFormat";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import TorrentSearchModal from "../components/ui/TorrentSearchModal";
import RetryPanel from "../components/ui/RetryPanel";
import { usePlayTracking } from "../hooks/usePlayTracking";
import { getReleasedEpisodeCount } from "../utils/airingStatus";
import styles from "./Recent.module.css";

const DAY_NAMES = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const DAY_NAMES_SHORT = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

function Recent() {
  const { data } = useStore();
  const { seasonalAnime, loading, error, retryFetch } = useAnime();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("recientes");
  const [activeDay, setActiveDay] = useState(new Date().getDay());

  const { allAiringAnime, loadingExtra, errorExtra, retryExtra } = useRecentAnime(
    seasonalAnime,
    data.myAnimes,
    data.localFiles,
  );
  const { data: torrentData, isLoading: torrentLoading, principalFansub } = useTorrent();

  const [torrentModalOpen, setTorrentModalOpen] = useState(false);
  const [torrentModalItems, setTorrentModalItems] = useState([]);
  const [torrentModalTitle, setTorrentModalTitle] = useState("");
  const [torrentModalMalId, setTorrentModalMalId] = useState(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalItem, setSearchModalItem] = useState(null);

  const { toast, showToast } = useToast();
  const {
    playingEp,
    handlePlayEpisode: trackPlay,
  } = usePlayTracking((message, type) => showToast(message, type));

  const myAnimeMap = useMemo(() => {
    const map = {};
    Object.entries(data.myAnimes || {}).forEach(([id, anime]) => {
      map[id] = anime;
      map[Number(id)] = anime;
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
        const localFolder = Object.values(data.localFiles || {}).find((folder) => {
          if (stored?.folderName && folder.folderName === stored.folderName) return true;
          return folder.isLinked && String(folder.malId) === String(animeId);
        });
        const localFiles = localFolder?.files || [];
        const nextAiring = anime.nextAiringEpisode;
        const lastAiredEp = getReleasedEpisodeCount(anime);

        return {
          ...anime,
          storedData: stored,
          watchedEps,
          localFiles,
          lastAiredEp,
          nextAiring,
        };
      });
  }, [allAiringAnime, myAnimeMap, data.localFiles]);

  const groupedByDay = useMemo(() => {
    const groups = {};
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    const secondsInWeek = 7 * 24 * 60 * 60;

    myAiringAnime.forEach((anime) => {
      if (!anime.lastAiredEp) return;

      let referenceAiringAt = null;
      let referenceEpisode = null;
      let minEpisode = anime.lastAiredEp;

      if (anime.nextAiring) {
        referenceAiringAt = anime.nextAiring.airingAt;
        referenceEpisode = anime.nextAiring.episode;
        minEpisode = Math.max(1, anime.lastAiredEp - 3);
      } else if (anime.endDate?.year) {
        const endDate = new Date(anime.endDate.year, (anime.endDate.month || 1) - 1, anime.endDate.day || 1);
        referenceAiringAt = Math.floor(endDate.getTime() / 1000);
        referenceEpisode = anime.episodes;
        minEpisode = anime.lastAiredEp;
      } else {
        return;
      }

      for (let episode = anime.lastAiredEp; episode >= minEpisode; episode -= 1) {
        const airedAt = (referenceAiringAt - (referenceEpisode - episode) * secondsInWeek) * 1000;
        if (airedAt > now + 3600000 || airedAt < now - twoWeeks) continue;

        const date = new Date(airedAt);
        const dayKey = getLocalDayKey(date);
        if (!groups[dayKey]) groups[dayKey] = { date, episodes: [] };

        const localFile = anime.localFiles.find((file) => {
          const number =
            file.episodeNumber ??
            extractEpisodeNumber(file.name, [anime.title, anime.title_english, anime.storedData?.folderName]);
          return number !== null && number === episode;
        });

        groups[dayKey].episodes.push({
          anime,
          ep: episode,
          isWatched: anime.watchedEps.includes(episode),
          localFile: localFile || null,
          airedAt,
          isEstimated: !!anime.nextAiring && episode !== anime.lastAiredEp,
        });
      }
    });

    return Object.entries(groups)
      .sort(([first], [second]) => second.localeCompare(first))
      .map(([key, value]) => ({
        key,
        date: value.date,
        episodes: value.episodes.sort((first, second) => second.airedAt - first.airedAt),
      }));
  }, [myAiringAnime]);

  const torrentMatchesMap = useMemo(() => {
    if (!torrentData || torrentData.length === 0 || groupedByDay.length === 0) return {};

    const matchesMap = {};
    groupedByDay.forEach(({ episodes }) => {
      episodes.forEach(({ anime, ep }) => {
        const stored = myAnimeMap[anime.malId] || myAnimeMap[anime.mal_id];
        const key = `${anime.malId || anime.mal_id}-${ep}`;
        matchesMap[key] = findTorrentMatches(
          anime.title,
          anime.title_english || null,
          ep,
          torrentData,
          stored?.torrentAlias,
        );
      });
    });
    return matchesMap;
  }, [groupedByDay, torrentData, myAnimeMap]);

  const scheduleByDay = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => []);

    myAiringAnime.forEach((anime) => {
      if (!anime.nextAiring) return;
      const nextDate = new Date(anime.nextAiring.airingAt * 1000);
      const dayOfWeek = nextDate.getDay();
      groups[dayOfWeek].push({
        anime,
        nextEp: anime.nextAiring.episode,
        airingAt: anime.nextAiring.airingAt * 1000,
        timeUntil: anime.nextAiring.timeUntilAiring,
      });
    });

    return groups;
  }, [myAiringAnime]);

  const shouldShowApiUnavailableState =
    hasTrackedAnime && seasonalAnime.length === 0 && allAiringAnime.length === 0 && !loading && !loadingExtra;

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
              <span>{hasTrackedAnime ? "Vuelve a revisar mas tarde." : "Añade series a tu lista desde Descubrir."}</span>
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
                        <span className={styles.epNumber}>
                          Episodio {ep}
                          {isEstimated ? " · estimado" : ""}
                        </span>
                      </div>
                      <div className={styles.episodeActions} onClick={(event) => event.stopPropagation()}>
                        {(() => {
                          if (!principalFansub || localFile || isWatched) return null;
                          const keyForEpisode = `${anime.malId || anime.mal_id}-${ep}`;
                          const matches = torrentMatchesMap[keyForEpisode] || [];
                          const hasPrincipalMatch = matches.some((match) => match.fansub === principalFansub);

                          if (torrentLoading) return <div className={styles.torrentSpinner}></div>;
                          if (matches.length > 0) {
                            return (
                              <button
                                className={`${styles.torrentBtn} ${hasPrincipalMatch ? styles.torrentBtnPrincipal : styles.torrentBtnAlt}`}
                                title={
                                  hasPrincipalMatch
                                    ? `Descargar en ${principalFansub}`
                                    : `No disponible en ${principalFansub}. Hay alternativas de otros grupos.`
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTorrentModalItems(matches);
                                  setTorrentModalTitle(`${anime.title} — Episodio ${ep}`);
                                  setTorrentModalMalId(anime.malId || anime.mal_id);
                                  setTorrentModalOpen(true);
                                }}
                              >
                                {hasPrincipalMatch ? "↓ Disponible" : "↓ Alternativa"}
                              </button>
                            );
                          }

                          return (
                            <button
                              className={`${styles.torrentBtn} ${styles.torrentBtnAlt}`}
                              title="Buscar torrent manualmente en otras pestañas"
                              onClick={(event) => {
                                event.stopPropagation();
                                const stored = myAnimeMap[anime.malId || anime.mal_id];
                                const query = extractBaseTitle(stored?.torrentAlias || anime.title);

                                setSearchModalItem({
                                  title: query,
                                  ep,
                                  malId: anime.malId || anime.mal_id,
                                });
                                setSearchModalOpen(true);
                              }}
                            >
                              🔍 Buscar
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
                              ⏳ DESCARGANDO
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
                {scheduleByDay[index].length > 0 && <span className={styles.dayBtnCount}>{scheduleByDay[index].length}</span>}
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
        animeTitle={torrentModalTitle.split(" — ")[0]}
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
