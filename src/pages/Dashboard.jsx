import { useStore } from "../hooks/useStore";
import { getContinueWatching, getNewEpisodes, getRecentlyAdded } from "../utils/dashboard";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import Carousel from "../components/anime/Carousel";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import styles from "./Dashboard.module.css";
import { useAnime } from "../context/AnimeContext";
import { useLibrary } from "../context/LibraryContext";
import { usePlayback } from "../hooks/usePlayback";

function Dashboard() {
  const { data } = useStore();
  const { seasonalAnime, loading, error } = useAnime();
  const { localFilesIndex } = useLibrary();
  const playback = usePlayback();

  const isEmpty = Object.keys(data.myAnimes).length === 0;

  const continueWatching = useMemo(
    () => getContinueWatching(data.myAnimes, data.localFiles, localFilesIndex),
    [data.myAnimes, data.localFiles, localFilesIndex],
  );

  const continueWatchingIds = useMemo(
    () =>
      new Set(
        continueWatching.map((anime) => String(anime.malId || anime.mal_id || anime.id || anime.anilistId || "")),
      ),
    [continueWatching],
  );

  const newEpisodes = useMemo(
    () => getNewEpisodes(data.myAnimes, data.localFiles, localFilesIndex, continueWatchingIds),
    [data.myAnimes, data.localFiles, localFilesIndex, continueWatchingIds],
  );
  const recentlyAdded = useMemo(() => getRecentlyAdded(data.myAnimes), [data.myAnimes]);

  if (loading && isEmpty) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loadingState}>
          <LoadingSpinner size={60} />
          <p>Cargando tu biblioteca...</p>
        </div>
      </div>
    );
  }

  if (error && isEmpty) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.errorState}>
          <p>No se pudo cargar la biblioteca.</p>
        </div>
      </div>
    );
  }

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
            <h1>Bienvenido a Zoku</h1>
            <div className={styles.welcomeHeader}>
              <p>Agrega una carpeta para empezar o explora para añadir animes a tu biblioteca</p>
            </div>
            <div className={styles.welcomeButtons}>
              <Link to="/library">
                <Button>Añadir carpeta</Button>
              </Link>
              <Link to="/discover">
                <Button>Explorar animes</Button>
              </Link>
            </div>
          </div>
          <Carousel title="Animes en emisión" animes={seasonalAnime} loading={loading} playback={playback} />
        </section>
      ) : (
        <>
          <Carousel title="Continuar viendo" animes={continueWatching} playback={playback} />
          <Carousel title="Nuevos episodios disponibles" animes={newEpisodes} playback={playback} />
          <Carousel title="Añadidos recientemente" animes={recentlyAdded} playback={playback} />
        </>
      )}
    </div>
  );
}

export default Dashboard;
