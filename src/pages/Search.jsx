import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { searchAnime } from "../services/api";
import SearchBar from "../components/anime/SearchBar";
import AnimeList from "../components/anime/AnimeList";
import RetryPanel from "../components/ui/RetryPanel";
import styles from "./Search.module.css";
import { useAnime } from "../context/AnimeContext";

function getVisiblePages(currentPage, lastPage) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(lastPage, currentPage + 2);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function Search() {
  const { searchState, setSearchState } = useAnime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const activeRequestKey = useRef(null);
  const failedRequestKey = useRef(null);

  const queryParam = searchParams.get("q") || "";
  const pageParam = parseInt(searchParams.get("page") || "1", 10);

  const loadResults = useCallback(
    async (currentQuery, currentPage, options = {}) => {
      if (!currentQuery.trim()) return;

      const requestKey = `${currentQuery.trim()}::${currentPage}`;
      if (activeRequestKey.current === requestKey) return;
      if (!options.force && failedRequestKey.current === requestKey) return;

      activeRequestKey.current = requestKey;

      setLoading(true);
      setSearchError(null);
      try {
        const result = await searchAnime(currentQuery, currentPage);
        setSearchState({
          query: currentQuery,
          page: currentPage,
          animes: result.data,
          pagination: result.pagination,
          hasSearched: true,
        });
        failedRequestKey.current = null;
      } catch (error) {
        console.error("Error searching animes:", error);
        failedRequestKey.current = requestKey;
        setSearchError(error?.message || "Error al buscar. Revisa tu conexion e intenta de nuevo.");
      } finally {
        activeRequestKey.current = null;
        setLoading(false);
      }
    },
    [setSearchState],
  );

  // Sincronizar estado global con la URL al cambiar la ruta (ej. Boton Atras)
  useEffect(() => {
    if (queryParam) {
      if (searchState.query !== queryParam || searchState.page !== pageParam) {
        loadResults(queryParam, pageParam);
      }
    } else if (searchState.hasSearched) {
      setSearchState({
        query: "",
        page: 1,
        animes: [],
        pagination: { total: 0, current_page: 1, last_visible_page: 1, has_next_page: false },
        hasSearched: false,
      });
    }
  }, [queryParam, pageParam, searchState.query, searchState.page, searchState.hasSearched, loadResults, setSearchState]);

  const handleSearch = useCallback(
    (newQuery) => {
      if (newQuery === queryParam) return;

      setSearchParams((prev) => {
        if (newQuery.trim()) {
          prev.set("q", newQuery);
          prev.set("page", "1");
        } else {
          prev.delete("q");
          prev.delete("page");
        }
        return prev;
      });
    },
    [queryParam, setSearchParams],
  );

  const goToPage = useCallback(
    (page) => {
      if (!queryParam.trim() || page === pageParam) return;
      setSearchParams((prev) => {
        prev.set("page", page.toString());
        return prev;
      });
    },
    [pageParam, queryParam, setSearchParams],
  );

  const { animes, pagination, hasSearched } = searchState;

  const visiblePages = useMemo(
    () => getVisiblePages(pagination.current_page || 1, pagination.last_visible_page || 1),
    [pagination.current_page, pagination.last_visible_page],
  );

  return (
    <div className={styles.search}>
      <div className={styles.scanline}></div>
      <div className={`${styles.cornerDecor} ${styles.topLeft}`}></div>
      <div className={`${styles.cornerDecor} ${styles.topRight}`}></div>
      <div className={`${styles.cornerDecor} ${styles.bottomLeft}`}></div>
      <div className={`${styles.cornerDecor} ${styles.bottomRight}`}></div>

      <div className={styles.searchHeader}>
        <div className={styles.searchTitle}>
          <h1>Buscar Anime</h1>
          <div className={styles.titleDecor}></div>
        </div>
        <p className={styles.searchSubtitle}>Explora el catalogo completo</p>
      </div>

      <div style={{ padding: "0 40px" }}>
        <SearchBar onSearch={handleSearch} initialValue={queryParam} isLoading={loading} />
      </div>

      <div className={styles.searchContent}>
        {loading ? (
          <div className={styles.loadingContainer} aria-busy="true">
            <div className={styles.loadingBox}>
              <div className={styles.loadingSpinner}></div>
              <span className={styles.loadingText}>CARGANDO...</span>
            </div>
          </div>
        ) : searchError ? (
          <RetryPanel message={searchError} onRetry={() => loadResults(queryParam, pageParam, { force: true })} compact />
        ) : hasSearched ? (
          <>
            <div className={styles.resultsSection}>
              <div className={styles.resultsHeader}>
                <div className={styles.resultsInfo}>
                  <span className={styles.resultsCount}>
                    Resultados: <span>{pagination.total || animes.length}</span>
                  </span>
                  {queryParam && <span className={styles.queryHighlight}>"{queryParam}"</span>}
                </div>
                <div className={styles.resultsLine}></div>
              </div>
            </div>

            <AnimeList animes={animes} disablePagination />

            {(pagination.last_visible_page || 1) > 1 && (
              <div className={styles.paginationSection}>
                <div className={styles.pageInfo}>
                  Pagina <span>{pagination.current_page || 1}</span> de <span>{pagination.last_visible_page || 1}</span>
                </div>
                <div className={styles.pageButtons}>
                  <button
                    className={`${styles.pageBtn} ${styles.nav}`}
                    onClick={() => goToPage((pagination.current_page || 1) - 1)}
                    disabled={(pagination.current_page || 1) <= 1}
                  >
                    ←
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      className={`${styles.pageBtn} ${page === pagination.current_page ? styles.active : ""}`}
                      onClick={() => goToPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    className={`${styles.pageBtn} ${styles.nav}`}
                    onClick={() => goToPage((pagination.current_page || 1) + 1)}
                    disabled={!pagination.has_next_page}
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyBox}>
              <svg
                className={styles.emptyIcon}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <p className={styles.emptyText}>Escribe el nombre de un anime para comenzar la busqueda</p>
            </div>
            <div className={styles.searchHint}>
              <span className={styles.hintText}>Presiona</span>
              <div className={styles.hintKeys}>
                <span className={styles.keyBadge}>ENTER</span>
                <span className={styles.keyBadge}>BUSCAR</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Search;
