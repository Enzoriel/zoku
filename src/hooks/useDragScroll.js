import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const LEFT_MOUSE_BUTTON = 0;
const LEFT_MOUSE_BUTTON_MASK = 1;
const DRAG_SCROLL_THRESHOLD = 5;
const MAX_INERTIA_VELOCITY = 2.5;
const INERTIA_FRICTION = 0.92;
const MIN_INERTIA_VELOCITY = 0.04;
const CLICK_SUPPRESSION_TIMEOUT = 150;
const MAX_SCROLL_HISTORY_ENTRIES = 50;

const RUBBER_BAND_RESISTANCE = 0.3;
const MIN_SPRING_VELOCITY = 0.3;

const isEditableTarget = (target) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const rubberBandClamp = (offset, dimension) => {
  return (offset * dimension * RUBBER_BAND_RESISTANCE) / (dimension + RUBBER_BAND_RESISTANCE * Math.abs(offset));
};

// Historial global a nivel de módulo para que persista aunque los componentes (como Carruseles) se desmonten
const globalScrollHistory = new Map();

export function useDragScroll(scrollRef, options = {}) {
  const {
    direction = "vertical", // "vertical" | "horizontal"
    id = null, // ID único para el historial
    springStiffness = 0.18,
    springDamping = 0.55,
  } = options;

  const isHorizontal = direction === "horizontal";

  const location = useLocation();
  const navigationType = useNavigationType();
  const isRestoring = useRef(false);
  const dragState = useRef(null);
  const inertiaFrame = useRef(null);
  const suppressNextClick = useRef(false);
  const clickSuppressionTimeout = useRef(null);

  const rubberBandState = useRef({ active: false, offset: 0, velocity: 0, animFrame: null });

  // 1. Guardar y Restaurar historial de scroll
  useEffect(() => {
    if (!id) return;
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (isRestoring.current) return;
      const historyKey = `${location.pathname}-${id}`;
      globalScrollHistory.set(historyKey, isHorizontal ? el.scrollLeft : el.scrollTop);
      if (globalScrollHistory.size > MAX_SCROLL_HISTORY_ENTRIES) {
        globalScrollHistory.delete(globalScrollHistory.keys().next().value);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [location.pathname, scrollRef, id, isHorizontal]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!id || !el) return;

    isRestoring.current = true;
    let interval = null;
    let timeout = null;
    const historyKey = `${location.pathname}-${id}`;

    if (navigationType === "POP") {
      const savedScroll = globalScrollHistory.get(historyKey) || 0;

      el.style.scrollBehavior = "auto"; // Anular animación CSS de restauración
      if (isHorizontal) el.scrollLeft = savedScroll;
      else el.scrollTop = savedScroll;

      let attempts = 0;
      interval = setInterval(() => {
        attempts++;
        const currentScroll = isHorizontal ? el.scrollLeft : el.scrollTop;

        // Solo reintentamos si no llegó al valor esperado (a veces el DOM no está listo)
        if (currentScroll < savedScroll) {
          el.style.scrollBehavior = "auto";
          if (isHorizontal) el.scrollLeft = savedScroll;
          else el.scrollTop = savedScroll;
        }

        if (attempts >= 5) {
          clearInterval(interval);
          el.style.scrollBehavior = ""; // Restaurar smooth scroll
          isRestoring.current = false;
        }
      }, 20);
    } else {
      el.style.scrollBehavior = "auto";
      if (isHorizontal) el.scrollLeft = 0;
      else el.scrollTop = 0;

      timeout = setTimeout(() => {
        el.style.scrollBehavior = "";
        isRestoring.current = false;
      }, 50);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      if (el) el.style.scrollBehavior = "";
    };
  }, [location.pathname, navigationType, scrollRef, id, isHorizontal]);

  // 2. Motor Físico (Drag, Inercia, RubberBand)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rb = rubberBandState.current;

    const stopInertia = () => {
      if (!inertiaFrame.current) return;
      cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = null;
      el.style.scrollBehavior = "";
    };

    const stopRubberBand = () => {
      if (rb.animFrame) {
        cancelAnimationFrame(rb.animFrame);
        rb.animFrame = null;
      }
      rb.active = false;
      rb.offset = 0;
      rb.velocity = 0;
      el.style.transform = "";
      el.style.transition = "";
    };

    const startRubberBandReturn = () => {
      if (rb.animFrame) cancelAnimationFrame(rb.animFrame);
      const animate = () => {
        const spring = -springStiffness * rb.offset;
        rb.velocity = (rb.velocity + spring) * springDamping;
        rb.offset += rb.velocity;

        el.style.transform = isHorizontal ? `translateX(${rb.offset}px)` : `translateY(${rb.offset}px)`;

        if (Math.abs(rb.offset) < 0.5 && Math.abs(rb.velocity) < MIN_SPRING_VELOCITY) {
          stopRubberBand();
          return;
        }
        rb.animFrame = requestAnimationFrame(animate);
      };
      rb.animFrame = requestAnimationFrame(animate);
    };

    const startInertia = (velocity) => {
      stopInertia();
      let currentVelocity = Math.max(-MAX_INERTIA_VELOCITY, Math.min(MAX_INERTIA_VELOCITY, velocity));
      el.style.scrollBehavior = "auto"; // Prevenir conflicto CSS

      const step = () => {
        if (Math.abs(currentVelocity) < MIN_INERTIA_VELOCITY) {
          inertiaFrame.current = null;
          el.style.scrollBehavior = "";
          return;
        }

        const prevScroll = isHorizontal ? el.scrollLeft : el.scrollTop;
        if (isHorizontal) el.scrollLeft += currentVelocity * 16;
        else el.scrollTop += currentVelocity * 16;

        currentVelocity *= INERTIA_FRICTION;

        const newScroll = isHorizontal ? el.scrollLeft : el.scrollTop;
        if (newScroll === prevScroll) {
          inertiaFrame.current = null;
          el.style.scrollBehavior = "";

          // Si choca contra el límite con suficiente inercia, desencadenar rebote
          if (Math.abs(currentVelocity) > 0.2) {
            rb.active = true;
            // El multiplicador 15 convierte la velocidad restante en el impulso inicial del resorte
            rb.velocity = -currentVelocity * 15;
            startRubberBandReturn();
          }
          return;
        }
        inertiaFrame.current = requestAnimationFrame(step);
      };
      inertiaFrame.current = requestAnimationFrame(step);
    };

    const stopDrag = () => {
      if (!dragState.current) return;
      el.style.scrollBehavior = "";
      el.classList.remove("is-drag-scrolling");
      dragState.current = null;
    };

    const finishDrag = (event, shouldStartInertia = true) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;

      if (state.didDrag) {
        event.stopPropagation();
        el.releasePointerCapture?.(event.pointerId);
      }
      stopDrag();

      if (!state.didDrag) return;

      suppressNextClick.current = true;
      if (clickSuppressionTimeout.current) {
        window.clearTimeout(clickSuppressionTimeout.current);
      }
      clickSuppressionTimeout.current = window.setTimeout(() => {
        suppressNextClick.current = false;
        clickSuppressionTimeout.current = null;
      }, CLICK_SUPPRESSION_TIMEOUT);

      if (rb.active) {
        rb.velocity = 0;
        startRubberBandReturn();
      } else if (shouldStartInertia) {
        startInertia(state.velocity);
      }
      event.preventDefault();
    };

    const handlePointerDown = (event) => {
      if (event.button !== LEFT_MOUSE_BUTTON || event.pointerType !== "mouse") return;
      if (isEditableTarget(event.target)) return;

      stopInertia();
      stopRubberBand();

      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastTime: performance.now(),
        scrollStart: isHorizontal ? el.scrollLeft : el.scrollTop,
        didDrag: false,
        velocity: 0,
      };
    };

    const handlePointerMove = (event) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if ((event.buttons & LEFT_MOUSE_BUTTON_MASK) !== LEFT_MOUSE_BUTTON_MASK) {
        stopDrag();
        return;
      }

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const deltaMain = isHorizontal ? deltaX : deltaY;
      const deltaCross = isHorizontal ? deltaY : deltaX;

      if (!state.didDrag) {
        if (Math.abs(deltaMain) < DRAG_SCROLL_THRESHOLD) {
          return;
        }

        // Solo los contenedores horizontales bloquean por eje. El scroll vertical
        // principal debe seguir funcionando aunque el gesto empiece diagonal u horizontal.
        if (isHorizontal && Math.abs(deltaCross) > Math.abs(deltaMain)) {
          stopDrag();
          return;
        }

        state.didDrag = true;
        el.style.scrollBehavior = "auto";
        el.classList.add("is-drag-scrolling");
        el.setPointerCapture?.(event.pointerId);
      }

      if (!state.didDrag) return;
      event.stopPropagation(); // Aislar eventos globalmente

      const maxScroll = isHorizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      const intendedScroll = state.scrollStart - deltaMain;
      const now = performance.now();
      const elapsed = Math.max(1, now - state.lastTime);

      if (intendedScroll < 0) {
        if (isHorizontal) el.scrollLeft = 0;
        else el.scrollTop = 0;
        const overscroll = Math.abs(intendedScroll);
        const visualOffset = rubberBandClamp(overscroll, isHorizontal ? el.clientWidth : el.clientHeight);
        rb.active = true;
        rb.offset = visualOffset;
        el.style.transform = isHorizontal ? `translateX(${visualOffset}px)` : `translateY(${visualOffset}px)`;
        el.style.transition = "none";
      } else if (intendedScroll > maxScroll) {
        if (isHorizontal) el.scrollLeft = maxScroll;
        else el.scrollTop = maxScroll;
        const overscroll = intendedScroll - maxScroll;
        const visualOffset = -rubberBandClamp(overscroll, isHorizontal ? el.clientWidth : el.clientHeight);
        rb.active = true;
        rb.offset = visualOffset;
        el.style.transform = isHorizontal ? `translateX(${visualOffset}px)` : `translateY(${visualOffset}px)`;
        el.style.transition = "none";
      } else {
        if (rb.active) stopRubberBand();
        const prevScroll = isHorizontal ? el.scrollLeft : el.scrollTop;
        if (isHorizontal) el.scrollLeft = intendedScroll;
        else el.scrollTop = intendedScroll;
        const scrollDelta = (isHorizontal ? el.scrollLeft : el.scrollTop) - prevScroll;
        state.velocity = scrollDelta / elapsed;
      }

      state.lastTime = now;
      event.preventDefault();
    };

    const handlePointerUp = (event) => {
      finishDrag(event);
    };

    const handlePointerCancel = (event) => {
      finishDrag(event, false);
    };

    const handleClick = (event) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerCancel);
    el.addEventListener("click", handleClick, true);

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerCancel);
      el.removeEventListener("click", handleClick, true);
      if (clickSuppressionTimeout.current) {
        window.clearTimeout(clickSuppressionTimeout.current);
        clickSuppressionTimeout.current = null;
      }
      suppressNextClick.current = false;
      stopDrag();
      stopInertia();
      stopRubberBand();
    };
  }, [scrollRef, isHorizontal, springStiffness, springDamping]);
}
