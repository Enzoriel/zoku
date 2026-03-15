import { useNavigate } from "react-router-dom";
import { useStore } from "../../hooks/useStore";
import styles from "./AnimeCardExt.module.css";
import LoadingSpinner from "../ui/LoadingSpinner";

function AnimeCardExt({ anime, onAdd, onRemove }) {
  const navigate = useNavigate();
  const { data, setMyAnimes } = useStore();

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

  const handleClick = () => {
    navigate(`/anime/${anime.malId || anime.mal_id}`);
  };

  const handleToggleLibrary = async (e) => {
    e.stopPropagation();

    const animeId = anime.malId || anime.mal_id;
    const isCurrentlyInLibrary = data?.myAnimes && data.myAnimes[animeId];

    if (isCurrentlyInLibrary) {
      // Eliminar
      await setMyAnimes((prev) => {
        const newState = { ...prev };
        delete newState[animeId];
        return newState;
      });
      if (onRemove) onRemove(animeId);
    } else {
      // Añadir
      const animeData = {
        malId: animeId,
        title: anime.title,
        coverImage: anime.images?.jpg?.large_image_url || anime.coverImage,
        totalEpisodes: anime.episodes || 24,
        episodeDuration: 24,
        watchedEpisodes: [],
        lastEpisodeWatched: 0,
        watchHistory: [],
        addedAt: new Date().toISOString(),
      };

      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: animeData,
      }));
      if (onAdd) onAdd(animeData);
    }
  };

  const image = anime.images?.jpg?.large_image_url || anime.coverImage || "";
  const title = anime.title || anime.title_english || "Unknown Title";
  const studioName = anime.studios && anime.studios.length > 0 ? anime.studios[0].name : "UNKNOWN STUDIO";
  const score = anime.score ? anime.score.toFixed(2) : "N/A";
  const demographic = anime.demographics && anime.demographics.length > 0 ? anime.demographics[0].name : "UNKNOWN";
  const source = anime.source || "UNKNOWN";
  const type = anime.type || "UNKNOWN";
  const rawMembers = anime.members || 0;

  // Format members (e.g. 1500000 -> 1.5M, 850000 -> 850K)
  let formattedMembers = rawMembers.toString();
  if (rawMembers >= 1000000) {
    formattedMembers = (rawMembers / 1000000).toFixed(1) + "M";
  } else if (rawMembers >= 1000) {
    formattedMembers = (rawMembers / 1000).toFixed(0) + "K";
  }

  const isInLibrary = data?.myAnimes && data.myAnimes[anime.malId || anime.mal_id];

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.imageSection}>
        <div className={styles.imageWrapper}>
          <img src={image} alt={title} className={styles.image} />
          {anime.rank && <div className={styles.rankBadge}>#{anime.rank < 10 ? `0${anime.rank}` : anime.rank}</div>}
        </div>
      </div>

      <div className={styles.infoSection}>
        <header className={styles.header}>
          <span className={styles.studio}>{studioName}</span>
          <span className={styles.score}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            {score}
          </span>
        </header>

        <h3 className={styles.title} title={title}>
          {title}
        </h3>

        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>DEMOGRAPHIC</span>
            <span className={styles.detailValue}>{demographic}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>SOURCE</span>
            <span className={styles.detailValue}>{source}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>MEMBERS</span>
            <span className={styles.detailValue}>{formattedMembers}</span>
          </div>
        </div>

        {anime.synopsis && <p className={styles.synopsis}>{anime.synopsis}</p>}

        <footer className={styles.footer}>
          <span className={styles.typeTag}>{type}</span>
          <div className={styles.decorativeBar}></div>
          <button
            className={`${styles.addButton} ${isInLibrary ? styles.inLibrary : ""}`}
            onClick={handleToggleLibrary}
            title={isInLibrary ? "Eliminar de la biblioteca" : "Añadir a la biblioteca"}
          >
            {isInLibrary ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            ) : (
              "+"
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default AnimeCardExt;
