import { useState, useEffect } from "react";
import AnimeCardExt from "./AnimeCardExt";
import styles from "./AnimeList.module.css";
import { useStore } from "../../hooks/useStore";

const PAGE_SIZE = 12;

function AnimeList({ animes = [] }) {
  const { data, setMyAnimes } = useStore();
  const [page, setPage] = useState(1);

  // Resetear página al cambiar el filtro
  useEffect(() => {
    setPage(1);
  }, [animes]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [page]);

  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  const totalPages = Math.ceil(animes.length / PAGE_SIZE);
  const visible = animes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className={styles.pageBtn}>
            ←
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`${styles.pageBtn} ${page === p ? styles.activePage : ""}`}
            >
              {p}
            </button>
          ))}

          <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} className={styles.pageBtn}>
            →
          </button>
        </div>
      )}
    </div>
  );
}

export default AnimeList;
