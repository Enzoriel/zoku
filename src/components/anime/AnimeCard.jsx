import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback, memo } from "react";
import { openFile, isPlayerStillOpen } from "../../services/fileSystem";
import { calculateUserStatus } from "../../utils/animeStatus";
import styles from "./AnimeCard.module.css";
import LoadingSpinner from "../ui/LoadingSpinner";

const WATCH_TIMER_MS = 60 * 1000;

function AnimeCard({ anime, showAddButton = false, onAdd, type = false, inLibraryData, setMyAnimes, playerSetting }) {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const watchIntervalRef = useRef(null);
  const watchStartTimeRef = useRef(null);

  if (!anime) {
    return (
      <div className={`${styles.card} pulse`}>
        <div className={styles.imageWrapper}>
          <LoadingSpinner size={40} />
        </div>
        <div className={styles.info}>
          <div className={styles.loadingPulse}></div>
        </div>
      </div>
    );
  }

  const animeId = anime.malId || anime.mal_id;
  const isInLibrary = !!inLibraryData;
  const displayAnime = isInLibrary ? { ...anime, ...inLibraryData } : anime;

  const handleClick = () => {
    navigate(`/anime/${animeId}`);
  };

  const markEpisodeAsWatched = useCallback(
    async (id, epNum) => {
      await setMyAnimes((prev) => {
        const current = prev[id];
        if (!current) return prev;

        const watchedEps = Array.isArray(current.watchedEpisodes) ? [...current.watchedEpisodes] : [];
        if (!watchedEps.includes(epNum)) {
          watchedEps.push(epNum);
        }

        const newHistory = Array.isArray(current.watchHistory) ? [...current.watchHistory] : [];
        newHistory.push({ episode: epNum, watchedAt: new Date().toISOString() });

        return {
          ...prev,
          [id]: {
            ...current,
            watchedEpisodes: watchedEps,
            lastEpisodeWatched: Math.max(...watchedEps),
            watchHistory: newHistory,
            lastUpdated: new Date().toISOString(),
          },
        };
      });
    },
    [setMyAnimes],
  );

  const handleQuickPlay = async (e) => {
    e.stopPropagation();
    if (!displayAnime.nextEpisodeFile) return;

    const ok = await openFile(displayAnime.nextEpisodeFile.path);
    if (!ok) return;

    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }

    setIsPlaying(true);
    watchStartTimeRef.current = Date.now();

    watchIntervalRef.current = setInterval(async () => {
      const player = playerSetting || "mpv";
      const stillOpen = await isPlayerStillOpen(player);

      if (!stillOpen) {
        clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = null;
        setIsPlaying(false);
        return;
      }

      const elapsed = Date.now() - watchStartTimeRef.current;
      if (elapsed >= WATCH_TIMER_MS) {
        markEpisodeAsWatched(animeId, displayAnime.nextEpisode);
        clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = null;
        setIsPlaying(false);
      }
    }, 5000);
  };

  const handleCancelPlay = (e) => {
    e.stopPropagation();
    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);

  const handleAddToLibrary = async (e) => {
    e.stopPropagation();

    const animeData = {
      malId: animeId,
      title: anime.title || anime.title_english || "Unknown Title",
      coverImage: anime.images?.jpg?.large_image_url || anime.coverImage,
      totalEpisodes: anime.episodes || anime.totalEpisodes || 0,
      episodeList: anime.episodeList || [],
      watchedEpisodes: [],
      lastEpisodeWatched: 0,
      userStatus: "PLAN_TO_WATCH",
      notes: "",
      watchHistory: [],
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    await setMyAnimes((prev) => ({ ...prev, [animeId]: animeData }));
    if (onAdd) onAdd(animeData);
  };

  const image = displayAnime.images?.jpg?.large_image_url || displayAnime.coverImage || "";
  const title = displayAnime.title || displayAnime.title_english || "Unknown Title";

  const total = displayAnime.totalEpisodes || displayAnime.episodes || 0;
  const watchedList = Array.isArray(displayAnime.watchedEpisodes) ? displayAnime.watchedEpisodes : [];
  const validWatchedCount = watchedList.filter((ep) => total === 0 || ep <= total).length;
  const progress = total > 0 ? Math.round((validWatchedCount / total) * 100) : 0;

  const nextEp = displayAnime.nextEpisode;

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.imageWrapper}>
        <div className={styles.overlay} />

        {/* Badges superiores dinámicos */}
        <div className={styles.topBadges}>
          {type && displayAnime.type && <span className={styles.typeBadge}>{displayAnime.type}</span>}
          {isInLibrary && (
            <span className={styles.statusBadge} data-status={calculateUserStatus(displayAnime)}>
              {calculateUserStatus(displayAnime) === "PLAN_TO_WATCH"
                ? "PENDIENTE"
                : calculateUserStatus(displayAnime) === "WATCHING"
                  ? "VIENDO"
                  : calculateUserStatus(displayAnime) === "COMPLETED"
                    ? "COMPLETADO"
                    : calculateUserStatus(displayAnime) === "PAUSED"
                      ? "PAUSADO"
                      : calculateUserStatus(displayAnime) === "DROPPED"
                        ? "ABANDONADO"
                        : "EN LISTA"}
            </span>
          )}
        </div>

        {!isInLibrary && displayAnime.score > 0 && (
          <div className={styles.ratingBadge}>⭐ {displayAnime.score.toFixed(1)}</div>
        )}

        {nextEp && !isPlaying && <span className={styles.nextBadge}>Siguiente: EP. {nextEp}</span>}

        {isPlaying && (
          <span className={styles.playingBadge} onClick={handleCancelPlay}>
            VIENDO... <span className={styles.cancelX}>✕</span>
          </span>
        )}

        <img src={image} alt={title} className={styles.image} loading="lazy" />

        {displayAnime.nextEpisodeFile && !isPlaying && (
          <button className={styles.quickPlayButton} onClick={handleQuickPlay}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}

        {/* Barra de progreso sutil */}
        {progress > 0 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* Contenedor Inferior de Información */}
        <div className={styles.titleContainer}>
          <div className={styles.hoverMeta}>
            {isInLibrary && (
              <span className={styles.epCount}>
                {validWatchedCount}/{total || "?"} EPISODIOS
              </span>
            )}
            {showAddButton && !isInLibrary && (
              <button className={styles.addButton} onClick={handleAddToLibrary}>
                + AÑADIR A LA BÓVEDA
              </button>
            )}
          </div>

          <h3 className={styles.title} title={title}>
            {title}
          </h3>

          {displayAnime.genres && (
            <div className={styles.genres}>
              {displayAnime.genres?.slice(0, 2).map((genre) => (
                <span key={genre.name || genre} className={styles.genreTag}>
                  {genre.name || genre}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(AnimeCard);
