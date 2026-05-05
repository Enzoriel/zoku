import { useDragScroll } from "./useDragScroll";

export function useHorizontalDrag(scrollRef, id = null) {
  useDragScroll(scrollRef, {
    direction: "horizontal",
    id: id ? `carousel-${id}` : null, // ID para guardar en el historial, si se proporciona
    springStiffness: 0.12,
    springDamping: 0.65,
  });
}
