import Modal from "./Modal";
import styles from "../../pages/AnimeDetails.module.css";

function SearchApiModal({ isOpen, onClose, query, setQuery, results, onSearch, onSelect, isLoading }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="BUSCAR EN LA RED"
      subtitle="Busca la serie en AniList para vincularla con tus datos locales."
    >
      <div className={styles.apiSearchForm}>
        <input
          type="text"
          className={styles.apiSearchInput}
          placeholder="Nombre del anime..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onSearch()}
          autoFocus
        />
        <button
          className={`${styles.actionBtn} ${styles.primaryBtn} ${styles.apiSearchBtn}`}
          onClick={onSearch}
          disabled={isLoading}
        >
          {isLoading ? "..." : "BUSCAR"}
        </button>
      </div>

      <div className={styles.apiResultList} role="list">
        {results.length === 0 && !isLoading && <p className={styles.emptyFolderText}>No hay resultados para mostrar.</p>}
        {results.map((animeResult) => (
          <button
            key={animeResult.mal_id}
            type="button"
            className={styles.apiResultItem}
            onClick={() => onSelect(animeResult)}
            aria-label={`Vincular ${animeResult.title}`}
          >
            <img
              src={animeResult.images?.jpg?.small_image_url}
              className={styles.apiResultThumb}
              alt={`Poster de ${animeResult.title}`}
            />
            <div className={styles.apiResultInfo}>
              <span className={styles.apiResultTitle}>{animeResult.title}</span>
              <span className={styles.apiResultMeta}>
                {animeResult.type} · {animeResult.episodes || "?"} EPS · {animeResult.status}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default SearchApiModal;
