import Modal from "./Modal";
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
  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      size="sm"
      title={variant === "danger" ? "PELIGRO" : "CONFIRMAR"}
      subtitle={title}
      hideClose={isLoading}
      footer={
        <>
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
        </>
      }
    >
      <p className={styles.message}>{message}</p>
    </Modal>
  );
}

export default ConfirmModal;
