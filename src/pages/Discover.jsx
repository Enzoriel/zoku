import { useState, useEffect, useCallback, useMemo } from "react";
import { getFullSeasonAnime } from "../services/api";
import AnimeList from "../components/anime/AnimeList";
import styles from "./Discover.module.css";

let cachedSeasonAnimes = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hora

function Discover() {
  const [allAnimes, setAllAnimes] = useState(cachedSeasonAnimes || []);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("ALL");

  const loadAnimes = useCallback(async () => {
    const now = Date.now();
    if (cachedSeasonAnimes && now - lastFetchTime < CACHE_DURATION) {
      setAllAnimes(cachedSeasonAnimes);
      setLoading(false);
      return;
    }

    try {
      const data = await getFullSeasonAnime();
      cachedSeasonAnimes = data;
      lastFetchTime = now;
      setAllAnimes(data);
    } catch (error) {
      console.error("Error loading seasonal animes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnimes();
  }, [loadAnimes]);

  const filteredAnimes = useMemo(() => {
    if (type === "ALL") return allAnimes;
    return allAnimes.filter((anime) => anime.format === type || anime.type === type);
  }, [allAnimes, type]);

  const handleTypeChange = (newType) => {
    setType(newType);
  };

  const types = [
    { id: "ALL", label: "TODOS" },
    { id: "TV", label: "TV" },
    { id: "MOVIE", label: "MOVIES" },
    { id: "OVA", label: "OVA" },
    { id: "ONA", label: "ONA" },
    { id: "SPECIAL", label: "SPECIALS" },
  ];

  return (
    <div className={styles.discover}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.pageTitle}>DESCUBRIR</h1>
          <p className={styles.pageSubtitle}>Explora los lanzamientos de la temporada actual</p>
        </div>

        <div className={styles.filterSection}>
          <span className={styles.filterLabel}>FILTRAR POR TIPO:</span>
          <div className={styles.toggleGroup}>
            {types.map((t) => (
              <button
                key={t.id}
                className={`${styles.toggleButton} ${type === t.id ? styles.active : ""}`}
                onClick={() => handleTypeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loaderSpinner}></div>
            <p>Sincronizando con AniList...</p>
          </div>
        ) : (
          <div className={styles.resultsArea}>
            <div className={styles.resultsHeader}>
              <div className={styles.resultsCount}>
                <span className={styles.countNumber}>{filteredAnimes.length}</span> resultados encontrados
              </div>
              <div className={styles.accentLine}></div>
            </div>

            <AnimeList animes={filteredAnimes} type={true} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Discover;
