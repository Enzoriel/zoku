import { useState, useEffect } from "react";
import { useStore } from "../hooks/useStore";
import { getSeasonNow, getRecentAnimeRecommendations, getAnimeDetails } from "../services/api";
import { getContinueWatching, getNewEpisodes, getRecentlyAdded } from "../utils/dashboard";
import { Link } from "react-router-dom";
import Carousel from "../components/anime/Carousel";
import Button from "../components/ui/Button";
import styles from "./Dashboard.module.css";

function Dashboard() {
  const { data, setMyAnimes } = useStore();
  const [airingAnimes, setAiringAnimes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [airing, recs] = await Promise.all([getSeasonNow(), getRecentAnimeRecommendations()]);
        setAiringAnimes(airing);
        setRecommendations(recs);
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRefreshAiring = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    try {
      const airingInLibrary = Object.values(data.myAnimes).filter(
        (a) => a.status === "Airing" || a.status === "Currently Airing"
      );

      if (airingInLibrary.length === 0) {
        setIsRefreshing(false);
        return;
      }

      const updatedAnimes = { ...data.myAnimes };
      let hasChanges = false;

      for (const anime of airingInLibrary) {
        const details = await getAnimeDetails(anime.malId);
        if (details && details.episodes !== anime.totalEpisodes) {
          updatedAnimes[anime.malId] = {
            ...anime,
            totalEpisodes: details.episodes,
            status: details.status
          };
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await setMyAnimes(updatedAnimes);
      }
    } catch (error) {
      console.error("Error refreshing airing animes:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isEmpty = Object.keys(data.myAnimes).length === 0;

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashHeader}>
        <div className={styles.dashTitle}>
          <h1>Dashboard</h1>
          <p>Gestiona tu progreso y descubre nuevas series</p>
        </div>
        {!isEmpty && (
          <button 
            className={`${styles.refreshButton} ${isRefreshing ? styles.spinning : ""}`}
            onClick={handleRefreshAiring}
            title="Actualizar animes en emisión"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
            </svg>
            {isRefreshing ? "ACTUALIZANDO..." : "ACTUALIZAR EMISIÓN"}
          </button>
        )}
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
          <Carousel title="Animes en emisión" animes={airingAnimes.data || []} loading={loading} />
          <Carousel title="Recomendaciones" animes={recommendations || []} loading={loading} />
        </section>
      ) : (
        <>
          <Carousel title="Continuar viendo" animes={getContinueWatching(data.myAnimes)} />
          <Carousel title="Nuevos episodios disponibles" animes={getNewEpisodes(data.myAnimes, data.localFiles)} />
          <Carousel title="En emisión esta temporada" animes={airingAnimes.data || []} loading={loading} />
          <Carousel title="Recomendaciones" animes={recommendations} loading={loading} />
          <Carousel title="Añadidos recientemente" animes={getRecentlyAdded(data.myAnimes)} />
        </>
      )}
    </div>
  );
}

export default Dashboard;
