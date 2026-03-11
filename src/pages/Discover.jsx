import { useState, useEffect, useCallback } from "react";
import { getSeasonNow } from "../services/api";
import AnimeList from "../components/anime/AnimeList";
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
    console.log(animes);
  }, [page, type, loadAnimes]);

  const handleTypeChange = (newType) => {
    if (newType !== type) {
      setType(newType);
      setPage(1);
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
      <div className={styles.toggleGroup}>
        <div className={styles.buttonsContainer}>
          <button
            className={`${styles.toggleButton} ${type === "tv" ? styles.active : ""}`}
            onClick={() => handleTypeChange("tv")}
          >
            TV
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
            <div className="pulse" style={{ width: "100%", height: "400px", borderRadius: "8px" }}></div>
          </div>
        ) : (
          <>
            <AnimeList animes={animes} />

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
