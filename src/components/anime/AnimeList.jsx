import AnimeCardExt from "./AnimeCardExt";
import styles from "./AnimeList.module.css";

function AnimeList({ animes = [], type = false }) {
  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  return (
    <div className={styles.list}>
      {animes.map((anime) => (
        <AnimeCardExt key={anime.mal_id} anime={{ ...anime, malId: anime.mal_id }} />
      ))}
    </div>
  );
}

export default AnimeList;
