import { useEffect, useState } from "react";
import styles from "./ScrollToTopButton.module.css";

const VISIBILITY_THRESHOLD = 400;

const ScrollToTopButton = ({ scrollRef }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = scrollRef?.current;
    if (!element) return undefined;

    const handleScroll = () => {
      const nextIsVisible = element.scrollTop > VISIBILITY_THRESHOLD;
      setIsVisible((current) => (current === nextIsVisible ? current : nextIsVisible));
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, [scrollRef]);

  const scrollToTop = () => {
    scrollRef?.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <button
      className={`${styles.scrollToTopBtn} ${isVisible ? styles.visible : ""}`}
      onClick={scrollToTop}
      aria-label="Volver arriba"
      title="Volver arriba"
      type="button"
    >
      <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <path
          fill="currentColor"
          d="M6 12H5v1H4v2h2v-1h1v-1h1v-1h1v-1h1v-1h2v1h1v1h1v1h1v1h1v1h2v-2h-1v-1h-1v-1h-1v-1h-1V9h-1V8h-1V7h-2v1H9v1H8v1H7v1H6"
        />
      </svg>
      <span className={styles.label}>Arriba</span>
    </button>
  );
};

export default ScrollToTopButton;
