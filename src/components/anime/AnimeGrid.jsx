import AnimeCard from "./AnimeCard";
import styles from "./AnimeGrid.module.css";

function AnimeGrid({ animes = [] }) {
  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  return (
    <div className={styles.grid}>
      {animes.map((anime) => (
        <AnimeCard key={anime.mal_id} anime={{ ...anime, malId: anime.mal_id }} />
      ))}
    </div>
  );
}

export default AnimeGrid;
