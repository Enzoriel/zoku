import { useNavigate } from "react-router-dom";
import { memo } from "react";
import { calculateUserStatus } from "../../utils/animeStatus";
import styles from "./AnimeCard.module.css";
import LoadingSpinner from "../ui/LoadingSpinner";

function AnimeCard({ anime, inLibraryData, playback = null }) {
  const navigate = useNavigate();

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
  const isPlaying = String(playback?.playingEp?.animeId || "") === String(animeId || "");
  const userStatus = isInLibrary ? calculateUserStatus(displayAnime) : null;

  const handleClick = () => {
    navigate(`/anime/${animeId}`);
  };

  const handleQuickPlay = async (e) => {
    e.stopPropagation();
    if (!displayAnime.nextEpisodeFile || !playback?.playEpisode) return;
    await playback.playEpisode({
      animeId,
      episodeNumber: displayAnime.nextEpisode,
      filePath: displayAnime.nextEpisodeFile.path,
    });
  };

  const handleCancelPlay = (e) => {
    e.stopPropagation();
    playback?.cancelPlayback?.();
  };

  const image = displayAnime.images?.jpg?.large_image_url || displayAnime.coverImage || "";
  const title = displayAnime.title || displayAnime.title_english || "Unknown Title";

  const total = Number.isFinite(displayAnime.progressTotalEpisodes)
    ? displayAnime.progressTotalEpisodes
    : displayAnime.totalEpisodes || displayAnime.episodes || 0;
  const watchedList = Array.isArray(displayAnime.watchedEpisodes) ? displayAnime.watchedEpisodes : [];
  const validWatchedCount = Number.isFinite(displayAnime.progressWatchedCount)
    ? displayAnime.progressWatchedCount
    : watchedList.filter((ep) => total === 0 || ep <= total).length;
  const progress = Number.isFinite(displayAnime.progress)
    ? displayAnime.progress
    : total > 0
      ? Math.round((validWatchedCount / total) * 100)
      : 0;

  const nextEp = displayAnime.nextEpisode;

  return (
    <div
      className={styles.card}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className={styles.imageWrapper}>
        <div className={styles.overlay} />

        {/* Badges superiores dinámicos */}
        <div className={styles.topBadges}>
          {isInLibrary && (
            <span className={styles.statusBadge} data-status={userStatus}>
              {userStatus === "PLAN_TO_WATCH"
                ? "PENDIENTE"
                : userStatus === "WATCHING"
                  ? "VIENDO"
                  : userStatus === "COMPLETED"
                    ? "COMPLETADO"
                    : userStatus === "PAUSED"
                      ? "PAUSADO"
                      : userStatus === "DROPPED"
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

        {image && <img src={image} alt={title} className={styles.image} loading="lazy" />}

        {displayAnime.nextEpisodeFile && !isPlaying && playback?.playEpisode && (
          <button className={styles.quickPlayButton} onClick={handleQuickPlay} aria-label={`Reproducir ${title}`}>
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
