import { useState, useEffect } from "react";
import AnimeCardExt from "./AnimeCardExt";
import styles from "./AnimeList.module.css";
import { useStore } from "../../hooks/useStore";
import { useAnime } from "../../context/AnimeContext";

const PAGE_SIZE = 12;

function AnimeList({ animes = [], disablePagination = false }) {
  const { page, setPage } = useAnime();
  const { data, setMyAnimes } = useStore();

  useEffect(() => {
    if (disablePagination) return;

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [page, disablePagination]);

  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  const totalPages = disablePagination ? 1 : Math.ceil(animes.length / PAGE_SIZE);
  const visible = disablePagination ? animes : animes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className={styles.list}>
        {visible.map((anime) => {
          const malId = anime.mal_id || anime.malId;
          return (
            <AnimeCardExt
              key={malId}
              anime={anime}
              malId={malId}
              isInLibrary={!!data?.myAnimes?.[malId]}
              setMyAnimes={setMyAnimes}
            />
          );
        })}
      </div>

      {!disablePagination && totalPages > 1 && (
        <div className={styles.pagination}>
          <button onClick={() => setPage((current) => current - 1)} disabled={page === 1} className={styles.pageBtn}>
            ←
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((currentPage) => (
            <button
              key={currentPage}
              onClick={() => setPage(currentPage)}
              className={`${styles.pageBtn} ${page === currentPage ? styles.activePage : ""}`}
            >
              {currentPage}
            </button>
          ))}

          <button
            onClick={() => setPage((current) => current + 1)}
            disabled={page === totalPages}
            className={styles.pageBtn}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

export default AnimeList;
