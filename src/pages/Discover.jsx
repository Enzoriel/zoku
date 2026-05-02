import { useMemo, useTransition, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import AnimeList from "../components/anime/AnimeList";
import RetryPanel from "../components/ui/RetryPanel";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import SearchLocal from "../components/anime/SearchLocal";
import styles from "./Discover.module.css";
import { useAnime } from "../context/AnimeContext";

function Discover() {
  const { seasonalAnime: allAnimes, loading, error, retryFetch } = useAnime();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const searchTerm = searchParams.get("q") || "";
  const discoverType = searchParams.get("type") || "TV";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [isPending, startTransition] = useTransition();

  const filteredAnimes = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return allAnimes.filter((anime) => {
      const matchesSearch = anime.title.toLowerCase().includes(searchLower);
      if (searchTerm) return matchesSearch;

      const matchesType = anime.format === discoverType || anime.type === discoverType;
      return matchesType;
    });
  }, [allAnimes, discoverType, searchTerm]);

  const handleSearch = useCallback((term) => {
    setSearchParams((prev) => {
      if (term) {
        prev.set("q", term);
      } else {
        prev.delete("q");
      }
      prev.set("page", "1");
      return prev;
    });
  }, [setSearchParams]);

  const handleTypeChange = (newType) => {
    if (newType === discoverType || isPending) return;
    
    startTransition(() => {
      setSearchParams((prev) => {
        prev.set("type", newType);
        prev.set("page", "1");
        return prev;
      });
    });
  };

  const handlePageChange = useCallback((page) => {
    setSearchParams((prev) => {
      prev.set("page", page.toString());
      return prev;
    });
  }, [setSearchParams]);

  const visualType = discoverType;

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
                className={`${styles.toggleButton} ${visualType === t.id ? styles.active : ""} ${isPending ? styles.loading : ""}`}
                onClick={() => handleTypeChange(t.id)}
                disabled={isPending}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <SearchLocal onSearch={handleSearch} initialValue={searchTerm} placeholder="BUSCAR EN DESCUBRIR..." />
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

            <AnimeList 
              animes={filteredAnimes} 
              currentPage={currentPage}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default Discover;
