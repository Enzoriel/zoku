import { useEffect } from "react";

export function useBlockWebNavigation() {
  useEffect(() => {
    const handleMouseNavigation = (e) => {
      // Bloquear botones Atrás (3) y Adelante (4) del ratón nativo
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleKeyDown = (e) => {
      // Bloquear Alt + Flechas (Navegación nativa en navegadores web)
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Bloquear Backspace (Retroceso) para no ir atrás en el historial,
      // EXCEPTO cuando estemos escribiendo en un input o textarea
      if (e.key === "Backspace") {
        const activeElement = document.activeElement;
        
        const isInput = activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA";
        const isContentEditable = activeElement.isContentEditable;
        
        if (!isInput && !isContentEditable) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    // Añadir listeners de forma global
    window.addEventListener("mousedown", handleMouseNavigation, true);
    window.addEventListener("mouseup", handleMouseNavigation, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handleMouseNavigation, true);
      window.removeEventListener("mouseup", handleMouseNavigation, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
