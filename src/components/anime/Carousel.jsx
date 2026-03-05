import { useRef } from "react";
import AnimeCard from "./AnimeCard";
import styles from "./Carousel.module.css";

function Carousel({ title, animes = [] }) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 870;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (animes.length === 0) return null;

  return (
    <section className={styles.carousel}>
      <h2 className={styles.title}>
        <svg className={styles.titleIcon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 18.5V5.5L22 12L16 18.5Z" fill="white" />
          <path d="M9 18.5V5.5L15 12L9 18.5Z" fill="white" fillOpacity="0.7" />
          <path d="M2 18.5V5.5L8 12L2 18.5Z" fill="white" fillOpacity="0.4" />
        </svg>
        {title}
      </h2>

      <div className={styles.wrapper}>
        <button className={`${styles.arrow} ${styles.left}`} onClick={() => scroll("left")}>
          ‹
        </button>

        <div className={styles.scroll} ref={scrollRef}>
          {animes.map((anime) => (
            <AnimeCard key={anime.malId} anime={anime} />
          ))}
        </div>

        <button className={`${styles.arrow} ${styles.right}`} onClick={() => scroll("right")}>
          ›
        </button>
      </div>
    </section>
  );
}

export default Carousel;
