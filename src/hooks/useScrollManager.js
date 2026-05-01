import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const LEFT_MOUSE_BUTTON = 0;
const LEFT_MOUSE_BUTTON_MASK = 1;
const DRAG_SCROLL_THRESHOLD = 8;
const MAX_INERTIA_VELOCITY = 2.5;
const INERTIA_FRICTION = 0.92;
const MIN_INERTIA_VELOCITY = 0.04;
const CLICK_SUPPRESSION_TIMEOUT = 150;
const MAX_SCROLL_HISTORY_ENTRIES = 50;

const isEditableTarget = (target) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

export function useScrollManager(scrollRef) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollHistory = useRef(new Map());
  const isRestoring = useRef(false);
  const dragState = useRef(null);
  const inertiaFrame = useRef(null);
  const suppressNextClick = useRef(false);

  // Rastrear continuamente el scroll para evitar el "clamping" de React
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      // Ignorar eventos de scroll provocados programáticamente por nuestra propia restauración
      if (isRestoring.current) return;
      scrollHistory.current.set(location.key, el.scrollTop);
      if (scrollHistory.current.size > MAX_SCROLL_HISTORY_ENTRIES) {
        scrollHistory.current.delete(scrollHistory.current.keys().next().value);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [location.key, scrollRef]);

  // Permitir scroll tactil de escritorio: click izquierdo sostenido + arrastrar.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const stopInertia = () => {
      if (!inertiaFrame.current) return;
      cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = null;
    };

    const startInertia = (velocity) => {
      stopInertia();

      let currentVelocity = Math.max(
        -MAX_INERTIA_VELOCITY,
        Math.min(MAX_INERTIA_VELOCITY, velocity),
      );

      const step = () => {
        if (Math.abs(currentVelocity) < MIN_INERTIA_VELOCITY) {
          inertiaFrame.current = null;
          return;
        }

        const previousScrollTop = el.scrollTop;
        el.scrollTop += currentVelocity * 16;
        currentVelocity *= INERTIA_FRICTION;

        if (el.scrollTop === previousScrollTop) {
          inertiaFrame.current = null;
          return;
        }

        inertiaFrame.current = requestAnimationFrame(step);
      };

      inertiaFrame.current = requestAnimationFrame(step);
    };

    const stopDrag = () => {
      if (!dragState.current) return;
      el.classList.remove("is-drag-scrolling");
      dragState.current = null;
    };

    const handlePointerDown = (event) => {
      if (event.button !== LEFT_MOUSE_BUTTON || event.pointerType !== "mouse") return;
      if (isEditableTarget(event.target)) return;

      stopInertia();

      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastY: event.clientY,
        lastTime: performance.now(),
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        didDrag: false,
        velocityY: 0,
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
      const reachedDragThreshold =
        Math.abs(deltaX) > DRAG_SCROLL_THRESHOLD || Math.abs(deltaY) > DRAG_SCROLL_THRESHOLD;

      if (!state.didDrag && reachedDragThreshold) {
        state.didDrag = true;
        el.classList.add("is-drag-scrolling");
        el.setPointerCapture?.(event.pointerId);
      }

      if (!state.didDrag) {
        return;
      }

      const nextScrollTop = state.scrollTop - deltaY;
      const previousScrollTop = el.scrollTop;

      el.scrollLeft = state.scrollLeft - deltaX;
      el.scrollTop = nextScrollTop;

      const now = performance.now();
      const elapsed = Math.max(1, now - state.lastTime);
      const scrollDelta = el.scrollTop - previousScrollTop;
      state.velocityY = scrollDelta / elapsed;
      state.lastY = event.clientY;
      state.lastTime = now;

      event.preventDefault();
    };

    const handlePointerUp = (event) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;

      if (state.didDrag) {
        el.releasePointerCapture?.(event.pointerId);
      }
      stopDrag();

      if (state.didDrag) {
        suppressNextClick.current = true;
        window.setTimeout(() => {
          suppressNextClick.current = false;
        }, CLICK_SUPPRESSION_TIMEOUT);
        startInertia(state.velocityY);
        event.preventDefault();
      }
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
    el.addEventListener("pointercancel", stopDrag);
    el.addEventListener("click", handleClick, true);
    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", stopDrag);
      el.removeEventListener("click", handleClick, true);
      stopDrag();
      stopInertia();
    };
  }, [scrollRef]);

  // Al cambiar la ruta, aplicar el scroll guardado o resetear
  // Usamos useLayoutEffect para ejecutar esto de forma sincrónica ANTES de pintar
  useLayoutEffect(() => {
    if (!scrollRef.current) return;

    isRestoring.current = true; // Bloqueamos el guardado de scroll temporalmente
    let interval = null;
    let timeout = null;

    if (navigationType === "POP") {
      // El usuario volvió atrás, recuperamos la última posición exacta
      const savedScroll = scrollHistory.current.get(location.key) || 0;
      
      // Aplicar sincrónicamente
      scrollRef.current.scrollTop = savedScroll;

      // Fallback: Componentes asíncronos tardan en re-renderizarse (Skeletons, imágenes).
      // Re-intentamos fijar el scroll durante los siguientes 100ms.
      let attempts = 0;
      interval = setInterval(() => {
        attempts++;
        if (scrollRef.current && scrollRef.current.scrollTop < savedScroll) {
          scrollRef.current.scrollTop = savedScroll;
        }
        if (attempts >= 5) {
          if (interval) clearInterval(interval);
          isRestoring.current = false; // Liberamos el bloqueo
        }
      }, 20); // 5 intentos de 20ms = 100ms en total

    } else {
      // Nueva navegación (PUSH / REPLACE), empezamos desde cero
      scrollRef.current.scrollTop = 0;
      // Liberamos el bloqueo casi inmediatamente
      timeout = setTimeout(() => {
        isRestoring.current = false;
      }, 50);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [location.key, navigationType, scrollRef]);
}
