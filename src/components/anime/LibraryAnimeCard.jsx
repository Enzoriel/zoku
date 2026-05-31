import { isAnimeActivelyAiring } from "../../utils/airingStatus";
import styles from "./LibraryAnimeCard.module.css";

const USER_STATUS_LABELS = {
  PLAN_TO_WATCH: "PENDIENTE",
  WATCHING: "VIENDO",
  COMPLETED: "COMPLETADO",
  PAUSED: "PAUSADO",
  DROPPED: "ABANDONADO",
};

const LIBRARY_STATUS_LABELS = {
  LINKED: "VINCULADO",
  SUGGESTED: "SUGERIDA",
  UNLINKED: "SIN VINCULAR",
  NO_FILES: "SIN ARCHIVOS",
};

function LibraryAnimeCard({ item, onOpen, onUnlink, onDelete, onRemove }) {
  const { anime, computedStatus, libraryStatus, fileCount, isMissing } = item;
  const image = anime?.images?.jpg?.large_image_url || anime?.coverImage || "";
  const title = anime?.title || anime?.title_english || "Unknown Title";
  const totalEpisodes = anime?.totalEpisodes || (!isAnimeActivelyAiring(anime) ? anime?.episodes || 0 : 0);
  const watchedEpisodes = Array.isArray(anime?.watchedEpisodes) ? anime.watchedEpisodes.length : 0;
  const progressLabel = `${watchedEpisodes}/${totalEpisodes || "?"}`;
  const typeLabel = anime?.type ? String(anime.type).replace(/_/g, " ") : null;
  const canDelete = (libraryStatus !== "NO_FILES" || fileCount > 0) && !isMissing;

  return (
    <article className={`${styles.cardShell} ${isMissing ? styles.missing : ""}`}>
      <div
        className={styles.card}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <div className={styles.posterFrame}>
          {image ? (
            <img src={image} alt={title} className={styles.poster} loading="lazy" />
          ) : (
            <div className={styles.posterFallback}>SIN PORTADA</div>
          )}

          <div className={styles.posterShade} />

          <div className={styles.topRow}>
            <div className={styles.badgeStack}>
              <span className={styles.badge} data-tone="user">
                {USER_STATUS_LABELS[computedStatus] || "EN LISTA"}
              </span>
              <span className={styles.badge} data-tone="library">
                {LIBRARY_STATUS_LABELS[libraryStatus]}
              </span>
            </div>

            <div className={styles.progressPill}>
              <span className={styles.progressValue}>{progressLabel}</span>
              <span className={styles.progressLabel}>EP</span>
            </div>
          </div>

          <div className={styles.hoverContent}>
            <div className={styles.hoverHeader}>
              <h3 className={styles.title}>{title}</h3>
            </div>

            <div className={styles.metaRow}>
              {typeLabel ? <span className={styles.metaChip}>{typeLabel}</span> : null}
              <span className={styles.metaChip}>{fileCount} ARCH</span>
            </div>
          </div>

          <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
            {libraryStatus === "LINKED" && (
              <button
                className={styles.actionButton}
                type="button"
                onClick={onUnlink}
                aria-label="Desvincular carpeta"
                title="Desvincular carpeta"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </button>
            )}
            {canDelete && (
              <button
                className={`${styles.actionButton} ${styles.danger}`}
                type="button"
                onClick={onDelete}
                aria-label="Eliminar archivos del disco"
                title="Eliminar archivos del disco"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                  <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                </svg>
              </button>
            )}
            <button
              className={`${styles.actionButton} ${styles.danger}`}
              type="button"
              onClick={onRemove}
              aria-label="Quitar de lista"
              title="Quitar de lista"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default LibraryAnimeCard;
