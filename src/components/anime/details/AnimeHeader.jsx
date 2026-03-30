import styles from "../../../pages/AnimeDetails.module.css";

export function AnimeHeader({ title, type, year, status }) {
  return (
    <header className={styles.headerArea}>
      <div className={styles.titleContainer}>
        <h1 className={styles.mainTitle}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="18" height="18" className={styles.titleIcon}>
            <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" fill="currentColor" />
            <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" transform="translate(20, 20) scale(0.4) translate(-20, -20)" className={styles.titleIconInner} />
          </svg>
          {title}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="18" height="18" className={styles.titleIcon}>
            <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" fill="currentColor" />
            <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" transform="translate(20, 20) scale(0.4) translate(-20, -20)" className={styles.titleIconInner} />
          </svg>
        </h1>
        <div className={styles.titleMeta}>
          <span>{type}</span> • <span>{year}</span> •{" "}
          <span className={styles.statusText}>{status}</span>
        </div>
      </div>
    </header>
  );
}
