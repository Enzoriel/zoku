import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../hooks/useStore";
import styles from "./AnimeCardExt.module.css";
import LoadingSpinner from "../ui/LoadingSpinner";

function AnimeCardExt({ anime, onAdd, onRemove }) {
  const navigate = useNavigate();
  const { data, setMyAnimes } = useStore();
  const [showMore, setShowMore] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!showMore) return;
    
    const handleClickOutside = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        setShowMore(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMore]);

  if (!anime) {
    return (
      <div className={`${styles.card} pulse`}>
        <div className={styles.imageSection}>
          <div className={styles.loadingPulse}></div>
        </div>
        <div className={styles.infoSection}>
          <div className={styles.loadingPulse}></div>
        </div>
      </div>
    );
  }

  const handleClick = () => {
    navigate(`/anime/${anime.malId || anime.mal_id}`);
  };

  const animeId = anime.malId || anime.mal_id;

  const handleToggleLibrary = async (e) => {
    e.stopPropagation();

    const isCurrentlyInLibrary = data?.myAnimes && data.myAnimes[animeId];

    if (isCurrentlyInLibrary) {
      await setMyAnimes((prev) => {
        const newState = { ...prev };
        delete newState[animeId];
        return newState;
      });
      if (onRemove) onRemove(animeId);
    } else {
      const animeData = {
        malId: animeId,
        title: anime.title,
        coverImage: anime.images?.jpg?.large_image_url || anime.coverImage,
        totalEpisodes: anime.episodes || 0,
        episodeDuration: 24,
        watchedEpisodes: [],
        lastEpisodeWatched: 0,
        userStatus: "PLAN_TO_WATCH", // Estado inicial
        userScore: 0,
        notes: "",
        completedAt: null,
        watchHistory: [],
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        genres: anime.genres || [],
        status: anime.status,
        type: anime.type,
        score: anime.score,
        synopsis: anime.synopsis
      };

      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: animeData,
      }));
      if (onAdd) onAdd(animeData);
    }
  };

  const image = anime.images?.jpg?.large_image_url || anime.coverImage || "";
  const title = anime.title || anime.title_english || "Unknown Title";
  const studioName = anime.studios && anime.studios.length > 0 ? anime.studios[0].name : "UNKNOWN STUDIO";
  const score = anime.score ? anime.score.toFixed(1) : "N/A";
  const demographic = anime.demographics && anime.demographics.length > 0 ? anime.demographics[0].name : "N/A";
  const source = anime.source || "N/A";
  const type = anime.type || "UNKNOWN";
  const rawMembers = anime.members || 0;

  let formattedMembers = rawMembers.toString();
  if (rawMembers >= 1000000) {
    formattedMembers = (rawMembers / 1000000).toFixed(1) + "M";
  } else if (rawMembers >= 1000) {
    formattedMembers = (rawMembers / 1000).toFixed(0) + "K";
  }

  const isInLibrary = data?.myAnimes && data.myAnimes[animeId];

  return (
    <div className={styles.card} onClick={handleClick} ref={cardRef}>
      <div className={styles.imageWrapper}>
        <img src={image} alt={title} className={styles.image} />
        <div className={styles.overlay}></div>
        
        {/* Badges superiores */}
        <div className={styles.topBadges}>
          {anime.rank && <div className={styles.rankBadge}>#{anime.rank}</div>}
          <div className={styles.typeBadge}>{type}</div>
        </div>

        {/* Rating flotante */}
        <div className={styles.ratingBadge}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          {score}
        </div>

        {/* Info que aparece al hacer clic en "Más Info" */}
        <div className={`${styles.infoOverlay} ${showMore ? styles.show : ""}`}>
          <div className={styles.infoContent}>
            <div className={styles.overlayHeader}>
              <span className={styles.studio}>{studioName}</span>
              <button 
                className={styles.closeOverlay} 
                onClick={(e) => { e.stopPropagation(); setShowMore(false); }}
              >✕</button>
            </div>
            
            <div className={styles.genres}>
              {anime.genres?.slice(0, 2).map((g, i) => (
                <span key={i} className={styles.genreTag}>{g.name || g}</span>
              ))}
            </div>
            
            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>MEMBERS</span>
                <span className={styles.statValue}>{formattedMembers}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>SOURCE</span>
                <span className={styles.statValue}>{source}</span>
              </div>
            </div>

            {anime.synopsis && <p className={styles.synopsis}>{anime.synopsis}</p>}
            
            <div className={styles.extraDetails}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>EPISODIOS</span>
                <span className={styles.detailValue}>{anime.episodes || '?'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>DURACIÓN</span>
                <span className={styles.detailValue}>{anime.duration ? `${anime.duration}m` : '?'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>TEMPORADA</span>
                <span className={styles.detailValue}>{anime.season && anime.seasonYear ? `${anime.season} ${anime.seasonYear}` : '?'}</span>
              </div>
            </div>

            <button
              className={`${styles.libraryBtn} ${isInLibrary ? styles.active : ""}`}
              onClick={handleToggleLibrary}
            >
              {isInLibrary ? "✓ EN LISTA" : "+ AÑADIR"}
            </button>
          </div>
        </div>

        {/* Título y Géneros siempre visibles */}
        <div className={styles.titleContainer}>
          <h3 className={styles.title}>{title}</h3>
          <div className={styles.cardGenres}>
            {anime.genres?.slice(0, 2).map((g, i) => (
              <span key={i} className={styles.cardGenreTag}>{g.name || g}</span>
            ))}
          </div>
        </div>

        <button 
          className={styles.moreInfoBtn}
          onClick={(e) => { e.stopPropagation(); setShowMore(true); }}
          title="Más Información"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default AnimeCardExt;
