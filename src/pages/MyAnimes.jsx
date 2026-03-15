import { useStore } from "../hooks/useStore";
import CardLibrary from "../components/anime/CardLibrary";
import styles from "./MyAnimes.module.css";

function MyAnimes() {
  const { data } = useStore();
  const animes = Object.values(data.myAnimes);

  return (
    <div className={styles.library}>
      <h1 className={styles.title}>Mis Animes</h1>
      <p className={styles.count}>{animes.length} animes en tu lista</p>

      {animes.length === 0 ? (
        <div className={styles.empty}>
          <p>No tienes animes en tu lista todavía.</p>
          <p>¡Ve a Descubrir para añadir algunos!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {animes.map((anime) => (
            <CardLibrary key={anime.malId} anime={anime} showProgress={true} />
          ))}
        </div>
      )}
    </div>
  );
}

export default MyAnimes;
