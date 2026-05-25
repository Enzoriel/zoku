import styles from "../../../pages/AnimeDetails.module.css";
import BackButton from "../../ui/BackButton";

function getStatusClass(status) {
  if (!status) return "";
  const s = status.toLowerCase();
  if (s.includes("emision") || s.includes("airing") || s.includes("releasing") || s.includes("emisión")) return styles.statusAiring;
  if (s.includes("finalizado") || s.includes("finished")) return styles.statusFinished;
  if (s.includes("proximo") || s.includes("próximamente") || s.includes("not yet")) return styles.statusUpcoming;
  return "";
}

export function AnimeHeader({ title, type, year, status }) {
  const statusClass = getStatusClass(status);

  return (
    <header className={styles.headerArea}>
      <div style={{ marginBottom: "1rem" }}>
        <BackButton />
      </div>
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
          <span className={`${styles.statusText} ${statusClass}`.trim()}>{status}</span>
        </div>
      </div>
    </header>
  );
}
