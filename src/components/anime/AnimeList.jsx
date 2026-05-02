import AnimeCardExt from "./AnimeCardExt";
import styles from "./AnimeList.module.css";
import { useStore } from "../../hooks/useStore";

const PAGE_SIZE = 12;

function AnimeList({ animes = [], disablePagination = false, currentPage = 1, onPageChange }) {
  const { data, setMyAnimes } = useStore();

  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  const totalPages = disablePagination ? 1 : Math.ceil(animes.length / PAGE_SIZE);
  const safeCurrentPage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);
  const visible = disablePagination
    ? animes
    : animes.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

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
          <button
            onClick={() => onPageChange?.(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            className={styles.pageBtn}
          >
            ←
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              onClick={() => onPageChange?.(page)}
              className={`${styles.pageBtn} ${safeCurrentPage === page ? styles.activePage : ""}`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => onPageChange?.(safeCurrentPage + 1)}
            disabled={safeCurrentPage === totalPages}
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
