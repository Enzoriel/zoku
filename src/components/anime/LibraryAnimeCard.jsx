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
  const { anime, computedStatus, libraryStatus, fileCount } = item;
  const image = anime?.images?.jpg?.large_image_url || anime?.coverImage || "";
  const title = anime?.title || anime?.title_english || "Unknown Title";
  const totalEpisodes = anime?.totalEpisodes || anime?.episodes || 0;
  const watchedEpisodes = Array.isArray(anime?.watchedEpisodes) ? anime.watchedEpisodes.length : 0;
  const progressLabel = `${watchedEpisodes}/${totalEpisodes || "?"}`;
  const typeLabel = anime?.type ? String(anime.type).replace(/_/g, " ") : null;
  const canDelete = libraryStatus !== "NO_FILES" || fileCount > 0;

  return (
    <article className={styles.cardShell}>
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
              <button className={styles.actionButton} type="button" onClick={onUnlink}>
                DESVINCULAR
              </button>
            )}
            {canDelete && (
              <button className={`${styles.actionButton} ${styles.danger}`} type="button" onClick={onDelete}>
                ELIMINAR DEL DISCO
              </button>
            )}
            <button className={styles.actionButton} type="button" onClick={onRemove}>
              QUITAR DE LISTA
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default LibraryAnimeCard;
