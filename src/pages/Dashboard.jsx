import { useStore } from "../hooks/useStore";
import { getContinueWatching, getNewEpisodes, getRecentlyAdded } from "../utils/dashboard";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import Carousel from "../components/anime/Carousel";
import Button from "../components/ui/Button";
import styles from "./Dashboard.module.css";
import { useAnime } from "../context/AnimeContext";

function Dashboard() {
  const { data } = useStore();
  const { seasonalAnime, loading } = useAnime();

  const isEmpty = Object.keys(data.myAnimes).length === 0;

  const continueWatching = useMemo(
    () => getContinueWatching(data.myAnimes, data.localFiles),
    [data.myAnimes, data.localFiles],
  );
  const newEpisodes = useMemo(() => getNewEpisodes(data.myAnimes, data.localFiles), [data.myAnimes, data.localFiles]);
  const recentlyAdded = useMemo(() => getRecentlyAdded(data.myAnimes), [data.myAnimes]);

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashHeader}>
        <div className={styles.dashTitle}>
          <h1>Dashboard</h1>
          <p>Gestiona tu progreso y descubre nuevas series</p>
        </div>
      </header>

      {isEmpty ? (
        <section className={styles.welcome}>
          <div className={styles.welcomeContainer}>
            {loading ? "" : <h1>Bienvenido a Zoku</h1>}
            <div className={styles.welcomeHeader}>
              {loading ? "" : <p>Agrega una carpeta para empezar o explora para añadir animes a tu biblioteca</p>}
            </div>
            {loading ? (
              ""
            ) : (
              <div className={styles.welcomeButtons}>
                <Link to="/library">
                  <Button>Añadir carpeta</Button>
                </Link>
                <Link to="/discover">
                  <Button>Explorar animes</Button>
                </Link>
              </div>
            )}
          </div>
          <Carousel title="Animes en emisión" animes={seasonalAnime} loading={loading} />
        </section>
      ) : (
        <>
          <Carousel title="Continuar viendo" animes={continueWatching} />
          <Carousel title="Nuevos episodios disponibles" animes={newEpisodes} />
          <Carousel title="Añadidos recientemente" animes={recentlyAdded} />
        </>
      )}
    </div>
  );
}

export default Dashboard;
