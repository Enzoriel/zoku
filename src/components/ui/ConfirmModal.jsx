import Modal from "./Modal";
import styles from "./ConfirmModal.module.css";

function ConfirmModal({ 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  isLoading = false, 
  loadingLabel = "Procesando y verificando...",
  confirmLabel = "CONFIRMAR",
  variant = "primary",
  hideCancel = false,
}) {
  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      size="sm"
      title={variant === "danger" ? "PELIGRO" : "CONFIRMAR"}
      subtitle={title}
      hideClose={isLoading}
      ariaDescribedBy="confirm-modal-message"
      footer={
        <>
          {!hideCancel && (
            <button className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
              CANCELAR
            </button>
          )}
          <button 
            className={`${styles.confirmBtn} ${variant === "danger" ? styles.danger : ""}`} 
            onClick={onConfirm} 
            disabled={isLoading}
          >
            {isLoading ? (
              <span className={styles.loadingLabel}>
                <span className={styles.spinner} aria-hidden="true" />
                PROCESANDO
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </>
      }
    >
      {typeof message === "string" ? (
        <p id="confirm-modal-message" className={styles.message}>
          {message}
        </p>
      ) : (
        <div id="confirm-modal-message" className={styles.message}>
          {message}
        </div>
      )}
      {isLoading && <p className={styles.loadingHint}>{loadingLabel}</p>}
    </Modal>
  );
}

export default ConfirmModal;
