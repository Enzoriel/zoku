import { useState, useMemo, useTransition } from "react";
import AnimeList from "../components/anime/AnimeList";
import styles from "./Discover.module.css";
import { useAnime } from "../context/AnimeContext";

function Discover() {
  const { seasonalAnime: allAnimes, loading, error } = useAnime();
  const [type, setType] = useState("TV");
  const [pendingType, setPendingType] = useState(null);
  const [isPending, startTransition] = useTransition();

  const filteredAnimes = useMemo(() => {
    return allAnimes.filter((anime) => anime.format === type || anime.type === type);
  }, [allAnimes, type]);

  const handleTypeChange = (newType) => {
    if (newType === type || isPending) return;
    setPendingType(newType);
    startTransition(() => {
      setType(newType);
      setPendingType(null);
    });
  };

  const visualType = pendingType ?? type;

  const types = [
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
                className={`${styles.toggleButton} ${visualType === t.id ? styles.active : ""} ${isPending && type !== t.id ? styles.loading : ""}`}
                onClick={() => handleTypeChange(t.id)}
                disabled={isPending}
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
            <p>CONECTANDO CON ANILIST...</p>
          </div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <p>{error}</p>
          </div>
        ) : (
          <div className={styles.resultsArea} style={{ opacity: isPending ? 0.7 : 1 }}>
            <div className={styles.resultsHeader}>
              <div className={styles.resultsCount}>
                [ <span className={styles.countNumber}>{filteredAnimes.length}</span> ] RESULTADOS ENCONTRADOS
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
