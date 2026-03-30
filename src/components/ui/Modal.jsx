import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

/**
 * Componente de Modal Genérico para Zoku.
 * @param {boolean} isOpen - Controla la visibilidad.
 * @param {function} onClose - Función al cerrar.
 * @param {string} title - Título del modal (pixel-art).
 * @param {string} subtitle - Subtítulo descriptivo.
 * @param {ReactNode} children - Contenido principal.
 * @param {ReactNode} footer - Acciones en la base (opcional).
 * @param {string} size - sm, md, lg, full (opcional).
 * @param {boolean} hideClose - Si se debe ocultar la X de cierre.
 */
function Modal({ isOpen, onClose, title, subtitle, children, footer, size = "md", hideClose = false }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div 
        className={`${styles.modal} ${styles[`size-${size}`]}`} 
        tabIndex="-1" 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.header}>
          <div className={styles.titleArea}>
            {title && <h2 className={styles.title}>{title}</h2>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {!hideClose && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar modal">
              ✕
            </button>
          )}
        </div>

        <div className={styles.content}>
          {children}
        </div>

        {footer && (
          <div className={styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
