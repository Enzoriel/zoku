import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { getAnimeDetails, getAnimeEpisodes, searchAnime } from "../services/api";
import { openFile } from "../services/fileSystem";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import styles from "./AnimeDetails.module.css";

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const folderName = searchParams.get("folder");

  const { data, setMyAnimes } = useStore();

  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const persistAnimeData = useCallback(
    async (animeData) => {
      const animeId = animeData.mal_id || animeData.malId;
      const fullData = {
        ...(data.myAnimes[animeId] || {}),
        malId: animeId,
        title: animeData.title,
        coverImage: animeData.images?.jpg?.large_image_url || animeData.coverImage,
        synopsis: animeData.synopsis,
        score: animeData.score,
        rank: animeData.rank,
        popularity: animeData.popularity,
        type: animeData.type,
        status: animeData.status,
        episodes: animeData.episodes,
        genres: animeData.genres,
        aired: animeData.aired,
        lastUpdated: new Date().toISOString(),
        folderName: folderName || data.myAnimes[animeId]?.folderName,
      };

      await setMyAnimes((prev) => ({ ...prev, [fullData.malId]: fullData }));
      return fullData;
    },
    [data.myAnimes, folderName, setMyAnimes],
  );

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        let storedAnime = null;
        if (id && id !== "null" && id !== "undefined") {
          storedAnime = data.myAnimes[id];
        } else if (folderName) {
          storedAnime = Object.values(data.myAnimes).find((a) => a.folderName === folderName || a.title === folderName);
        }

        if (storedAnime && storedAnime.synopsis) {
          setAnime(storedAnime);
          if (storedAnime.malId) {
            const epData = await getAnimeEpisodes(storedAnime.malId);
            setEpisodes(epData);
          }
        } else if (id && id !== "null" && id !== "undefined") {
          const animeData = await getAnimeDetails(id);
          const epData = await getAnimeEpisodes(id);
          setAnime(animeData);
          setEpisodes(epData);
          if (data.myAnimes[id]) {
            await persistAnimeData(animeData);
          }
        } else {
          setAnime({
            title: folderName || "Serie Desconocida",
            status: "Local Only",
            isUnknown: true,
          });
        }
      } catch (err) {
        setError("Error al cargar la información.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [id, folderName, data.myAnimes, persistAnimeData]);

  const handleAddToLibrary = async () => {
    if (!anime) return;
    const animeId = anime.mal_id || anime.malId;
    const animeData = {
      malId: animeId,
      title: anime.title,
      coverImage: anime.images?.jpg?.large_image_url || anime.coverImage,
      totalEpisodes: anime.episodes || episodes.length || 0,
      episodeDuration: anime.duration || "24 min",
      status: anime.status,
      watchedEpisodes: [],
      lastEpisodeWatched: 0,
      watchHistory: [],
      addedAt: new Date().toISOString(),
    };

    await setMyAnimes((prev) => ({
      ...prev,
      [animeId]: animeData,
    }));
  };

  const handleUpdateMetadata = async () => {
    const animeId = anime?.malId || anime?.mal_id;
    if (!animeId) return;
    setIsUpdating(true);
    try {
      const animeData = await getAnimeDetails(animeId);
      const epData = await getAnimeEpisodes(animeId);
      const updated = await persistAnimeData(animeData);
      setAnime(updated);
      setEpisodes(epData);
    } catch (err) {
      console.error("Error al actualizar:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSearchLink = async () => {
    if (!linkSearchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchAnime(linkSearchQuery);
      setSearchResults(results.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectLink = async (selectedAnime) => {
    setLoading(true);
    try {
      const fullDetails = await getAnimeDetails(selectedAnime.mal_id);
      const epData = await getAnimeEpisodes(selectedAnime.mal_id);
      const animeData = {
        malId: fullDetails.mal_id,
        title: fullDetails.title,
        coverImage: fullDetails.images?.jpg?.large_image_url,
        synopsis: fullDetails.synopsis,
        score: fullDetails.score,
        rank: fullDetails.rank,
        popularity: fullDetails.popularity,
        type: fullDetails.type,
        status: fullDetails.status,
        episodes: fullDetails.episodes,
        genres: fullDetails.genres,
        aired: fullDetails.aired,
        watchedEpisodes: [],
        lastEpisodeWatched: 0,
        watchHistory: [],
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        folderName: folderName,
      };
      await setMyAnimes((prev) => ({ ...prev, [animeData.malId]: animeData }));
      setAnime(animeData);
      setEpisodes(epData);
      setShowLinkModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const animeFilesData = data?.localFiles[anime?.title] || data?.localFiles[folderName] || { files: [] };

  const getEpisodeStatus = (ep) => {
    const isWatched = anime?.watchedEpisodes?.includes(ep.mal_id);
    const epNum = ep.mal_id.toString();
    const localFile = animeFilesData.files.find((f) => {
      const name = f.name.toLowerCase();
      const patterns = [
        ` ${epNum} `,
        `-${epNum}`,
        `e${epNum}`,
        `ep${epNum}`,
        ` ${epNum.padStart(2, "0")} `,
        `-${epNum.padStart(2, "0")}`,
        `e${epNum.padStart(2, "0")}`,
        `ep${epNum.padStart(2, "0")}`,
        ` ${epNum.padStart(3, "0")} `,
        `-${epNum.padStart(3, "0")}`,
        `e${epNum.padStart(3, "0")}`,
        `ep${epNum.padStart(3, "0")}`,
      ];
      return (
        patterns.some((p) => name.includes(p)) ||
        name.includes(` ${epNum}.`) ||
        name.includes(` ${epNum.padStart(2, "0")}.`)
      );
    });

    if (anime?.isUnknown) return { label: "LOCAL", class: styles.downloaded, file: localFile };
    const airDate = ep.aired ? new Date(ep.aired) : null;
    const isAired = airDate && airDate <= new Date();
    if (airDate && !isAired) return { label: "POR SALIR", class: styles.upcoming, file: null };
    if (isWatched) return { label: "VISTO", class: styles.watched, file: localFile };
    if (localFile) return { label: "DESCARGADO", class: styles.downloaded, file: localFile };
    return { label: "PENDIENTE", class: styles.pending, file: null };
  };

  const handlePlayEpisode = async (filePath) => {
    if (!filePath) return;
    const ok = await openFile(filePath);
    if (!ok) alert("No se pudo abrir el archivo. Verifica tu reproductor predeterminado.");
  };

  const isInLibrary = data?.myAnimes && data.myAnimes[anime?.malId || anime?.mal_id];

  if (loading)
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner size={80} />
      </div>
    );
  if (error)
    return (
      <div className={styles.errorContainer}>
        <p>{error}</p>
      </div>
    );
  if (!anime)
    return (
      <div className={styles.errorContainer}>
        <p>Anime no encontrado</p>
      </div>
    );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.sidebar}>
          <div className={styles.posterWrapper}>
            {anime.coverImage || anime.images?.jpg?.large_image_url ? (
              <img
                src={anime.coverImage || anime.images?.jpg?.large_image_url}
                alt={anime.title}
                className={styles.poster}
              />
            ) : (
              <div className={styles.posterPlaceholder}>?</div>
            )}

            {anime.isUnknown ? (
              <button
                className={styles.linkButton}
                onClick={() => {
                  setShowLinkModal(true);
                  setLinkSearchQuery(anime.title);
                }}
              >
                VINCULAR CON API
              </button>
            ) : (
              <div className={styles.metaActions}>
                {!isInLibrary && (
                  <button className={styles.linkButton} onClick={handleAddToLibrary}>
                    AÑADIR A LISTA
                  </button>
                )}
                <button className={styles.updateButton} onClick={handleUpdateMetadata} disabled={isUpdating}>
                  {isUpdating ? "ACTUALIZANDO..." : "ACTUALIZAR DATOS"}
                </button>
                {anime.lastUpdated && (
                  <span className={styles.lastUpdate}>Sinc: {new Date(anime.lastUpdated).toLocaleDateString()}</span>
                )}
              </div>
            )}
          </div>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>SCORE</span>
              <span className={styles.statValue}>{anime.score || "N/A"}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>RANK</span>
              <span className={styles.statValue}>#{anime.rank || "?"}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>POPULARITY</span>
              <span className={styles.statValue}>#{anime.popularity || "?"}</span>
            </div>
          </div>
          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <strong>Tipo:</strong> {anime.type || "UNKNOWN"}
            </div>
            <div className={styles.infoItem}>
              <strong>Estado:</strong> {anime.status || "UNKNOWN"}
            </div>
            <div className={styles.infoItem}>
              <strong>Episodios:</strong> {anime.episodes || "UNKNOWN"}
            </div>
          </div>
        </div>
        <div className={styles.details}>
          <div className={styles.headerArea}>
            <h1 className={styles.title}>{anime.title}</h1>
            <div className={styles.genresList}>
              {anime.genres?.map((genre) => (
                <span key={genre.mal_id} className={styles.genreTag}>
                  {genre.name}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>SINOPSIS</h3>
            <p className={styles.synopsis}>{anime.synopsis || "Información no disponible."}</p>
          </div>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>CAPÍTULOS ({animeFilesData.files.length})</h3>
            <div className={styles.episodesList}>
              {anime.isUnknown ? (
                animeFilesData.files.map((file, idx) => (
                  <div key={idx} className={styles.episodeItem}>
                    <div className={styles.epMainInfo}>
                      <span className={styles.epNumber}>Archivo</span>
                      <div className={styles.epTitleContainer}>
                        <span className={styles.epTitle}>{file.name}</span>
                        <button className={styles.playButton} onClick={() => handlePlayEpisode(file.path)}>
                          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : episodes.length > 0 ? (
                episodes.map((ep) => {
                  const status = getEpisodeStatus(ep);
                  return (
                    <div key={ep.mal_id} className={styles.episodeItem}>
                      <div className={styles.epMainInfo}>
                        <span className={styles.epNumber}>Ep. {ep.mal_id}</span>
                        <div className={styles.epTitleContainer}>
                          <span className={styles.epTitle}>{ep.title}</span>
                          {status.file && (
                            <button className={styles.playButton} onClick={() => handlePlayEpisode(status.file.path)}>
                              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={styles.epMeta}>
                        <span className={styles.epDate}>
                          {ep.aired ? new Date(ep.aired).toLocaleDateString() : "TBA"}
                        </span>
                        <span className={`${styles.epStatus} ${status.class}`}>{status.label}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className={styles.noEpisodes}>No hay lista de episodios disponible.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {showLinkModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h2>Vincular carpeta: {folderName}</h2>
              <button onClick={() => setShowLinkModal(false)}>✕</button>
            </header>
            <div className={styles.modalSearch}>
              <input
                type="text"
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                placeholder="Buscar nombre del anime..."
              />
              <button onClick={handleSearchLink} disabled={isSearching}>
                {isSearching ? "BUSCANDO..." : "BUSCAR"}
              </button>
            </div>
            <div className={styles.modalResults}>
              {searchResults.map((res) => (
                <div key={res.mal_id} className={styles.resultItem} onClick={() => handleSelectLink(res)}>
                  <img src={res.images.jpg.small_image_url} alt="" />
                  <div className={styles.resultInfo}>
                    <h4>{res.title}</h4>
                    <p>
                      {res.type} • {res.episodes} EPS • {res.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnimeDetails;
