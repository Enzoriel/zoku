import { useState, useEffect, useCallback } from "react";
import { getSeasonNow, searchAnime } from "../services/api";
import SearchBar from "../components/anime/SearchBar";
import AnimeGrid from "../components/anime/AnimeGrid";
import styles from "./Discover.module.css";

function Discover() {
  const [animes, setAnimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const loadAnimes = useCallback(async (currentQuery, currentPage) => {
    setLoading(true);
    try {
      let result;
      if (currentQuery.trim()) {
        result = await searchAnime(currentQuery, currentPage);
      } else {
        result = await getSeasonNow(currentPage);
      }
      setAnimes(result.data);
      setPagination(result.pagination);
    } catch (error) {
      console.error("Error loading animes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnimes(query, page);
  }, [query, page, loadAnimes]);

  const handleSearch = (newQuery) => {
    if (newQuery !== query) {
      setQuery(newQuery);
      setPage(1); // Reset page on new search
    }
  };

  const handleNextPage = () => {
    if (pagination.has_next_page) {
      setPage((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className={styles.discover}>
      <h1 className={styles.title}>
        <svg style={{ width: "34px", height: "34px" }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 18.5V5.5L22 12L16 18.5Z" fill="white" />
          <path d="M9 18.5V5.5L15 12L9 18.5Z" fill="white" fillOpacity="0.7" />
          <path d="M2 18.5V5.5L8 12L2 18.5Z" fill="white" fillOpacity="0.4" />
        </svg>
        Descubrir
      </h1>

      <div style={{ padding: "0 20px" }}>
        <SearchBar onSearch={handleSearch} isLoading={loading} />

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className="loader"></div>
            <div className="pulse" style={{ width: "100%", height: "400px", borderRadius: "8px" }}></div>
          </div>
        ) : (
          <>
            <AnimeGrid animes={animes} />

            <div className={styles.pagination}>
              <button onClick={handlePrevPage} disabled={page === 1} className={styles.pageButton}>
                Anterior
              </button>
              <span className={styles.pageInfo}>
                Página {page} {pagination.last_visible_page ? `de ${pagination.last_visible_page}` : ""}
              </span>
              <button onClick={handleNextPage} disabled={!pagination.has_next_page} className={styles.pageButton}>
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Discover;
