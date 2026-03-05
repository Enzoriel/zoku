import { useState, useEffect } from "react";
import { useStore } from "../hooks/useStore";
import { getSeasonNow } from "../services/api";
import Carousel from "../components/anime/Carousel";
import styles from "./Dashboard.module.css";

function Dashboard() {
  const { data } = useStore();
  const [airingAnimes, setAiringAnimes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const animes = await getSeasonNow();
      setAiringAnimes(animes);
      setLoading(false);
    }
    load();
  }, []);

  // Verificar si es estado vacío
  const isEmpty = Object.keys(data.myAnimes).length === 0;

  return (
    <div className={styles.dashboard}>
      {isEmpty ? (
        // Estado vacío: mostrar bienvenida
        <section className={styles.welcome}>
          <Carousel title="Animes en emisión" animes={airingAnimes} />
        </section>
      ) : (
        // Estado normal
        <>
          <Carousel title="Continuar viendo" animes={getContinueWatching(data.myAnimes)} />
          <Carousel title="Nuevos episodios disponibles" animes={getNewEpisodes(data.myAnimes, data.localFiles)} />
          <Carousel title="En emisión esta temporada" animes={airingAnimes} />
          <Carousel title="Añadidos recientemente" animes={getRecentlyAdded(data.myAnimes)} />
        </>
      )}
    </div>
  );
}

export default Dashboard;
