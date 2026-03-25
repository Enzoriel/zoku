import styles from "./ConfirmModal.module.css";

function ConfirmModal({ 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  isLoading = false, 
  confirmLabel = "CONFIRMAR",
  variant = "primary" 
}) {
  const handleOutsideClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };
  return (
    <div className={styles.overlay} onClick={handleOutsideClick}>
      <div className={styles.modal}>
        <div className={styles.cornerTL} />
        <div className={styles.cornerTR} />
        <div className={styles.cornerBL} />
        <div className={styles.cornerBR} />

        <p className={styles.tag}>{variant === "danger" ? "PELIGRO" : "CONFIRMAR"}</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
            CANCELAR
          </button>
          <button 
            className={`${styles.confirmBtn} ${variant === "danger" ? styles.danger : ""}`} 
            onClick={onConfirm} 
            disabled={isLoading}
          >
            {isLoading ? "PROCESANDO..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
