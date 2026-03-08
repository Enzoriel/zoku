import { useState, useEffect } from "react";
import { useStore } from "../hooks/useStore";
import { getSeasonNow, getRecentAnimeRecommendations } from "../services/api";
import { getContinueWatching, getNewEpisodes, getRecentlyAdded } from "../utils/dashboard";
import Carousel from "../components/anime/Carousel";
import styles from "./Dashboard.module.css";

function Dashboard() {
  const { data } = useStore();
  const [airingAnimes, setAiringAnimes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [airing, recs] = await Promise.all([getSeasonNow(), getRecentAnimeRecommendations()]);
        setAiringAnimes(airing);
        setRecommendations(recs);
        console.log(airing);
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const isEmpty = Object.keys(data.myAnimes).length === 0;

  return (
    <div className={styles.dashboard}>
      {isEmpty ? (
        <section className={styles.welcome}>
          <div className={styles.welcomeHeader}>
            {loading ? "" : <p>Empieza a explorar para añadir animes a tu biblioteca</p>}
          </div>
          <Carousel title="Animes en emisión" animes={airingAnimes.data || []} loading={loading} />
          <Carousel title="Recomendaciones" animes={recommendations} loading={loading} />
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
