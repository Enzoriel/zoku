import { useState, useMemo } from "react";
import { useStore } from "../hooks/useStore";
import AnimeCard from "../components/anime/AnimeCard";
import { calculateUserStatus } from "../utils/animeStatus";
import styles from "./MyAnimes.module.css";

const STATUS_LABELS = {
  ALL: "Todos",
  WATCHING: "Viendo",
  COMPLETED: "Completados",
  PLAN_TO_WATCH: "Pendientes",
  PAUSED: "Pausados",
  DROPPED: "Abandonados"
};

function MyAnimes() {
  const { data, setMyAnimes } = useStore();
  const [activeTab, setActiveTab] = useState("ALL");

  const allAnimes = useMemo(() => {
    return Object.values(data.myAnimes || {}).map(anime => ({
      ...anime,
      computedStatus: calculateUserStatus(anime)
    }));
  }, [data.myAnimes]);

  const stats = useMemo(() => {
    const total = allAnimes.length;
    const completed = allAnimes.filter(a => a.computedStatus === "COMPLETED").length;
    const watching = allAnimes.filter(a => a.computedStatus === "WATCHING").length;
    const totalWatchedEps = allAnimes.reduce((acc, curr) => acc + (curr.watchedEpisodes?.length || 0), 0);
    
    return { total, completed, watching, totalWatchedEps };
  }, [allAnimes]);

  const filteredAnimes = useMemo(() => {
    if (activeTab === "ALL") return allAnimes;
    return allAnimes.filter(a => a.computedStatus === activeTab);
  }, [allAnimes, activeTab]);

  return (
    <div className={styles.library}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Bóveda Personal</h1>
          <p>ARCHIVO DE CONOCIMIENTO ANIME</p>
        </div>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Series</span>
          <span className={styles.statValue}>{stats.total}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Episodios Vistos</span>
          <span className={styles.statValue}>{stats.totalWatchedEps}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Viendo Ahora</span>
          <span className={styles.statValue}>{stats.watching}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Completados</span>
          <span className={styles.statValue}>{stats.completed}</span>
        </div>
      </div>

      <nav className={styles.tabs}>
        {Object.entries(STATUS_LABELS).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.activeTab : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {filteredAnimes.length === 0 ? (
        <div className={styles.empty}>
          <p>La bóveda está vacía en esta sección.</p>
          <p>Sincroniza nuevos datos para expandir tu archivo.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredAnimes.map((anime) => (
            <AnimeCard 
              key={anime.malId} 
              anime={anime} 
              inLibraryData={anime} 
              playerSetting={data?.settings?.player}
              setMyAnimes={setMyAnimes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default MyAnimes;
