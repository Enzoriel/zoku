import { useNavigate } from "react-router-dom";
import { useStore } from "../../hooks/useStore";
import styles from "./AnimeCard.module.css";
import LoadingSpinner from "../ui/LoadingSpinner";

function AnimeCard({ anime, showAddButton = false, onAdd, type = false }) {
  const navigate = useNavigate();
  const { data, setMyAnimes } = useStore();

  if (!anime) {
    return (
      <div className={`${styles.card} pulse`}>
        <div
          className={styles.imageWrapper}
          style={{
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "250px",
          }}
        >
          <LoadingSpinner size={40} />
        </div>
        <div className={styles.info}>
          <div></div>
        </div>
      </div>
    );
  }

  const handleClick = () => {
    navigate(`/anime/${anime.malId || anime.mal_id}`);
  };

  const handleAddToLibrary = async (e) => {
    e.stopPropagation();

    // Obtener datos completos de la API
    const animeId = anime.malId || anime.mal_id;
    const fullAnime = await getAnimeById(animeId);

    const animeData = {
      malId: animeId,
      title: anime.title || anime.title_english,
      coverImage: anime.images?.jpg?.large_image_url,
      totalEpisodes: fullAnime.episodes,
      episodeDuration: parseDuration(fullAnime.duration),
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
  };

  const parseDuration = (duration) => {
    if (!duration) return 24;
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1]) : 24;
  };

  const image = anime.images?.jpg?.large_image_url || anime.coverImage || "";

  const isInLibrary = data.myAnimes[anime.malId || anime.mal_id];

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.imageWrapper}>
        {type && <span className={styles.type}>{anime.type}</span>}
        <img src={image} alt={anime.title} className={styles.image} />
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{anime.title || anime.title_english}</h3>
        {anime.genres && (
          <div className={styles.genres}>
            {anime.genres?.map((genre) => (
              <span key={genre.name} className={styles.genre}>
                {genre.name}
              </span>
            ))}
          </div>
        )}
        {showAddButton && !isInLibrary && (
          <button className={styles.addButton} onClick={handleAddToLibrary}>
            + Añadir
          </button>
        )}
        {isInLibrary && <span className={styles.added}>✓ En biblioteca</span>}
      </div>
    </div>
  );
}

export default AnimeCard;
