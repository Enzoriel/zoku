import { useState, useCallback } from "react";
import { searchAnime } from "../services/api";
import SearchBar from "../components/anime/SearchBar";
import AnimeList from "../components/anime/AnimeList";
import styles from "./Search.module.css";
import { useAnime } from "../context/AnimeContext";

function Search() {
  const { setSearchAnimes } = useAnime();
  const [animes, setAnimes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [hasSearched, setHasSearched] = useState(false);

  const loadResults = useCallback(async (currentQuery, currentPage) => {
    if (!currentQuery.trim()) return;
    setLoading(true);
    try {
      const result = await searchAnime(currentQuery, currentPage);
      setAnimes(result.data);
      setSearchAnimes(result.data);
      setPagination(result.pagination);
      setHasSearched(true);
    } catch (error) {
      console.error("Error searching animes:", error);
    } finally {
      setLoading(false);
    }
  }, [setSearchAnimes]);

  const handleSearch = (newQuery) => {
    if (newQuery !== query) {
      setQuery(newQuery);
      setPage(1);
      if (newQuery.trim()) {
        loadResults(newQuery, 1);
      } else {
        setAnimes([]);
        setPagination({});
        setHasSearched(false);
      }
    }
  };

  const handlePageChange = (newPage) => {
    if (page !== newPage) {
      setPage(newPage);
      loadResults(query, newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className={styles.search}>
      <div style={{ padding: "0 20px" }}>
        <SearchBar onSearch={handleSearch} isLoading={loading} />

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className="loader"></div>
            <div className="pulse" style={{ width: "100%", height: "400px", borderRadius: "8px" }}></div>
          </div>
        ) : hasSearched ? (
          <>
            <AnimeList animes={animes} type={true} />
          </>
        ) : (
          <div className={styles.emptyState}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <p>Escribe algo para buscar anime...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Search;
