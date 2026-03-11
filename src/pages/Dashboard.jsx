import { useState, useEffect } from "react";
import { useStore } from "../hooks/useStore";
import { getSeasonNow, getRecentAnimeRecommendations } from "../services/api";
import { getContinueWatching, getNewEpisodes, getRecentlyAdded } from "../utils/dashboard";
import { Link } from "react-router-dom";
import Carousel from "../components/anime/Carousel";
import Button from "../components/ui/Button";
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
        console.log(recs);
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
