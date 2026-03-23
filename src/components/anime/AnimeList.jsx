import AnimeCardExt from "./AnimeCardExt";
import styles from "./AnimeList.module.css";
import { useStore } from "../../hooks/useStore";

function AnimeList({ animes = [], type = false }) {
  const { data, setMyAnimes } = useStore();

  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  return (
    <div className={styles.list}>
      {animes.map((anime) => {
        const malId = anime.mal_id || anime.malId;
        return (
          <AnimeCardExt 
            key={malId} 
            anime={{ ...anime, malId }} 
            isInLibrary={!!data?.myAnimes?.[malId]}
            setMyAnimes={setMyAnimes}
          />
        );
      })}
    </div>
  );
}

export default AnimeList;
