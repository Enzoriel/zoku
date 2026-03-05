import { useNavigate } from "react-router-dom";
import styles from "./AnimeCard.module.css";

function AnimeCard({ anime, showProgress = false }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/anime/${anime.malId}`);
  };

  const image = anime.images?.jpg?.large_image_url || anime.coverImage || "";

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.imageWrapper}>
        <img src={image} alt={anime.title} className={styles.image} loading="lazy" />
        {showProgress && anime.totalEpisodes && (
          <div className={styles.progress}>
            {anime.watchedEpisodes?.length || 0} / {anime.totalEpisodes}
          </div>
        )}
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{anime.title_english || anime.title}</h3>
        {anime.episodes && <span className={styles.episodes}> {anime.episodes} episodios</span>}
      </div>
    </div>
  );
}

export default AnimeCard;
