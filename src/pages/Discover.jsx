import { useState, useEffect, useCallback } from "react";
import { getSeasonNow } from "../services/api";
import AnimeList from "../components/anime/AnimeList";
import Pagination from "../components/ui/Pagination";
import styles from "./Discover.module.css";

function Discover() {
  const [animes, setAnimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [type, setType] = useState("tv");

  const loadAnimes = useCallback(async (currentPage, currentType) => {
    setLoading(true);
    try {
      const result = await getSeasonNow(currentPage, currentType);
      setAnimes(result.data);
      setPagination(result.pagination);
    } catch (error) {
      console.error("Error loading animes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnimes(page, type);
  }, [page, type, loadAnimes]);

  const handleTypeChange = (newType) => {
    if (newType !== type) {
      setType(newType);
      setPage(1);
    }
  };

  const handlePageClick = (pageNumber) => {
    if (page !== pageNumber) {
      setPage(pageNumber);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className={styles.discover}>
      <div className={styles.toggleGroup}>
        <div className={styles.buttonsContainer}>
          <button
            className={`${styles.toggleButton} ${type === "tv" ? styles.active : ""}`}
            onClick={() => handleTypeChange("tv")}
          >
            TV
          </button>
          <button
            className={`${styles.toggleButton} ${type === "tv_special" ? styles.active : ""}`}
            onClick={() => handleTypeChange("tv_special")}
          >
            TV Special
          </button>
          <button
            className={`${styles.toggleButton} ${type === "movie" ? styles.active : ""}`}
            onClick={() => handleTypeChange("movie")}
          >
            Movie
          </button>
          <button
            className={`${styles.toggleButton} ${type === "ova" ? styles.active : ""}`}
            onClick={() => handleTypeChange("ova")}
          >
            OVA
          </button>
          <button
            className={`${styles.toggleButton} ${type === "ona" ? styles.active : ""}`}
            onClick={() => handleTypeChange("ona")}
          >
            ONA
          </button>
          <button
            className={`${styles.toggleButton} ${type === "special" ? styles.active : ""}`}
            onClick={() => handleTypeChange("special")}
          >
            Special
          </button>
        </div>
      </div>
      <div>
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className="loader"></div>
            <div className="pulse"></div>
          </div>
        ) : (
          <>
            <AnimeList animes={animes} type={true} />

            <Pagination 
              currentPage={page} 
              totalPages={pagination.last_visible_page} 
              onPageChange={handlePageClick} 
            />
          </>
        )}
      </div>
    </div>
  );
}

export default Discover;
