import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { useAnime } from "../context/AnimeContext";
import { openFile, isPlayerStillOpen, normalizeForSearch } from "../services/fileSystem";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { calculateUserStatus } from "../utils/animeStatus";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ConfirmModal from "../components/ui/ConfirmModal";
import styles from "./AnimeDetailsRedesign.module.css";

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
  const [playingEp, setPlayingEp] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLinkFolderModal, setShowLinkFolderModal] = useState(false);
  const [toast, setToast] = useState(null);

  const menuRef = useRef(null);
  const watchIntervalRef = useRef(null);
  const watchStartTimeRef = useRef(null);

  // --- REACTIVE DATA SOURCE (SIN REDUNDANCIA) ---
  const mainAnime = useMemo(() => {
    const aid = id && id !== "null" && id !== "undefined" ? id : (anime?.malId || anime?.mal_id);
    
    // 1. Prioridad: Store (Biblioteca)
    const stored = data.myAnimes[aid] || (aid && data.myAnimes[aid]);
    if (stored) return { 
      ...stored, 
      isInLibrary: true,
      watchedEpisodes: stored.watchedEpisodes || []
    };

    // 2. Prioridad: Contexto (Descubrimiento/Discovery)
    const context = getAnimeById(aid);
    if (context) return { 
      ...context, 
      isInLibrary: false,
      watchedEpisodes: [] 
    };

    // 3. Fallback: Estado local
    return anime ? { 
      ...anime, 
      isInLibrary: false,
      watchedEpisodes: [] 
    } : null;
  }, [id, data.myAnimes, getAnimeById, anime]);

  const animeFilesData = useMemo(() => {
    if (!mainAnime) return { files: [] };
    if (mainAnime.folderName && data?.localFiles?.[mainAnime.folderName]) {
      return data.localFiles[mainAnime.folderName];
    }
    if (folderName && data?.localFiles?.[folderName]) {
      return data.localFiles[folderName];
    }
    return { files: [] };
  }, [mainAnime, data?.localFiles, folderName]);

  const unlinkedFolders = useMemo(() => {
    return Object.entries(data.localFiles || {})
      .filter(([, f]) => !f.isLinked && !f.isTracking && f.files?.length > 0)
      .map(([key, f]) => ({ key, ...f }));
  }, [data.localFiles]);

  // --- EFFECTS ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const lastLoadedId = useRef(id);
  const myAnimesRef = useRef(data.myAnimes);
  const getAnimeByIdRef = useRef(getAnimeById);

  useEffect(() => {
    myAnimesRef.current = data.myAnimes;
    getAnimeByIdRef.current = getAnimeById;
  }, [data.myAnimes, getAnimeById]);

  const autoRefreshMetadata = useCallback(
    async (currentAnimeId) => {
      const stored = data.myAnimes[currentAnimeId];
      if (!stored) return;

      const lastFetch = stored.lastMetadataFetch;
      const daysSince = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / (1000 * 60 * 60 * 24) : Infinity;

      // Refrescamos si han pasado 7 días O si detectamos que faltan campos críticos (RANK/ESTUDIOS)
      // que ahora la API sí proporciona.
      const isMissingData = !stored.rank || !stored.studios?.length;
      if (daysSince < METADATA_REFRESH_DAYS && !isMissingData) return;

      const apiData = getAnimeById(currentAnimeId);
      if (!apiData) return;

      await setMyAnimes((prev) => ({
        ...prev,
        [currentAnimeId]: {
          ...prev[currentAnimeId],
          ...apiData,
          lastMetadataFetch: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        },
      }));
    },
    [data.myAnimes, getAnimeById, setMyAnimes],
  );

  useEffect(() => {
    const loadInitialData = () => {
      if (lastLoadedId.current !== id) {
        setLoading(true);
        lastLoadedId.current = id;
      }

      // Si no hay id o no se encuentra en store/contexto, y hay folderName,
      // creamos un placeholder local para que mainAnime lo use como fallback.
      if (!mainAnime && folderName) {
        setAnime({ title: folderName, isUnknown: true, episodeList: [] });
      }
      
      // Auto-refresh si ya está en la biblioteca
      if (id && data.myAnimes[id]) {
        autoRefreshMetadata(id);
      }

      setLoading(false);
    };
    loadInitialData();
  }, [id, folderName, mainAnime, data.myAnimes, autoRefreshMetadata]);

  // --- ACTIONS ---
  const showToast = (message, type = "info") => setToast({ message, type });

  const handleAddToLibrary = async () => {
    if (!mainAnime) return;
    const animeId = mainAnime.mal_id || mainAnime.malId;
    const newAnimeEntry = {
      ...mainAnime, // Guardamos TODO el objeto que tenemos (API/Context)
      ...(data.myAnimes[animeId] || {}),
      malId: animeId,
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      watchedEpisodes: (data.myAnimes[animeId] || {}).watchedEpisodes || [],
      lastEpisodeWatched: (data.myAnimes[animeId] || {}).lastEpisodeWatched || 0,
      watchHistory: (data.myAnimes[animeId] || {}).watchHistory || [],
    };

    if (!newAnimeEntry.userStatus) {
      newAnimeEntry.userStatus = "PLAN_TO_WATCH";
    }

    const normalizedTitle = normalizeForSearch(mainAnime.title);
    const match = Object.entries(data.localFiles).find(
      ([k, v]) => !v.isLinked && normalizeForSearch(k).includes(normalizedTitle),
    );

    if (match) {
      newAnimeEntry.folderName = match[0];
      const newMyAnimes = { ...data.myAnimes, [animeId]: newAnimeEntry };
      await setMyAnimes(newMyAnimes);
      await performSync(newMyAnimes);
      showToast(`Vinculado con "${match[0]}"`, "success");
    } else {
      const newMyAnimes = { ...data.myAnimes, [animeId]: newAnimeEntry };
      await setMyAnimes(newMyAnimes);
      showToast("Añadido a la lista.", "success");
    }
  };

  const handleRemoveFromLibrary = () => {
    if (!mainAnime?.malId) return;
    setConfirmModal({
      title: "¿Quitar de la lista?",
      message: "Se eliminará el progreso pero no tus archivos locales.",
      onConfirm: async () => {
        setConfirmModal(null);
        const newMyAnimes = { ...data.myAnimes };
        delete newMyAnimes[mainAnime.malId];
        await setMyAnimes(newMyAnimes);
        navigate(-1);
      },
    });
  };

  const handleToggleWatched = async (epNumber, currentlyWatched) => {
    if (!mainAnime?.malId || !mainAnime.isInLibrary) return;
    const animeId = mainAnime.malId;
    await setMyAnimes((prev) => {
      const current = prev[animeId];
      const watchedEps = currentlyWatched
        ? (current.watchedEpisodes || []).filter((n) => n !== epNumber)
        : [...(current.watchedEpisodes || []), epNumber];

      const newHistory = currentlyWatched
        ? (current.watchHistory || []).filter((h) => h.episode !== epNumber)
        : [...(current.watchHistory || []), { episode: epNumber, watchedAt: new Date().toISOString() }];

      const updated = {
        ...current,
        watchedEpisodes: watchedEps,
        watchHistory: newHistory,
        lastUpdated: new Date().toISOString(),
      };
      updated.userStatus = calculateUserStatus(updated);
      return { ...prev, [animeId]: updated };
    });
  };

  const handlePlayEpisode = useCallback(
    async (epNumber, filePath) => {
      if (!filePath) return;
      const ok = await openFile(filePath);
      if (!ok) {
        showToast("Error al abrir el reproductor.", "warn");
        return;
      }

      const animeId = mainAnime?.malId;
      if (!animeId || !mainAnime?.isInLibrary) return;

      setPlayingEp(epNumber);
      watchStartTimeRef.current = Date.now();
      watchIntervalRef.current = setInterval(async () => {
        const stillOpen = await isPlayerStillOpen(data?.settings?.player || "mpv");
        if (!stillOpen) {
          clearInterval(watchIntervalRef.current);
          setPlayingEp(null);
          return;
        }
        if (Date.now() - watchStartTimeRef.current >= WATCH_TIMER_MS) {
          clearInterval(watchIntervalRef.current);
          setPlayingEp(null);
          await handleToggleWatched(epNumber, false);
          showToast(`Episodio ${epNumber} visto`, "success");
        }
      }, 5000);
    },
    [mainAnime, data?.settings?.player],
  );

  const getEpisodeStatus = (epNum) => {
    const isWatched = mainAnime?.watchedEpisodes?.includes(epNum);
    const localFile = animeFilesData.files.find(
      (f) => (f.episodeNumber ?? extractEpisodeNumber(f.name, [mainAnime.title, folderName])) === epNum,
    );
    if (isWatched) return { label: "VISTO", type: "tagWatched", file: localFile };
    if (localFile) return { label: "LOCAL", type: "tagDownloaded", file: localFile };
    return { label: "FALTA", type: "tagMissing", file: null };
  };

  if (loading)
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner size={60} />
      </div>
    );
  if (!mainAnime) return <div className={styles.container}>No encontrado</div>;

  const totalEps = Math.max(
    mainAnime.totalEpisodes || 0,
    mainAnime.episodeList?.length || 0,
    animeFilesData.files.length > 0 ? Math.max(...animeFilesData.files.map((f) => f.episodeNumber || 0)) : 0,
  );
  const episodes = Array.from({ length: totalEps || 1 }, (_, i) => i + 1);

  return (
    <div className={styles.container}>
      {/* Background Cinematic Overlay */}
      <div className={styles.pageBackground}>
        <img src={mainAnime.coverImage} className={styles.bgImage} alt="" />
        <div className={styles.bgOverlay} />
      </div>

      <div className={styles.contentLayout}>
        {/* COLUMNA IZQUIERDA: INFORMACIÓN FIJA */}
        <aside className={styles.sidebar}>
          <div className={styles.posterWrapper}>
            <img src={mainAnime.coverImage} className={styles.poster} alt={mainAnime.title} />
          </div>
          <div className={styles.tagsList}>
            {mainAnime.genres?.map((g) => (
              <span key={g.mal_id} className={styles.tag}>
                {g.name}
              </span>
            ))}
          </div>
          <div className={styles.dataGrid}>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>ESTUDIO</span>
              <span className={styles.dataValue}>{mainAnime.studios?.map((s) => s.name).join(", ") || "N/A"}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>DURACIÓN</span>
              <span className={styles.dataValue}>{mainAnime.duration || "N/A"}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>ESTRENO</span>
              <span className={styles.dataValue}>{mainAnime.airedDate || "N/A"}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>TEMPORADA</span>
              <span className={styles.dataValue}>{mainAnime.season || "N/A"}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>PUNTUACIÓN</span>
              <span className={styles.dataValue} style={{ color: "var(--secondary-color)" }}>
                ★ {mainAnime.score || "0.0"}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>MIEMBROS</span>
              <span className={styles.dataValue}>
                {mainAnime.members ? mainAnime.members.toLocaleString() : "N/A"}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>FAVORITOS</span>
              <span className={styles.dataValue}>
                ❤ {mainAnime.favorites ? mainAnime.favorites.toLocaleString() : "0"}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>ORIGEN</span>
              <span className={styles.dataValue}>{mainAnime.source || "N/A"}</span>
            </div>
          </div>

          <div className={styles.synopsisBox}>
            <span className={styles.sectionTitle}>SINOPSIS</span>
            <p className={styles.synopsisText}>{mainAnime.synopsis || "Sinopsis no disponible."}</p>
          </div>
        </aside>

        {/* COLUMNA DERECHA: TÍTULO Y EPISODIOS */}
        <main className={styles.mainContent}>
          <header className={styles.headerArea}>
            <div className={styles.titleContainer}>
              <h1 className={styles.mainTitle}>{mainAnime.title}</h1>
              <div className={styles.titleMeta}>
                <span>{mainAnime.type}</span>
                <span className={styles.separator}>•</span>
                <span>{mainAnime.year}</span>
                <span className={styles.separator}>•</span>
                <span className={styles.statusText}>{mainAnime.status}</span>
              </div>
            </div>

            <div className={styles.mainActions}>
              {!mainAnime.isInLibrary ? (
                <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={handleAddToLibrary}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  AÑADIR A LISTA
                </button>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button className={`${styles.actionBtn} ${styles.secondaryBtn}`} disabled>
                    ✓ EN BIBLIOTECA
                  </button>
                  <div className={styles.menuWrapper} ref={menuRef} style={{ position: "relative" }}>
                    <button className={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
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
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          VINCULAR CARPETA
                        </button>
                        <button
                          className={`${styles.menuItem} ${styles.menuItemDanger}`}
                          onClick={handleRemoveFromLibrary}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          ELIMINAR DE LISTA
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </header>

          <section className={styles.episodesSection}>
            <div className={styles.episodesHeader}>
              <h2 className={styles.episodesTitle}>Lista de Episodios</h2>
              <span className={styles.episodesStats}>
                {mainAnime.watchedEpisodes.length} / {episodes.length} VISTOS
              </span>
            </div>
            <div className={styles.episodesList}>
              {episodes.map((epNum) => {
                const status = getEpisodeStatus(epNum);
                const isPlaying = playingEp === epNum;
                return (
                  <div
                    key={epNum}
                    className={`${styles.episodeCard} ${status.type === "tagWatched" ? styles.episodeCardWatched : ""}`}
                  >
                    <span className={styles.episodeNumber}>{epNum < 10 ? `0${epNum}` : epNum}</span>
                    <div className={styles.episodeInfo}>
                      <span className={styles.episodeTitle}>
                        {mainAnime.episodeList?.find((e) => e.mal_id === epNum)?.title || `Episodio ${epNum}`}
                      </span>
                      <span className={`${styles.statusTag} ${styles[status.type]}`}>{status.label}</span>
                    </div>
                    <div className={styles.episodeActions}>
                      {isPlaying ? (
                        <button
                          className={styles.tagPlaying}
                          style={{ background: "none", cursor: "pointer" }}
                          onClick={() => setPlayingEp(null)}
                        >
                          REPRODUCIENDO
                        </button>
                      ) : status.file ? (
                        <button
                          className={styles.playBtnSmall}
                          onClick={() => handlePlayEpisode(epNum, status.file.path)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        className={`${styles.watchedToggle} ${status.type === "tagWatched" ? styles.watchedToggleActive : ""}`}
                        onClick={() => handleToggleWatched(epNum, status.type === "tagWatched")}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {showLinkFolderModal && (
        <div className={styles.modalOverlay} onClick={() => setShowLinkFolderModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.sectionTitle}>VINCULAR CARPETA</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              {unlinkedFolders.map((f) => (
                <div
                  key={f.key}
                  className={styles.episodeCard}
                  onClick={() => {
                    setMyAnimes((prev) => ({
                      ...prev,
                      [mainAnime.malId]: { ...prev[mainAnime.malId], folderName: f.key },
                    }));
                    setShowLinkFolderModal(false);
                    showToast("Carpeta vinculada.", "success");
                  }}
                >
                  {f.key}
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
