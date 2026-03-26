import { useRef } from "react";
import AnimeCard from "./AnimeCard";
import styles from "./Carousel.module.css";
import { useStore } from "../../hooks/useStore";
import PixelReveal from "../common/PixelReveal";

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
        {!loading && (
          <>
            <div className={styles.titleArrows}>
              <div className={styles.titleArrowsPattern}></div>
            </div>
            <p className={styles.titleText}>{title}</p>
            <div className={`${styles.titleArrows} ${styles.rightArrows}`}>
              <div className={styles.titleArrowsPattern}></div>
            </div>
            <PixelReveal speed={0.12} tileSize={12} delayFactor={1.5} noiseStack={20} active={!loading} />
          </>
        )}
        {loading && <div className="loader"></div>}
      </h2>
      <div className={styles.wrapper}>
        {(loading || animes.length > 4) && (
          <button className={`${styles.arrow} ${styles.left}`} onClick={() => scroll("left")}>
            ‹
          </button>
        )}
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
                );
              })}
        </div>
        {(loading || animes.length > 4) && (
          <button className={`${styles.arrow} ${styles.right}`} onClick={() => scroll("right")}>
            ›
          </button>
        )}
      </div>
    </section>
  );
}

export default Carousel;
