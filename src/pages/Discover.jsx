import { useState, useMemo, useTransition, useCallback } from "react";
import AnimeList from "../components/anime/AnimeList";
import RetryPanel from "../components/ui/RetryPanel";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import SearchLocal from "../components/anime/SearchLocal";
import styles from "./Discover.module.css";
import { useAnime } from "../context/AnimeContext";

function Discover() {
  const { seasonalAnime: allAnimes, loading, error, retryFetch, discoverState, setDiscoverState } = useAnime();
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingType, setPendingType] = useState(null);
  const [isPending, startTransition] = useTransition();

  const filteredAnimes = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return allAnimes.filter((anime) => {
      const matchesSearch = anime.title.toLowerCase().includes(searchLower);
      if (searchTerm) return matchesSearch;

      const matchesType = anime.format === discoverState.type || anime.type === discoverState.type;
      return matchesType;
    });
  }, [allAnimes, discoverState.type, searchTerm]);

  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
    setDiscoverState((prev) => ({ ...prev, page: 1 }));
  }, [setDiscoverState]);

  const handleTypeChange = (newType) => {
    if (newType === discoverState.type || isPending) return;
    setPendingType(newType);
    startTransition(() => {
      setDiscoverState({ page: 1, type: newType });
      setPendingType(null);
    });
  };

  const visualType = pendingType ?? discoverState.type;

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
                className={`${styles.toggleButton} ${visualType === t.id ? styles.active : ""} ${isPending && discoverState.type !== t.id ? styles.loading : ""}`}
                onClick={() => handleTypeChange(t.id)}
                disabled={isPending}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <SearchLocal onSearch={handleSearch} placeholder="BUSCAR EN DESCUBRIR..." />
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {error && !allAnimes.length ? (
          <div className={styles.errorContainer}>
            <p className={styles.errorMessage}>{error}</p>
            <button className={styles.retryButton} onClick={retryFetch}>
              REINTENTAR
            </button>
          </div>
        ) : loading && !allAnimes.length ? (
          <div className={styles.loadingContainer}>
            <LoadingSpinner size={60} />
            <p>Cargando temporada...</p>
          </div>
        ) : (
          <div className={`${styles.mainContent} ${isPending ? styles.pending : ""}`}>
            <div className={styles.header}>
              <h2 className={styles.sectionTitle}>Descubrir Temporada</h2>
              <div className={styles.accentLine}></div>
            </div>

            <AnimeList animes={filteredAnimes} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Discover;
