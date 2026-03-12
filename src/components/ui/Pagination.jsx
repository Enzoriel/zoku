import styles from "./Pagination.module.css";

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null;

  let pages = [];

  // Mostrar un rango máximo de 5 botones
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  // Si estamos en las primeras o últimas páginas, ajustamos para mantener 5 botones si es posible
  if (currentPage <= 2) endPage = Math.min(5, totalPages);
  if (currentPage >= totalPages - 1) startPage = Math.max(1, totalPages - 4);

  for (let i = startPage; i <= endPage; i++) {
    pages.push(
      <button
        key={i}
        onClick={() => onPageChange(i)}
        className={`${styles.pageBtn} ${currentPage === i ? styles.active : ""}`}
      >
        {i}
      </button>,
    );
  }

  const EllipsisIcon = () => (
    <svg className={styles.ellipsis} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );

  return (
    <div className={styles.paginationContainer}>
      {startPage > 1 && <EllipsisIcon />}
      <div className={styles.pagesContainer}>{pages}</div>
      {endPage < totalPages && <EllipsisIcon />}
    </div>
  );
}
