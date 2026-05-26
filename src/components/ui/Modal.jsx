import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

const MODAL_DRAG_THRESHOLD = 5;

const isEditableTarget = (target) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const getScrollableTarget = (target, fallback) => {
  if (!(target instanceof Element) || !fallback) return fallback;

  let current = target;
  while (current && current !== fallback.parentElement) {
    if (current instanceof HTMLElement && current.scrollHeight > current.clientHeight) {
      const overflowY = window.getComputedStyle(current).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return current;
    }
    if (current === fallback) break;
    current = current.parentElement;
  }

  return fallback;
};

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
function Modal({ isOpen, onClose, title, subtitle, children, footer, size = "md", hideClose = false, ariaDescribedBy }) {
  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const dragStateRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusableElementsString = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]';
        const focusableElements = modalRef.current.querySelectorAll(focusableElementsString);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const focusable = modalRef.current.querySelector(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    );
    if (focusable) {
      focusable.focus();
    } else {
      modalRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const stopDrag = (event) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.didDrag) {
        state.scrollEl.releasePointerCapture?.(event.pointerId);
        state.scrollEl.classList.remove(styles.contentDragging);
        suppressClickRef.current = true;
        if (suppressClickTimeoutRef.current) {
          window.clearTimeout(suppressClickTimeoutRef.current);
        }
        suppressClickTimeoutRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
          suppressClickTimeoutRef.current = null;
        }, 150);
        event.preventDefault();
        event.stopPropagation();
      }
      dragStateRef.current = null;
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0 || event.pointerType !== "mouse") return;
      if (isEditableTarget(event.target)) return;

      dragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        scrollEl: getScrollableTarget(event.target, contentEl),
        didDrag: false,
      };
      dragStateRef.current.startScrollTop = dragStateRef.current.scrollEl.scrollTop;
    };

    const handlePointerMove = (event) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if ((event.buttons & 1) !== 1) {
        dragStateRef.current = null;
        return;
      }

      const deltaY = event.clientY - state.startY;
      if (!state.didDrag && Math.abs(deltaY) < MODAL_DRAG_THRESHOLD) return;

      if (!state.didDrag) {
        state.didDrag = true;
        state.scrollEl.setPointerCapture?.(event.pointerId);
        state.scrollEl.classList.add(styles.contentDragging);
      }

      state.scrollEl.scrollTop = state.startScrollTop - deltaY;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleClick = (event) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleDragStart = (event) => {
      if (!dragStateRef.current?.didDrag) return;
      event.preventDefault();
      event.stopPropagation();
    };

    contentEl.addEventListener("pointerdown", handlePointerDown);
    contentEl.addEventListener("pointermove", handlePointerMove);
    contentEl.addEventListener("pointerup", stopDrag);
    contentEl.addEventListener("pointercancel", stopDrag);
    contentEl.addEventListener("click", handleClick, true);
    contentEl.addEventListener("dragstart", handleDragStart, true);

    return () => {
      contentEl.removeEventListener("pointerdown", handlePointerDown);
      contentEl.removeEventListener("pointermove", handlePointerMove);
      contentEl.removeEventListener("pointerup", stopDrag);
      contentEl.removeEventListener("pointercancel", stopDrag);
      contentEl.removeEventListener("click", handleClick, true);
      contentEl.removeEventListener("dragstart", handleDragStart, true);
      contentEl.classList.remove(styles.contentDragging);
      dragStateRef.current?.scrollEl?.classList?.remove(styles.contentDragging);
      if (suppressClickTimeoutRef.current) {
        window.clearTimeout(suppressClickTimeoutRef.current);
        suppressClickTimeoutRef.current = null;
      }
      suppressClickRef.current = false;
      dragStateRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.overlay} data-drag-scroll-ignore onClick={handleBackdropClick}>
      <div 
        className={`${styles.modal} ${styles[`size-${size}`]}`} 
        tabIndex="-1" 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-describedby={ariaDescribedBy}
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

        <div ref={contentRef} className={styles.content}>
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
