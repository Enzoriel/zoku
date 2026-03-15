import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { getAnimeDetails, searchAnime } from "../services/api";
import { openFile, isPlayerStillOpen } from "../services/fileSystem";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { calculateUserStatus } from "../utils/animeStatus";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import styles from "./AnimeDetails.module.css";

// El episodio se marca como visto automáticamente tras 1 minuto de reproducción
const WATCH_TIMER_MS = 60 * 1000; 

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const folderName = searchParams.get("folder");

  const { data, setMyAnimes } = useStore();

  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [playingEp, setPlayingEp] = useState(null); // epNumber que tiene el timer activo

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Derivados de estado (Movidos arriba para evitar ReferenceError en closures)
  const animeId = anime?.malId || anime?.mal_id;
  const storedAnime = animeId ? data?.myAnimes?.[animeId] : null;
  const isInLibrary = storedAnime != null;
  const watchedEpisodes = storedAnime?.watchedEpisodes || anime?.watchedEpisodes || [];

  // Guardamos el ref del intervalo para poder cancelarlo
  const watchIntervalRef = useRef(null);
  const watchStartTimeRef = useRef(null);



  const markEpisode = useCallback(
    async (animeId, epNumber, watched) => {
      await setMyAnimes((prev) => {
        const current = prev[animeId];
        if (!current) return prev;

        const watchedEps = Array.isArray(current.watchedEpisodes)
          ? [...current.watchedEpisodes]
          : [];

        let newWatched;
        let newHistory = Array.isArray(current.watchHistory) ? [...current.watchHistory] : [];

        if (watched) {
          if (!watchedEps.includes(epNumber)) watchedEps.push(epNumber);
          newHistory.push({ episode: epNumber, watchedAt: new Date().toISOString() });
        } else {
          newWatched = watchedEps.filter((n) => n !== epNumber);
          newHistory = newHistory.filter((h) => h.episode !== epNumber);
        }

        const finalWatched = watched ? watchedEps : newWatched;
        const lastEp = finalWatched.length > 0 ? Math.max(...finalWatched) : 0;
        
        let completionDate = current.completedAt;
        if (watched && lastEp >= (current.totalEpisodes || 0) && current.totalEpisodes > 0) {
          completionDate = new Date().toISOString();
        }

        // Creamos un objeto temporal para calcular el estado
        const tempAnime = { ...current, watchedEpisodes: finalWatched, watchHistory: newHistory };
        const nextStatus = calculateUserStatus(tempAnime);

        return {
          ...prev,
          [animeId]: {
            ...current,
            watchedEpisodes: finalWatched,
            lastEpisodeWatched: lastEp,
            watchHistory: newHistory,
            userStatus: nextStatus,
            completedAt: completionDate,
            lastUpdated: new Date().toISOString(),
          },
        };
      });

      // Actualizar estado local del anime para que la UI se refresque inmediatamente
      setAnime((prev) => {
        if (!prev) return prev;
        const watchedEps = Array.isArray(prev.watchedEpisodes) ? [...prev.watchedEpisodes] : [];
        let finalWatched;
        if (watched) {
          finalWatched = watchedEps.includes(epNumber) ? watchedEps : [...watchedEps, epNumber];
        } else {
          finalWatched = watchedEps.filter((n) => n !== epNumber);
        }
        return {
          ...prev,
          watchedEpisodes: finalWatched,
          lastEpisodeWatched: finalWatched.length > 0 ? Math.max(...finalWatched) : 0,
        };
      });
    },
    [setMyAnimes],
  );

  const handleUpdateVault = useCallback(
    async (property, value) => {
      if (!animeId) return;
      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: {
          ...prev[animeId],
          [property]: value,
          lastUpdated: new Date().toISOString(),
        }
      }));
      setAnime(prev => ({ ...prev, [property]: value }));
    },
    [animeId, setMyAnimes],
  );



  const handlePlayEpisode = useCallback(
    async (epNumber, filePath) => {
      if (!filePath) return;
      const ok = await openFile(filePath);
      if (!ok) {
        alert("No se pudo abrir el archivo. Verifica que el reproductor esté configurado.");
        return;
      }

      // Cancelar rastreo anterior si lo había
      if (watchIntervalRef.current) {
        clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = null;
        setPlayingEp(null);
      }

      // Solo iniciar timer si el anime está en la biblioteca
      const animeId = anime?.malId || anime?.mal_id;
      if (!animeId || !data?.myAnimes?.[animeId]) return;

      setPlayingEp(epNumber);
      watchStartTimeRef.current = Date.now();
      
      watchIntervalRef.current = setInterval(async () => {
        const player = data?.settings?.player || "mpv";
        const stillOpen = await isPlayerStillOpen(player);

        if (!stillOpen) {
          // Si el reproductor se cerró antes de tiempo, cancelamos todo inmediatamente
          console.log(`[Timer] Reproductor cerrado. Cancelando marcado de Ep ${epNumber}`);
          clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setPlayingEp(null);
          return;
        }

        const elapsed = Date.now() - watchStartTimeRef.current;
        if (elapsed >= WATCH_TIMER_MS) {
          // Si pasó el tiempo y sigue abierto, marcamos como visto
          console.log(`[Timer] 60s alcanzados con reproductor abierto. Marcando Ep ${epNumber}`);
          clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setPlayingEp(null);
          await markEpisode(animeId, epNumber, true);
        }
      }, 5000); // Verificamos cada 5 segundos
    },
    [anime, data?.myAnimes, data?.settings?.player, markEpisode],
  );

  const handleCancelPlay = useCallback(() => {
    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
    setPlayingEp(null);
  }, []);

  // Limpiar intervalo al desmontar
  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);



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
        totalEpisodes: animeData.episodes,
        episodeList: animeData.episodeList,
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
          storedAnime = Object.values(data.myAnimes).find(
            (a) => a.folderName === folderName || a.title === folderName,
          );
        }

        if (storedAnime && storedAnime.synopsis && storedAnime.episodeList) {
          setAnime(storedAnime);
        } else if (id && id !== "null" && id !== "undefined") {
          const animeData = await getAnimeDetails(id);
          setAnime(animeData);
          if (data.myAnimes[id]) {
            const updated = await persistAnimeData(animeData);
            setAnime(updated);
          }
        } else {
          setAnime({
            title: folderName || "Serie Desconocida",
            status: "Local Only",
            isUnknown: true,
            episodeList: [],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, folderName]);



  const handleAddToLibrary = async () => {
    if (!anime) return;
    const animeId = anime.mal_id || anime.malId;
    await setMyAnimes((prev) => ({
      ...prev,
      [animeId]: {
        ...(prev[animeId] || {}),
        malId: animeId,
        title: anime.title,
        coverImage: anime.images?.jpg?.large_image_url || anime.coverImage,
        totalEpisodes: anime.episodes || 0,
        episodeList: anime.episodeList || [],
        episodeDuration: anime.duration || "24 min",
        status: anime.status,
        watchedEpisodes: [],
        lastEpisodeWatched: 0,
        watchHistory: [],
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
    }));
  };

  const handleUpdateMetadata = async () => {
    const animeId = anime?.malId || anime?.mal_id;
    if (!animeId) return;
    setIsUpdating(true);
    try {
      const animeData = await getAnimeDetails(animeId);
      const updated = await persistAnimeData(animeData);
      setAnime(updated);
    } catch (err) {
      console.error("Error al actualizar:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveLink = async () => {
    if (!animeId) return;
    if (window.confirm("¿Estás seguro de que quieres desvincular este anime? Volverá a aparecer como serie local y se perderán los metadatos de la API.")) {
      const newMyAnimes = { ...data.myAnimes };
      // Opcional: Podríamos borrarlo de myAnimes o simplemente quitar el folderName
      // Para un "desvincular" real, deberíamos borrar la entrada si fue creada solo para el vínculo
      delete newMyAnimes[animeId];
      await setMyAnimes(newMyAnimes);
      navigate("/library");
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
      const animeData = {
        malId: fullDetails.malId,
        title: fullDetails.title,
        coverImage: fullDetails.coverImage,
        synopsis: fullDetails.synopsis,
        score: fullDetails.score,
        rank: fullDetails.rank,
        popularity: fullDetails.popularity,
        type: fullDetails.type,
        status: fullDetails.status,
        episodes: fullDetails.episodes,
        totalEpisodes: fullDetails.episodes,
        episodeList: fullDetails.episodeList,
        genres: fullDetails.genres,
        aired: fullDetails.aired,
        // Campos de Bóveda
        userStatus: "PLAN_TO_WATCH",
        userScore: 0,
        notes: "",
        completedAt: null,
        watchedEpisodes: [],
        lastEpisodeWatched: 0,
        watchHistory: [],
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        folderName: folderName,
      };
      await setMyAnimes((prev) => ({ ...prev, [animeData.malId]: animeData }));
      setAnime(animeData);
      setShowLinkModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };



  const animeFilesData = data?.localFiles[anime?.title] || 
                         data?.localFiles[anime?.folderName] || 
                         data?.localFiles[folderName] || 
                         { files: [] };

  const getEpisodeFileMatch = (epNum) => {
    // 1. Intento por número detectado
    const match = animeFilesData.files.find((f) => {
      const detected = extractEpisodeNumber(f.name, [anime?.title, folderName]);
      return detected === epNum;
    });

    if (match) return match;

    // 2. Fallback para Películas: si es Ep 1 y solo hay un archivo, lo usamos
    const isMovie = anime?.type?.toUpperCase() === "MOVIE";
    if (isMovie && epNum === 1 && animeFilesData.files.length === 1) {
      return animeFilesData.files[0];
    }

    return null;
  };




  const getEpisodeStatus = (ep) => {
    const isWatched = watchedEpisodes.includes(ep.mal_id);
    const localFile = getEpisodeFileMatch(ep.mal_id);

    if (anime?.isUnknown) return { label: "LOCAL", type: "local", file: localFile };
    if (isWatched) return { label: "VISTO", type: "watched", file: localFile };
    if (localFile) return { label: "DESCARGADO", type: "downloaded", file: localFile };
    return { label: "PENDIENTE", type: "pending", file: null };
  };

  const handleToggleWatched = async (epNumber, currentlyWatched) => {
    if (!animeId || !storedAnime) return;
    
    // Si hay un rastreo activo para este episodio, cancelarlo
    if (playingEp === epNumber && watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
      setPlayingEp(null);
    }
    await markEpisode(animeId, epNumber, !currentlyWatched);
  };




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

  // Consolidar lista de episodios: API + Archivos locales
  const localEpNumbers = animeFilesData.files
    .map(f => extractEpisodeNumber(f.name, [anime?.title, folderName]))
    .filter(n => n !== null);


  const maxLocalEp = localEpNumbers.length > 0 ? Math.max(...localEpNumbers) : 0;
  const apiEpList = anime.episodeList || [];
  const apiEpCount = apiEpList.length;
  const finalEpCount = Math.max(apiEpCount, maxLocalEp);

  const episodes = Array.from({ length: finalEpCount }, (_, i) => {
    const epNum = i + 1;
    const existing = apiEpList.find(e => e.mal_id === epNum);
    return existing || { mal_id: epNum, title: `Episodio ${epNum}`, aired: null };
  });




  const validWatchedEpisodes = watchedEpisodes.filter(ep => ep <= finalEpCount);
  const validWatchedCount = validWatchedEpisodes.length;
  const hasGhostEpisodes = watchedEpisodes.length > validWatchedCount;

  const handleCleanGhosts = async () => {
    if (!animeId) return;
    await setMyAnimes(prev => {
      const current = prev[animeId];
      if (!current) return prev;
      return {
        ...prev,
        [animeId]: {
          ...current,
          watchedEpisodes: validWatchedEpisodes,
          lastEpisodeWatched: validWatchedCount > 0 ? Math.max(...validWatchedEpisodes) : 0,
          watchHistory: (current.watchHistory || []).filter(h => h.episode <= finalEpCount),
          lastUpdated: new Date().toISOString()
        }
      };
    });
    // Actualizar estado local
    setAnime(prev => ({
      ...prev,
      watchedEpisodes: validWatchedEpisodes
    }));
  };


  return (
    <div className={styles.container}>

      <div className={styles.content}>
        {/* SIDEBAR */}
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
                <button 
                  className={styles.changeLinkButton} 
                  onClick={() => {
                    setShowLinkModal(true);
                    setLinkSearchQuery(anime.title);
                  }}
                >
                  CAMBIAR VÍNCULO
                </button>
                <button className={styles.removeLinkButton} onClick={handleRemoveLink}>
                  DESVINCULAR API
                </button>
                {anime.lastUpdated && (
                  <span className={styles.lastUpdate}>
                    Sinc: {new Date(anime.lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>

            )}
          </div>

          {/* Progreso de visualización */}
          {isInLibrary && (anime.totalEpisodes || 0) > 0 && (
            <div className={styles.progressBox}>
              <div className={styles.progressHeader}>
                <div className={styles.progressTextSide}>
                  <span className={styles.progressLabel}>PROGRESO</span>
                  {hasGhostEpisodes && (
                    <button className={styles.cleanGhostsBtn} onClick={handleCleanGhosts} title="Limpiar episodios que ya no existen">
                      ⚠️ LIMPIAR FANTASMAS
                    </button>
                  )}
                </div>
                <span className={styles.progressFraction}>
                  {validWatchedCount}/{anime.totalEpisodes || episodes.length}
                </span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.round(
                      (validWatchedCount / (anime.totalEpisodes || episodes.length)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          {/* ESTADO EN BÓVEDA */}
          {isInLibrary && (
            <div className={styles.vaultControls}>
              <div className={styles.vaultGrid}>
                <div className={styles.vaultItem}>
                  <label>ESTADO ACTUAL</label>
                  <div className={`${styles.statusBadgeValue} ${styles[calculateUserStatus(anime).toLowerCase()]}`}>
                    {calculateUserStatus(anime) === 'PLAN_TO_WATCH' ? 'PENDIENTE' : 
                     calculateUserStatus(anime) === 'WATCHING' ? 'VIENDO' :
                     calculateUserStatus(anime) === 'COMPLETED' ? 'COMPLETADO' :
                     calculateUserStatus(anime) === 'PAUSED' ? 'EN PAUSA' :
                     calculateUserStatus(anime) === 'DROPPED' ? 'ABANDONADO' : 'EN LISTA'}
                  </div>
                </div>
                <div className={styles.vaultItem}>
                  <label>AÑADIDO EL</label>
                  <div className={styles.vaultValue}>
                    {anime.addedAt ? new Date(anime.addedAt).toLocaleDateString() : "N/A"}
                  </div>
                </div>
              </div>

              {anime.watchHistory && anime.watchHistory.length > 0 && (
                <div className={styles.historySection}>
                  <label>HISTORIAL DE ACCESO</label>
                  <div className={styles.historyList}>
                    {anime.watchHistory.slice(-5).reverse().map((h, i) => (
                      <div key={i} className={styles.historyItem}>
                        <span className={styles.histEp}>EP {h.episode}</span>
                        <span className={styles.histDate}>
                          {new Date(h.watchedAt).toLocaleDateString()} · {new Date(h.watchedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
              <span className={styles.statLabel}>POPULAR</span>
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

        {/* DETALLES */}
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
            <h3 className={styles.sectionTitle}>
              CAPÍTULOS
              <span className={styles.epCountBadge}>
                {animeFilesData.files.length} descargados · {watchedEpisodes.length} vistos
              </span>
            </h3>
            <div className={styles.episodesList}>
              {anime.isUnknown ? (
                animeFilesData.files.map((file, idx) => (
                  <div key={idx} className={`${styles.episodeItem} ${styles.localEp}`}>
                    <div className={styles.epMainInfo}>
                      <span className={styles.epNumber}>#{idx + 1}</span>
                      <div className={styles.epTitleContainer}>
                        <span className={styles.epTitle}>{file.name}</span>
                      </div>
                    </div>
                    <div className={styles.epMeta}>
                      <button
                        className={styles.playButton}
                        onClick={() => handlePlayEpisode(idx + 1, file.path)}
                        title="Reproducir"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              ) : episodes.length > 0 ? (
                episodes.map((ep) => {
                  const status = getEpisodeStatus(ep);
                  const isWatched = status.type === "watched";
                  const isPlaying = playingEp === ep.mal_id;

                  return (
                    <div
                      key={ep.mal_id}
                      className={`${styles.episodeItem} ${isWatched ? styles.episodeWatchedRow : ""} ${isPlaying ? styles.episodePlayingRow : ""}`}
                    >
                      <div className={styles.epMainInfo}>
                        <span className={styles.epNumber}>Ep. {ep.mal_id}</span>
                        <div className={styles.epTitleContainer}>
                          <span className={styles.epTitle}>{ep.title}</span>
                          {isPlaying && (
                            <button 
                              className={styles.timerBadgeBtn} 
                              onClick={handleCancelPlay}
                              title="Cancelar marcado automático"
                            >
                              ⏱ marcando... <span className={styles.cancelLink}>CANCELAR</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={styles.epMeta}>
                        {/* Botón toggle visto */}
                        <button
                          className={`${styles.watchToggle} ${isWatched ? styles.watchToggleWatched : ""}`}
                          onClick={() => handleToggleWatched(ep.mal_id, isWatched)}
                          title={isWatched ? "Quitar de vistos" : "Marcar como visto"}
                        >
                          {isWatched ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </button>

                        {/* Badge de estado */}
                        <span className={`${styles.epStatus} ${styles[status.type]}`}>
                          {status.label}
                        </span>

                        {/* Play si tiene archivo */}
                        {status.file && (
                          <button
                            className={styles.playButton}
                            onClick={() => handlePlayEpisode(ep.mal_id, status.file.path)}
                            title="Reproducir"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </button>
                        )}
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

      {/* MODAL VINCULAR */}
      {showLinkModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h2>Vincular: {folderName}</h2>
              <button onClick={() => setShowLinkModal(false)}>✕</button>
            </header>
            <div className={styles.modalSearch}>
              <input
                type="text"
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchLink()}
                placeholder="Buscar nombre del anime..."
              />
              <button onClick={handleSearchLink} disabled={isSearching}>
                {isSearching ? "..." : "BUSCAR"}
              </button>
            </div>
            <div className={styles.modalResults}>
              {searchResults.map((res) => (
                <div key={res.malId} className={styles.resultItem} onClick={() => handleSelectLink(res)}>
                  <img src={res.images?.jpg?.small_image_url} alt="" />
                  <div className={styles.resultInfo}>
                    <h4>{res.title}</h4>
                    <p>
                      {res.type} · {res.episodes} eps · {res.status}
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
