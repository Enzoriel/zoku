import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { getAnimeDetails } from "../services/api";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import styles from "./AnimeDetails.module.css";

function AnimeDetails() {
  const { id } = useParams();
  const { data, setMyAnimes } = useStore();
  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnime = async () => {
      try {
        setLoading(true);
        const animeData = await getAnimeDetails(id);
        setAnime(animeData);
      } catch (err) {
        setError("Error al cargar los detalles del anime");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnime();
  }, [id]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner size={80} />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className={styles.errorContainer}>
        <p>{error || "Anime no encontrado"}</p>
      </div>
    );
  }

  const handleAddToLibrary = async () => {
    const animeData = {
      malId: anime.mal_id,
      title: anime.title,
      coverImage: anime.images?.jpg?.large_image_url,
      totalEpisodes: anime.episodes || 24,
      episodeDuration: 24,
      watchedEpisodes: [],
      lastEpisodeWatched: 0,
      watchHistory: [],
      addedAt: new Date().toISOString(),
    };

    const newMyAnimes = {
      ...data.myAnimes,
      [anime.mal_id]: animeData,
    };

    await setMyAnimes(newMyAnimes);
  };

  const isInLibrary = data?.myAnimes && data.myAnimes[anime.mal_id];
  const coverImage = anime.images?.jpg?.large_image_url || "";
  const bannerImage = anime.trailer?.images?.maximum_image_url || coverImage;

  return (
    <div className={styles.container} style={{ animation: "fadeIn 0.5s ease" }}>
      {/* Hero Banner */}
      <div 
        className={styles.heroBanner} 
        style={{ backgroundImage: `url(${bannerImage})` }}
      >
        <div className={styles.heroOverlay}></div>
      </div>

      <div className={styles.content}>
        {/* Sidebar Izquierdo: Poster Info y Botón */}
        <div className={styles.sidebar}>
          <img src={coverImage} alt={anime.title} className={styles.poster} />
          
          <div className={styles.quickInfo}>
            <div className={styles.statBadge}>
              <span className={styles.statLabel}>SCORE</span>
              <span className={styles.statValue}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                {anime.score || "N/A"}
              </span>
            </div>
            
            <div className={styles.statBadge}>
              <span className={styles.statLabel}>RANK</span>
              <span className={styles.statValue}>#{anime.rank || "?"}</span>
            </div>
            
            <div className={styles.statBadge}>
              <span className={styles.statLabel}>POPULARITY</span>
              <span className={styles.statValue}>#{anime.popularity || "?"}</span>
            </div>
          </div>

          <button 
            className={`${styles.actionButton} ${isInLibrary ? styles.added : ""}`}
            onClick={handleAddToLibrary}
            disabled={isInLibrary}
          >
            {isInLibrary ? "EN BIBLIOTECA ✓" : "AÑADIR A BIBLIOTECA +"}
          </button>
        </div>

        {/* Content Derecho: Detalles */}
        <div className={styles.details}>
          <div className={styles.headerArea}>
            {anime.studios && anime.studios.length > 0 && (
              <span className={styles.studio}>{anime.studios[0].name}</span>
            )}
            <h1 className={styles.title}>{anime.title}</h1>
            <div className={styles.metadataTags}>
              <span className={styles.tag}>{anime.type}</span>
              <span className={styles.tag}>{anime.status}</span>
              <span className={styles.tag}>{anime.episodes ? `${anime.episodes} EPS` : "TBA"}</span>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>SINOPSIS</h3>
            <p className={styles.synopsis}>{anime.synopsis || "Sinopsis no disponible."}</p>
          </div>

          {anime.genres && anime.genres.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>GÉNEROS</h3>
              <div className={styles.genresList}>
                {anime.genres.map((genre) => (
                  <span key={genre.mal_id} className={styles.genreTag}>
                    {genre.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {anime.trailer?.embed_url && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>TRAILER</h3>
              <div className={styles.trailerContainer}>
                <iframe 
                  src={anime.trailer.embed_url.replace("autoplay=1", "autoplay=0")} 
                  title={`${anime.title} Trailer`}
                  frameBorder="0"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnimeDetails;
