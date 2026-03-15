import { useNavigate } from "react-router-dom";
import styles from "./CardLibrary.module.css";

function CardLibrary({ anime, showProgress = false }) {
  const navigate = useNavigate();
  const watched = anime.watchedEpisodes?.length || 0;
  const total = anime.totalEpisodes || "?";
  const progress = total !== "?" ? Math.round((watched / total) * 100) : 0;

  const handleClick = () => {
    navigate(`/anime/${anime.malId || anime.mal_id}`);
  };

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.imageWrapper}>
        <img src={anime.coverImage} alt={anime.title} className={styles.image} />
        <div className={styles.overlay}>
          {showProgress && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressPercentage}>{progress}%</span>
                <span className={styles.episodeCount}>{watched}/{total}</span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.info}>
        <h3 className={styles.title} title={anime.title}>{anime.title}</h3>
        {showProgress && (
          <p className={styles.episodes}>
            {watched > 0 ? `Visto: Ep. ${anime.lastEpisodeWatched}` : "Sin empezar"}
          </p>
        )}
      </div>
    </div>
  );
}

export default CardLibrary;
