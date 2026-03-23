import { useRef } from "react";
import AnimeCard from "./AnimeCard";
import styles from "./Carousel.module.css";
import { useStore } from "../../hooks/useStore";

function Carousel({ title, animes = [], loading = false }) {
  const scrollRef = useRef(null);
  const { data, setMyAnimes } = useStore();

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 865;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (animes.length === 0 && !loading) return null;
  return (
    <section className={styles.carousel}>
      <h2 className={styles.title}>
        <svg className={styles.titleIcon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 18.5V5.5L22 12L16 18.5Z" fill="white" />
          <path d="M9 18.5V5.5L15 12L9 18.5Z" fill="white" fillOpacity="0.7" />
          <path d="M2 18.5V5.5L8 12L2 18.5Z" fill="white" fillOpacity="0.4" />
        </svg>
        {loading ? <div className="loader"></div> : title}
      </h2>
      <div className={styles.wrapper}>
        <button className={`${styles.arrow} ${styles.left}`} onClick={() => scroll("left")}>
          ‹
        </button>
        <div className={styles.scroll} ref={scrollRef}>
          {loading
            ? [1, 2, 3, 4, 5, 6].map((i) => <AnimeCard key={`skeleton-${i}`} anime={null} />)
            : animes.map((anime) => {
                const malId = anime.mal_id || anime.malId;
                const inLibraryData = data?.myAnimes?.[malId];
                return (
                  <AnimeCard 
                    key={malId} 
                    anime={anime} 
                    inLibraryData={inLibraryData}
                    playerSetting={data?.settings?.player}
                    setMyAnimes={setMyAnimes}
                  />
                )
              })}
        </div>
        <button className={`${styles.arrow} ${styles.right}`} onClick={() => scroll("right")}>
          ›
        </button>
      </div>
    </section>
  );
}

export default Carousel;
