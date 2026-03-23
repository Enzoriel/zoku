import { useStore } from "../hooks/useStore";
import { getContinueWatching, getNewEpisodes, getRecentlyAdded } from "../utils/dashboard";
import { Link } from "react-router-dom";
import Carousel from "../components/anime/Carousel";
import Button from "../components/ui/Button";
import styles from "./Dashboard.module.css";
import { useAnime } from "../context/AnimeContext";

function Dashboard() {
  const { data } = useStore();
  const { seasonalAnime, loading } = useAnime();

  const isEmpty = Object.keys(data.myAnimes).length === 0;

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
          <Carousel title="Continuar viendo" animes={getContinueWatching(data.myAnimes, data.localFiles)} />
          <Carousel title="Nuevos episodios disponibles" animes={getNewEpisodes(data.myAnimes, data.localFiles)} />
          <Carousel title="En emisión esta temporada" animes={seasonalAnime} loading={loading} />
          <Carousel title="Añadidos recientemente" animes={getRecentlyAdded(data.myAnimes)} />
        </>
      )}
    </div>
  );
}

export default Dashboard;
