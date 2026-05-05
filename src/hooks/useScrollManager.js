import { useDragScroll } from "./useDragScroll";

export function useScrollManager(scrollRef) {
  useDragScroll(scrollRef, {
    direction: "vertical",
    id: "global-main-scroll", // ID fijo para el contenedor principal de la página
    springStiffness: 0.18,
    springDamping: 0.55,
  });
}
