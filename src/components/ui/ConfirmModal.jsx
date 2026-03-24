import styles from "./ConfirmModal.module.css";

function ConfirmModal({ title, message, onConfirm, onCancel }) {
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

        <p className={styles.tag}>CONFIRMAR</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            CANCELAR
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm}>
            CONFIRMAR
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
