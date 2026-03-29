import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useAnime } from "../context/AnimeContext";
import { useRecentAnime } from "../hooks/useRecentAnime";
import { extractEpisodeNumber } from "../utils/fileParsing";
import RetryPanel from "../components/ui/RetryPanel";
import styles from "./Recent.module.css";

const DAY_NAMES = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const DAY_NAMES_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

function Recent() {
  const { data } = useStore();
  const { seasonalAnime, loading, error, retryFetch } = useAnime();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("recientes");
  const [activeDay, setActiveDay] = useState(new Date().getDay());

  const { allAiringAnime, loadingExtra, errorExtra, retryExtra } = useRecentAnime(seasonalAnime, data.myAnimes, data.localFiles);

  const myAnimeMap = useMemo(() => {
    const map = {};
    Object.entries(data.myAnimes || {}).forEach(([id, anime]) => {
      map[id] = anime;
      map[Number(id)] = anime;
    });
    return map;
  }, [data.myAnimes]);

  const myAiringAnime = useMemo(() => {
    return allAiringAnime
      .filter((anime) => {
        const id = anime.malId || anime.mal_id;
        return myAnimeMap[id] || myAnimeMap[Number(id)] || myAnimeMap[String(id)];
      })
      .map((anime) => {
        const id = anime.malId || anime.mal_id;
        const stored = myAnimeMap[id] || myAnimeMap[Number(id)] || myAnimeMap[String(id)];

        const watchedEps = stored?.watchedEpisodes || [];
        const folderName = stored?.folderName;
        const localFiles = folderName ? data.localFiles?.[folderName]?.files || [] : [];
        const nextAiring = anime.nextAiringEpisode;
        const lastAiredEp = nextAiring ? nextAiring.episode - 1 : anime.episodes || 0;

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
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

    myAiringAnime.forEach((anime) => {
      const SECONDS_IN_WEEK = 7 * 24 * 60 * 60;
      
      // Intentar obtener una fecha de referencia: o el próximo episodio o la fecha de finalización
      let refAiringAt = null;
      let refEpisode = null;

      if (anime.nextAiring) {
        refAiringAt = anime.nextAiring.airingAt;
        refEpisode = anime.nextAiring.episode;
      } else if (anime.status === "Finalizado" && anime.endDate?.year) {
        // Si terminó, el último episodio se emitió en la endDate (aproximadamente)
        const d = new Date(anime.endDate.year, (anime.endDate.month || 1) - 1, anime.endDate.day || 1);
        refAiringAt = Math.floor(d.getTime() / 1000);
        refEpisode = anime.episodes; // El último episodio (total) coincide directamente con la endDate
      } else {
        return; // No hay datos para fechar
      }

      for (let ep = anime.lastAiredEp; ep >= Math.max(1, anime.lastAiredEp - 2); ep--) {
        // Estimar fecha: refAiringAt - (distancia de episodios * una semana)
        const epAiredAt = (refAiringAt - (refEpisode - ep) * SECONDS_IN_WEEK) * 1000;

        if (epAiredAt > now + 3600000 || epAiredAt < now - TWO_WEEKS) continue;

        const date = new Date(epAiredAt);
        const dayKey = date.toISOString().split("T")[0];

        if (!groups[dayKey]) groups[dayKey] = { date, episodes: [] };

        const localFile = anime.localFiles.find((f) => {
          const n = f.episodeNumber ?? extractEpisodeNumber(f.name, [anime.title, anime.storedData?.folderName]);
          return n === ep;
        });

        groups[dayKey].episodes.push({
          anime,
          ep,
          isWatched: anime.watchedEps.includes(ep),
          localFile: localFile || null,
          airedAt: epAiredAt,
        });
      }
    });

    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, val]) => ({
        key,
        date: val.date,
        episodes: val.episodes.sort((a, b) => b.airedAt - a.airedAt),
      }));
  }, [myAiringAnime]);

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

  const formatRelativeDate = (date) => {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "HOY";
    if (days === 1) return "AYER";
    if (days < 7) return `HACE ${days} DÍAS`;
    return date.toLocaleDateString("es", { day: "numeric", month: "long" }).toUpperCase();
  };

  const formatTimeUntil = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
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
        <div className={styles.loadingState}>
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
              ? "Últimos episodios emitidos de tus series"
              : "Próximos episodios de esta semana"}
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
          {groupedByDay.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No hay episodios recientes de tus series en emisión.</p>
              <span>Añade series a tu lista desde Descubrir.</span>
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
                  {episodes.map(({ anime, ep, isWatched, localFile }) => (
                    <div
                      key={`${anime.malId}-${ep}`}
                      className={`${styles.episodeRow} ${isWatched ? styles.watched : ""}`}
                      onClick={() => navigate(`/anime/${anime.malId || anime.mal_id}`)}
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
                      <div className={styles.episodeActions} onClick={(e) => e.stopPropagation()}>
                        {isWatched ? (
                          <span className={styles.watchedBadge}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            VISTO
                          </span>
                        ) : localFile ? (
                          <button
                            className={styles.playBtn}
                            onClick={() => navigate(`/anime/${anime.malId || anime.mal_id}`)}
                            title="Reproducir"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            REPRODUCIR
                          </button>
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
            {DAY_NAMES_SHORT.map((day, i) => (
              <button
                key={i}
                className={`${styles.dayBtn} ${activeDay === i ? styles.activeDayBtn : ""}`}
                onClick={() => setActiveDay(i)}
              >
                <span className={styles.dayBtnName}>{day}</span>
                {scheduleByDay[i].length > 0 && <span className={styles.dayBtnCount}>{scheduleByDay[i].length}</span>}
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
    </div>
  );
}

export default Recent;
