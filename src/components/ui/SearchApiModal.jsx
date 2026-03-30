import Modal from "./Modal";
import styles from "../../pages/AnimeDetails.module.css";

function SearchApiModal({ 
  isOpen, 
  onClose, 
  query, 
  setQuery, 
  results, 
  onSearch, 
  onSelect, 
  isLoading 
}) {
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
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

      <div className={styles.apiResultList}>
        {results.length === 0 && !isLoading && (
          <p className={styles.emptyFolderText}>No hay resultados para mostrar.</p>
        )}
        {results.map((animeResult) => (
          <div
            key={animeResult.mal_id}
            className={styles.apiResultItem}
            onClick={() => onSelect(animeResult)}
          >
            <img 
              src={animeResult.images?.jpg?.small_image_url} 
              className={styles.apiResultThumb} 
              alt="" 
            />
            <div className={styles.apiResultInfo}>
              <span className={styles.apiResultTitle}>{animeResult.title}</span>
              <span className={styles.apiResultMeta}>
                {animeResult.type} • {animeResult.episodes || "?"} EPS • {animeResult.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default SearchApiModal;
