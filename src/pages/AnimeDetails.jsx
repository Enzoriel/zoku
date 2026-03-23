import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { searchAnime } from "../services/api";
import { openFile, isPlayerStillOpen, normalizeForSearch } from "../services/fileSystem";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { calculateUserStatus } from "../utils/animeStatus";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ConfirmModal from "../components/ui/ConfirmModal";
import styles from "./AnimeDetails.module.css";
import { useAnime } from "../context/AnimeContext";

const WATCH_TIMER_MS = 60 * 1000;
const METADATA_REFRESH_DAYS = 7;

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const folderName = searchParams.get("folder");

  const { data, setMyAnimes } = useStore();
  const { getAnimeById } = useAnime();
  const { performSync } = useLibrary();

  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playingEp, setPlayingEp] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLinkFolderModal, setShowLinkFolderModal] = useState(false);
  const [toast, setToast] = useState(null); // { message, type: 'info' | 'success' | 'warn' }

  // Modal vincular desde Library (carpeta sin vincular busca anime)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const menuRef = useRef(null);
  const animeId = anime?.malId || anime?.mal_id;
  const storedAnime = animeId ? data?.myAnimes?.[animeId] : null;
  const isInLibrary = storedAnime != null;
  const watchedEpisodes = storedAnime?.watchedEpisodes || anime?.watchedEpisodes || [];

  const watchIntervalRef = useRef(null);
  const watchStartTimeRef = useRef(null);

  // Carpetas sin vincular disponibles para vincular
  const unlinkedFolders = Object.entries(data.localFiles || {})
    .filter(([, f]) => !f.isLinked && !f.isTracking && f.files?.length > 0)
    .map(([key, f]) => ({ key, ...f }));

  // Cerrar menú al click fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (message, type = "info") => setToast({ message, type });

  const markEpisode = useCallback(
    async (animeId, epNumber, watched) => {
      await setMyAnimes((prev) => {
        const current = prev[animeId];
        if (!current) return prev;

        const watchedEps = Array.isArray(current.watchedEpisodes) ? [...current.watchedEpisodes] : [];
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

      setAnime((prev) => {
        if (!prev) return prev;
        const watchedEps = Array.isArray(prev.watchedEpisodes) ? [...prev.watchedEpisodes] : [];
        const finalWatched = watched
          ? watchedEps.includes(epNumber)
            ? watchedEps
            : [...watchedEps, epNumber]
          : watchedEps.filter((n) => n !== epNumber);
        return {
          ...prev,
          watchedEpisodes: finalWatched,
          lastEpisodeWatched: finalWatched.length > 0 ? Math.max(...finalWatched) : 0,
        };
      });
    },
    [setMyAnimes],
  );

  const handlePlayEpisode = useCallback(
    async (epNumber, filePath) => {
      if (!filePath) return;
      const ok = await openFile(filePath);
      if (!ok) {
        showToast("No se pudo abrir el archivo. Verifica que el reproductor esté configurado.", "warn");
        return;
      }

      if (watchIntervalRef.current) {
        clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = null;
        setPlayingEp(null);
      }

      const animeId = anime?.malId || anime?.mal_id;
      if (!animeId || !data?.myAnimes?.[animeId]) return;

      setPlayingEp(epNumber);
      watchStartTimeRef.current = Date.now();

      watchIntervalRef.current = setInterval(async () => {
        const player = data?.settings?.player || "mpv";
        const stillOpen = await isPlayerStillOpen(player);

        if (!stillOpen) {
          clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setPlayingEp(null);
          return;
        }

        const elapsed = Date.now() - watchStartTimeRef.current;
        if (elapsed >= WATCH_TIMER_MS) {
          clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setPlayingEp(null);
          await markEpisode(animeId, epNumber, true);
        }
      }, 5000);
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

  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);

  const lastLoadedId = useRef(id);
  const myAnimesRef = useRef(data.myAnimes);
  useEffect(() => {
    myAnimesRef.current = data.myAnimes;
  }, [data.myAnimes]);
  const getAnimeByIdRef = useRef(getAnimeById);
  useEffect(() => {
    getAnimeByIdRef.current = getAnimeById;
  }, [getAnimeById]);

  // Auto-refresh metadatos si tienen más de 7 días
  const autoRefreshMetadata = useCallback(
    async (currentAnimeId) => {
      const stored = myAnimesRef.current[currentAnimeId];
      if (!stored) return;
      const lastFetch = stored.lastMetadataFetch;
      const daysSince = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
      if (daysSince < METADATA_REFRESH_DAYS) return;

      const apiData = getAnimeByIdRef.current(currentAnimeId);
      if (!apiData) return;

      await setMyAnimes((prev) => ({
        ...prev,
        [currentAnimeId]: {
          ...prev[currentAnimeId],
          title: apiData.title,
          coverImage: apiData.images?.jpg?.large_image_url || apiData.coverImage,
          synopsis: apiData.synopsis,
          score: apiData.score,
          rank: apiData.rank,
          status: apiData.status,
          episodes: apiData.episodes,
          totalEpisodes: apiData.episodes,
          genres: apiData.genres,
          lastMetadataFetch: new Date().toISOString(),
        },
      }));
    },
    [setMyAnimes],
  );

  useEffect(() => {
    const loadInitialData = () => {
      if (lastLoadedId.current !== id) {
        setLoading(true);
        lastLoadedId.current = id;
      }

      let currentAnime = null;
      if (id && id !== "null" && id !== "undefined") {
        currentAnime = myAnimesRef.current[id] || getAnimeByIdRef.current(id);
      } else if (folderName) {
        currentAnime = Object.values(myAnimesRef.current).find(
          (a) => a.folderName === folderName || a.title === folderName,
        );
      }

      if (currentAnime) {
        setAnime(currentAnime);
        // Auto-refresh silencioso si está en la biblioteca
        if (myAnimesRef.current[id]) {
          autoRefreshMetadata(id);
        }
      } else {
        setAnime({
          title: folderName || "Serie Desconocida",
          status: "Local Only",
          isUnknown: true,
          episodeList: [],
        });
      }
      setLoading(false);
    };

    loadInitialData();
  }, [id, folderName, autoRefreshMetadata]);

  // Busca carpetas sin vincular que coincidan con el título del anime
  const findMatchingUnlinkedFolder = (animeTitle) => {
    if (!data.localFiles || !animeTitle) return null;
    const normalizedTitle = normalizeForSearch(animeTitle);
    return Object.entries(data.localFiles).find(([folderKey, folderData]) => {
      if (folderData.isLinked) return false;
      const normalizedFolder = normalizeForSearch(folderKey);
      return (
        normalizedFolder === normalizedTitle ||
        normalizedFolder.includes(normalizedTitle) ||
        normalizedTitle.includes(normalizedFolder)
      );
    });
  };

  const handleAddToLibrary = async () => {
    if (!anime) return;
    const animeId = anime.mal_id || anime.malId;

    const newAnimeEntry = {
      ...(data.myAnimes[animeId] || {}),
      malId: animeId,
      title: anime.title,
      coverImage: anime.images?.jpg?.large_image_url || anime.coverImage,
      totalEpisodes: anime.episodes || 0,
      episodeList: anime.episodeList || [],
      episodeDuration: anime.duration || "24 min",
      status: anime.status,
      type: anime.type,
      genres: anime.genres || [],
      score: anime.score,
      synopsis: anime.synopsis,
      watchedEpisodes: [],
      lastEpisodeWatched: 0,
      watchHistory: [],
      folderName: null,
      lastMetadataFetch: new Date().toISOString(),
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    // Buscar carpeta coincidente antes de guardar
    const match = findMatchingUnlinkedFolder(anime.title);

    if (match) {
      // Caso 2: detecta archivos → vincular automáticamente y notificar
      const [matchedFolderName] = match;
      newAnimeEntry.folderName = matchedFolderName;
      const newMyAnimes = { ...data.myAnimes, [animeId]: newAnimeEntry };
      await setMyAnimes(newMyAnimes);
      setAnime((prev) => ({ ...prev, ...newAnimeEntry }));
      await performSync(newMyAnimes);
      showToast(`Vinculado automáticamente con "${matchedFolderName}"`, "success");
    } else {
      // Caso 1 o 3: sin archivos detectados
      const newMyAnimes = { ...data.myAnimes, [animeId]: newAnimeEntry };
      await setMyAnimes(newMyAnimes);
      setAnime((prev) => ({ ...prev, ...newAnimeEntry }));
      await performSync(newMyAnimes);

      if (unlinkedFolders.length > 0) {
        // Caso 3: hay carpetas pero no coincidió → ofrecer vincular manualmente
        showToast("No se detectaron archivos coincidentes. Podés vincular manualmente desde el menú ···", "warn");
      } else {
        // Caso 1: no hay archivos en absoluto
        showToast("Añadido a tu lista. No se encontraron archivos descargados para esta serie.", "info");
      }
    }
  };

  const handleRemoveFromLibrary = () => {
    if (!animeId) return;
    setMenuOpen(false);
    setConfirmModal({
      title: "¿Quitar de tu lista?",
      message: "El anime se eliminará de tu biblioteca. Tu progreso y los archivos locales no se borrarán.",
      onConfirm: async () => {
        setConfirmModal(null);
        if (watchIntervalRef.current) {
          clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setPlayingEp(null);
        }
        const newMyAnimes = { ...data.myAnimes };
        delete newMyAnimes[animeId];
        await setMyAnimes(newMyAnimes);
        await performSync(newMyAnimes);
      },
    });
  };

  const handleUnlinkFolder = () => {
    if (!animeId || !storedAnime?.folderName) return;
    setMenuOpen(false);
    setConfirmModal({
      title: "¿Desvincular carpeta?",
      message: `La carpeta "${storedAnime.folderName}" se desvinculará. El anime permanece en tu lista pero sin archivos asociados.`,
      onConfirm: async () => {
        setConfirmModal(null);
        const newMyAnimes = {
          ...data.myAnimes,
          [animeId]: { ...data.myAnimes[animeId], folderName: null, lastUpdated: new Date().toISOString() },
        };
        await setMyAnimes(newMyAnimes);
        setAnime((prev) => ({ ...prev, folderName: null }));
        await performSync(newMyAnimes);
      },
    });
  };

  const handleLinkFolder = async (selectedFolderKey) => {
    if (!animeId) return;
    const newMyAnimes = {
      ...data.myAnimes,
      [animeId]: { ...data.myAnimes[animeId], folderName: selectedFolderKey, lastUpdated: new Date().toISOString() },
    };
    await setMyAnimes(newMyAnimes);
    setAnime((prev) => ({ ...prev, folderName: selectedFolderKey }));
    setShowLinkFolderModal(false);
    await performSync(newMyAnimes);
    showToast(`Vinculado con "${selectedFolderKey}"`, "success");
  };

  // Para cuando se llega desde Library (carpeta sin vincular busca anime)
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
    const animeData = {
      ...selectedAnime,
      userStatus: "PLAN_TO_WATCH",
      userScore: 0,
      notes: "",
      completedAt: null,
      watchedEpisodes: [],
      lastEpisodeWatched: 0,
      watchHistory: [],
      folderName: folderName,
      lastMetadataFetch: new Date().toISOString(),
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const newMyAnimes = { ...data.myAnimes, [animeData.malId || animeData.mal_id]: animeData };
    await setMyAnimes(newMyAnimes);
    setAnime(animeData);
    setShowLinkModal(false);
    await performSync(newMyAnimes);
  };

  const handleToggleWatched = async (epNumber, currentlyWatched) => {
    if (!animeId || !storedAnime) return;
    if (playingEp === epNumber && watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
      setPlayingEp(null);
    }
    await markEpisode(animeId, epNumber, !currentlyWatched);
  };

  const animeFilesData = data?.localFiles[storedAnime?.folderName] || data?.localFiles[folderName] || { files: [] };

  const getEpisodeFileMatch = (epNum) => {
    const match = animeFilesData.files.find((f) => {
      const detected = f.episodeNumber ?? extractEpisodeNumber(f.name, [anime?.title, folderName]);
      return detected === epNum;
    });
    if (match) return match;
    const isMovie = anime?.type?.toUpperCase() === "MOVIE";
    if (isMovie && epNum === 1 && animeFilesData.files.length === 1) return animeFilesData.files[0];
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

  const localEpNumbers = animeFilesData.files
    .map((f) => f.episodeNumber ?? extractEpisodeNumber(f.name, [anime?.title, folderName]))
    .filter((n) => n !== null);

  const maxLocalEp = localEpNumbers.length > 0 ? Math.max(...localEpNumbers) : 0;
  const apiEpList = anime.episodeList || [];
  const finalEpCount = Math.max(apiEpList.length, maxLocalEp);

  const episodes = Array.from({ length: finalEpCount }, (_, i) => {
    const epNum = i + 1;
    const existing = apiEpList.find((e) => e.mal_id === epNum);
    return existing || { mal_id: epNum, title: `Episodio ${epNum}`, aired: null };
  });

  const validWatchedEpisodes = watchedEpisodes.filter((ep) => ep <= finalEpCount);
  const validWatchedCount = validWatchedEpisodes.length;
  const hasGhostEpisodes = watchedEpisodes.length > validWatchedCount;

  const handleCleanGhosts = async () => {
    if (!animeId) return;
    await setMyAnimes((prev) => {
      const current = prev[animeId];
      if (!current) return prev;
      return {
        ...prev,
        [animeId]: {
          ...current,
          watchedEpisodes: validWatchedEpisodes,
          lastEpisodeWatched: validWatchedCount > 0 ? Math.max(...validWatchedEpisodes) : 0,
          watchHistory: (current.watchHistory || []).filter((h) => h.episode <= finalEpCount),
          lastUpdated: new Date().toISOString(),
        },
      };
    });
    setAnime((prev) => ({ ...prev, watchedEpisodes: validWatchedEpisodes }));
  };

  return (
    <div className={styles.container}>
      {/* Toast */}
      {toast && <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>{toast.message}</div>}

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

            {/* Acciones bajo el poster */}
            <div className={styles.posterActions}>
              {anime.isUnknown ? (
                <button
                  className={styles.primaryBtn}
                  onClick={() => {
                    setShowLinkModal(true);
                    setLinkSearchQuery(anime.title);
                  }}
                >
                  VINCULAR CON API
                </button>
              ) : !isInLibrary ? (
                <button className={styles.primaryBtn} onClick={handleAddToLibrary}>
                  + AÑADIR A LISTA
                </button>
              ) : (
                <div className={styles.libraryActions}>
                  <span className={styles.inListBadge}>✓ EN TU LISTA</span>
                  {/* Menú 3 puntos */}
                  <div className={styles.menuWrapper} ref={menuRef}>
                    <button className={styles.menuBtn} onClick={() => setMenuOpen((o) => !o)} title="Más opciones">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className={styles.menuDropdown}>
                        <button
                          className={styles.menuItem}
                          onClick={() => {
                            setMenuOpen(false);
                            setShowLinkFolderModal(true);
                          }}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            width="14"
                            height="14"
                          >
                            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                          </svg>
                          {storedAnime?.folderName ? "CAMBIAR CARPETA" : "VINCULAR CAPÍTULOS"}
                        </button>
                        {storedAnime?.folderName && (
                          <button className={styles.menuItem} onClick={handleUnlinkFolder}>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              width="14"
                              height="14"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            DESVINCULAR CARPETA
                          </button>
                        )}
                        <div className={styles.menuDivider} />
                        <button
                          className={`${styles.menuItem} ${styles.menuItemDanger}`}
                          onClick={handleRemoveFromLibrary}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            width="14"
                            height="14"
                          >
                            <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                          QUITAR DE MI LISTA
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progreso */}
          {isInLibrary && (anime.totalEpisodes || 0) > 0 && (
            <div className={styles.progressBox}>
              <div className={styles.progressHeader}>
                <div className={styles.progressTextSide}>
                  <span className={styles.progressLabel}>PROGRESO</span>
                  {hasGhostEpisodes && (
                    <button
                      className={styles.cleanGhostsBtn}
                      onClick={handleCleanGhosts}
                      title="Limpiar episodios que ya no existen"
                    >
                      ⚠️ LIMPIAR
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
                    width: `${Math.round((validWatchedCount / (anime.totalEpisodes || episodes.length)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Estado en bóveda */}
          {isInLibrary && (
            <div className={styles.vaultControls}>
              <div className={styles.vaultGrid}>
                <div className={styles.vaultItem}>
                  <label>ESTADO</label>
                  <div
                    className={`${styles.statusBadgeValue} ${styles[calculateUserStatus(storedAnime || anime).toLowerCase()]}`}
                  >
                    {calculateUserStatus(storedAnime || anime) === "PLAN_TO_WATCH"
                      ? "PENDIENTE"
                      : calculateUserStatus(storedAnime || anime) === "WATCHING"
                        ? "VIENDO"
                        : calculateUserStatus(storedAnime || anime) === "COMPLETED"
                          ? "COMPLETADO"
                          : calculateUserStatus(storedAnime || anime) === "PAUSED"
                            ? "EN PAUSA"
                            : calculateUserStatus(storedAnime || anime) === "DROPPED"
                              ? "ABANDONADO"
                              : "EN LISTA"}
                  </div>
                </div>
                <div className={styles.vaultItem}>
                  <label>AÑADIDO EL</label>
                  <div className={styles.vaultValue}>
                    {storedAnime?.addedAt ? new Date(storedAnime.addedAt).toLocaleDateString() : "N/A"}
                  </div>
                </div>
              </div>

              {storedAnime?.watchHistory && storedAnime.watchHistory.length > 0 && (
                <div className={styles.historySection}>
                  <label>HISTORIAL</label>
                  <div className={styles.historyList}>
                    {storedAnime.watchHistory
                      .slice(-5)
                      .reverse()
                      .map((h, i) => (
                        <div key={i} className={styles.historyItem}>
                          <span className={styles.histEp}>EP {h.episode}</span>
                          <span className={styles.histDate}>
                            {new Date(h.watchedAt).toLocaleDateString()} ·{" "}
                            {new Date(h.watchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
            {storedAnime?.folderName && (
              <div className={styles.infoItem}>
                <strong>Carpeta:</strong>
                <span className={styles.folderTag}>{storedAnime.folderName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Detalles */}
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
                      <button className={styles.playButton} onClick={() => handlePlayEpisode(idx + 1, file.path)}>
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
                            <button className={styles.timerBadgeBtn} onClick={handleCancelPlay}>
                              ⏱ marcando... <span className={styles.cancelLink}>CANCELAR</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={styles.epMeta}>
                        <button
                          className={`${styles.watchToggle} ${isWatched ? styles.watchToggleWatched : ""}`}
                          onClick={() => handleToggleWatched(ep.mal_id, isWatched)}
                        >
                          {isWatched ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              width="14"
                              height="14"
                            >
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </button>
                        <span className={`${styles.epStatus} ${styles[status.type]}`}>{status.label}</span>
                        {status.file && (
                          <button
                            className={styles.playButton}
                            onClick={() => handlePlayEpisode(ep.mal_id, status.file.path)}
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
                <p className={styles.noEpisodes}>No hay episodios disponibles.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal vincular carpeta (menú 3 puntos) */}
      {showLinkFolderModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h2>VINCULAR CAPÍTULOS</h2>
              <button onClick={() => setShowLinkFolderModal(false)}>✕</button>
            </header>
            <div className={styles.modalResults}>
              {unlinkedFolders.length === 0 ? (
                <p className={styles.noEpisodes}>No hay carpetas sin vincular en tu biblioteca.</p>
              ) : (
                unlinkedFolders.map((folder) => (
                  <div key={folder.key} className={styles.resultItem} onClick={() => handleLinkFolder(folder.key)}>
                    <div className={styles.folderResultIcon}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
                      </svg>
                    </div>
                    <div className={styles.resultInfo}>
                      <h4>{folder.key}</h4>
                      <p>{folder.files?.length || 0} archivos detectados</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal vincular con API (desde Library, carpeta sin vincular) */}
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

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

export default AnimeDetails;
