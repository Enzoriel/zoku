import { useState } from "react";
import styles from "./RetryPanel.module.css";

function RetryPanel({ message, onRetry, compact = false }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry?.();
    } catch {
      // El error se maneja en el caller.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ""}`} role="alert" aria-live="assertive">
      <div className={styles.iconWrap}>
        <svg viewBox="0 0 24 24" className={styles.icon} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <div className={styles.textBlock}>
        <span className={styles.label}>ERROR DE CONEXION</span>
        <p className={styles.message}>{message || "No se pudo conectar con el servidor."}</p>
      </div>

      <button
        className={`${styles.retryBtn} ${retrying ? styles.retrying : ""}`}
        onClick={handleRetry}
        disabled={retrying}
      >
        <svg
          viewBox="0 0 24 24"
          className={`${styles.retryIcon} ${retrying ? styles.spinning : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M1 4v6h6" />
          <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
        </svg>
        <span>{retrying ? "REINTENTANDO..." : "REINTENTAR"}</span>
      </button>
    </div>
  );
}

export default RetryPanel;
