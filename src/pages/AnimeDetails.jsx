import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { useAnime } from "../context/AnimeContext";
import { openFile, isPlayerStillOpen, normalizeForSearch } from "../services/fileSystem";
import { searchAnime } from "../services/api";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { calculateUserStatus } from "../utils/animeStatus";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ConfirmModal from "../components/ui/ConfirmModal";
import styles from "./AnimeDetails.module.css";

const WATCH_TIMER_MS = 60 * 1000;
const METADATA_REFRESH_DAYS = 7;

function titlesMatch(normalizedTitle, normalizedKey) {
  if (!normalizedTitle || !normalizedKey) return false;
  if (normalizedTitle === normalizedKey) return true;

  const blacklist = ["season", "part", "anime", "2nd", "3rd", "4th", "5th", "s2", "s3", "s4"];

  // Extraemos solo las palabras clave que identifican la serie (excluyendo temporadas/partes/secuelas)
  const getBaseNameWords = (str) =>
    str
      .split(" ")
      .filter((w) => w.length > 2)
      .filter((w) => !blacklist.includes(w));

  const wordsTitle = getBaseNameWords(normalizedTitle);
  const wordsKey = getBaseNameWords(normalizedKey);

  // Si después de limpiar no queda nada (ej: "3rd Season") no podemos confiar en el match automatizado
  if (wordsTitle.length === 0 || wordsKey.length === 0) return false;

  // Comprobamos la coincidencia del "Nombre Base" exclusivamente
  const matches = wordsTitle.filter((w) => wordsKey.includes(w)).length;
  const totalUniqueWords = Math.max(wordsTitle.length, wordsKey.length);
  const baseScore = matches / totalUniqueWords;

  // Exigimos un 80% de coincidencia en el nombre base antes de considerar que es la misma serie
  return baseScore >= 0.8;
}

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
  const [folderSearch, setFolderSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [toast, setToast] = useState(null);

  const [showSearchApiModal, setShowSearchApiModal] = useState(false);
  const [apiSearchQuery, setApiSearchQuery] = useState("");
  const [apiSearchResults, setApiSearchResults] = useState([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  const menuRef = useRef(null);
  const watchIntervalRef = useRef(null);
  const watchStartTimeRef = useRef(null);

  // ─── Reactive data ──────────────────────────────────────────────────────────

  const animeId = useMemo(() => {
    return id && id !== "null" && id !== "undefined" ? id : anime?.malId || anime?.mal_id || null;
  }, [id, anime]);

  const mainAnime = useMemo(() => {
    if (!animeId) {
      if (anime) return { ...anime, malId: null, isInLibrary: false, watchedEpisodes: [] };
      if (folderName)
        return { title: folderName, isUnknown: true, episodeList: [], isInLibrary: false, watchedEpisodes: [] };
      return null;
    }
    const stored = data.myAnimes[animeId];
    if (stored) return { ...stored, malId: animeId, isInLibrary: true, watchedEpisodes: stored.watchedEpisodes || [] };
    const context = getAnimeById(animeId);
    if (context) return { ...context, malId: animeId, isInLibrary: false, watchedEpisodes: [] };
    return anime ? { ...anime, malId: animeId, isInLibrary: false, watchedEpisodes: [] } : null;
  }, [animeId, data.myAnimes, getAnimeById, anime, folderName]);

  const animeFilesData = useMemo(() => {
    if (!mainAnime) return { files: [] };
    if (mainAnime.folderName && data?.localFiles?.[mainAnime.folderName]) return data.localFiles[mainAnime.folderName];
    if (folderName && data?.localFiles?.[folderName]) return data.localFiles[folderName];
    return { files: [] };
  }, [mainAnime, data?.localFiles, folderName]);

  const unlinkedFolders = useMemo(() => {
    return Object.entries(data.localFiles || {})
      .filter(([, f]) => !f.isLinked && !f.isTracking && f.files?.length > 0)
      .map(([key, f]) => ({ key, ...f }));
  }, [data.localFiles]);

  const filteredFolders = useMemo(() => {
    if (!folderSearch.trim()) return unlinkedFolders;
    const q = folderSearch.toLowerCase();
    return unlinkedFolders.filter((f) => f.key.toLowerCase().includes(q));
  }, [unlinkedFolders, folderSearch]);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const dataMyAnimesRef = useRef(data.myAnimes);
  const getAnimeByIdRef = useRef(getAnimeById);
  const setMyAnimesRef = useRef(setMyAnimes);
  useEffect(() => {
    dataMyAnimesRef.current = data.myAnimes;
  }, [data.myAnimes]);
  useEffect(() => {
    getAnimeByIdRef.current = getAnimeById;
  }, [getAnimeById]);
  useEffect(() => {
    setMyAnimesRef.current = setMyAnimes;
  }, [setMyAnimes]);

  const autoRefreshMetadata = useCallback(async (currentAnimeId) => {
    const stored = dataMyAnimesRef.current[currentAnimeId];
    if (!stored) return;
    const lastFetch = stored.lastMetadataFetch;
    const daysSince = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    const isMissingData = !stored.rank || !stored.studios?.length;
    if (daysSince < METADATA_REFRESH_DAYS && !isMissingData) return;
    const apiData = getAnimeByIdRef.current(currentAnimeId);
    if (!apiData) return;
    await setMyAnimesRef.current((prev) => ({
      ...prev,
      [currentAnimeId]: {
        ...prev[currentAnimeId],
        ...apiData,
        lastMetadataFetch: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
    }));
  }, []);

  const lastLoadedId = useRef(null);
  useEffect(() => {
    if (lastLoadedId.current !== id) {
      setLoading(true);
      lastLoadedId.current = id;
    }
    if (!mainAnime && folderName) setAnime({ title: folderName, isUnknown: true, episodeList: [] });
    if (animeId && data.myAnimes[animeId]) autoRefreshMetadata(animeId);
    setLoading(false);
  }, [id, folderName, mainAnime, animeId, autoRefreshMetadata, data.myAnimes]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
  }, []);

  const handleApiSearch = async (queryToSearch) => {
    const q = typeof queryToSearch === "string" ? queryToSearch : apiSearchQuery;
    if (!q.trim()) return;
    setIsSearchingApi(true);
    try {
      const res = await searchAnime(q, 1);
      setApiSearchResults(res.data);
    } catch (err) {
      console.error(err);
      showToast("Error buscando animes en API.", "warn");
    } finally {
      setIsSearchingApi(false);
    }
  };

  const handleAddToLibraryBtnClick = () => {
    if (mainAnime?.isUnknown) {
      const rawName = mainAnime.title || folderName || "";
      const cleanName = rawName
        .replace(/\[.*?\]|\(.*?\)/g, "")
        .replace(/^[-\s]+|[-\s]+$/g, "")
        .replace(/(-\s*\d+(v\d+)?.*)$/i, "")
        .trim();

      setApiSearchQuery(cleanName);
      setShowSearchApiModal(true);
      if (cleanName) {
        handleApiSearch(cleanName);
      }
    } else {
      handleAddToLibrary();
    }
  };

  const handleLinkAndAdd = async (apiAnime) => {
    const newMalId = apiAnime.mal_id || apiAnime.malId;

    // Normalización de datos para que la librería y detalles funcionen
    const animeData = {
      malId: newMalId,
      mal_id: newMalId, // Compatibilidad doble
      title: apiAnime.title || apiAnime.title_english || apiAnime.title_japanese || "Unknown Title",
      coverImage: apiAnime.images?.jpg?.large_image_url || apiAnime.images?.jpg?.image_url || apiAnime.coverImage,
      totalEpisodes: apiAnime.episodes || apiAnime.totalEpisodes || 0,
      type: apiAnime.type || "TV",
      status: apiAnime.status || "Unknown",
      year: apiAnime.year || (apiAnime.aired?.from ? new Date(apiAnime.aired.from).getFullYear() : "N/A"),
      score: apiAnime.score || 0,
      studios: apiAnime.studios || [],
      genres: apiAnime.genres || [],
      duration: apiAnime.duration || "N/A",
      airedDate: apiAnime.aired?.string || "N/A",
      season: apiAnime.season ? apiAnime.season.charAt(0).toUpperCase() + apiAnime.season.slice(1) : "N/A",
      members: apiAnime.members || 0,
      favorites: apiAnime.favorites || 0,
      source: apiAnime.source || "N/A",
      synopsis: apiAnime.synopsis || "Sinopsis no disponible.",
      episodeList: apiAnime.episodeList || [],
      watchedEpisodes: [],
      lastEpisodeWatched: 0,
      userStatus: "PLAN_TO_WATCH",
      notes: "",
      watchHistory: [],
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      lastMetadataFetch: new Date().toISOString(),
      folderName: folderName,
      isInLibrary: true,
    };

    const newMyAnimes = { ...data.myAnimes, [newMalId]: animeData };
    await setMyAnimes(newMyAnimes);
    setShowSearchApiModal(false);
    await performSync(newMyAnimes);
    showToast(`Serie vinculada con éxito.`, "success");
    navigate(`/anime/${newMalId}`);
  };

  const handleAddToLibrary = useCallback(async () => {
    if (!mainAnime || !animeId) return;
    const entry = {
      ...mainAnime,
      ...(data.myAnimes[animeId] || {}),
      malId: animeId,
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      watchedEpisodes: (data.myAnimes[animeId] || {}).watchedEpisodes || [],
      lastEpisodeWatched: (data.myAnimes[animeId] || {}).lastEpisodeWatched || 0,
      watchHistory: (data.myAnimes[animeId] || {}).watchHistory || [],
    };
    if (!entry.userStatus) entry.userStatus = "PLAN_TO_WATCH";

    const normalizedTitle = normalizeForSearch(mainAnime.title);
    const match = Object.entries(data.localFiles).find(([k, v]) => {
      if (v.isLinked) return false;
      return titlesMatch(normalizedTitle, normalizeForSearch(k));
    });
    const newMyAnimes = { ...data.myAnimes, [animeId]: entry };
    if (match) {
      entry.folderName = match[0];
      newMyAnimes[animeId] = entry;
      await setMyAnimes(newMyAnimes);
      await performSync(newMyAnimes);
      showToast(`Vinculado con "${match[0]}"`, "success");
    } else {
      await setMyAnimes(newMyAnimes);
      showToast("Añadido a la lista. No se encontró carpeta local.", "info");
    }
  }, [mainAnime, animeId, data.myAnimes, data.localFiles, setMyAnimes, performSync, showToast]);

  const handleRemoveFromLibrary = useCallback(() => {
    if (!animeId) return;
    setMenuOpen(false);

    const hasProgress = (mainAnime.watchedEpisodes || []).length > 0;
    const hasDownloads = !!mainAnime.folderName;

    const linkedFolder = mainAnime.folderName;

    const performRemoval = async () => {
      const newMyAnimes = { ...data.myAnimes };
      delete newMyAnimes[animeId];
      await setMyAnimes(newMyAnimes);
      await performSync(newMyAnimes);

      // Si tenía carpeta local, volver a la vista de carpeta sin vincular
      if (linkedFolder) {
        navigate(`/anime/null?folder=${encodeURIComponent(linkedFolder)}`, { replace: true });
      } else {
        navigate(-1);
      }
    };

    if (hasProgress || hasDownloads) {
      setConfirmModal({
        title: "¿Quitar de la lista?",
        message: "Se eliminará el progreso pero no tus archivos locales.",
        onConfirm: async () => {
          setConfirmModal(null);
          await performRemoval();
        },
      });
    } else {
      performRemoval();
    }
  }, [animeId, mainAnime?.watchedEpisodes, mainAnime?.folderName, data.myAnimes, setMyAnimes, performSync, navigate]);

  const handleToggleWatched = useCallback(
    async (epNumber, currentlyWatched) => {
      if (!animeId || !mainAnime?.isInLibrary) return;
      await setMyAnimes((prev) => {
        const current = prev[animeId];
        if (!current) return prev;
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
    },
    [animeId, mainAnime?.isInLibrary, setMyAnimes],
  );

  const handlePlayEpisode = useCallback(
    async (epNumber, filePath) => {
      if (!filePath) return;
      const ok = await openFile(filePath);
      if (!ok) {
        showToast("Error al abrir el reproductor.", "warn");
        return;
      }
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
    [animeId, mainAnime?.isInLibrary, data?.settings?.player, showToast, handleToggleWatched],
  );

  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);

  const handleContextMenu = useCallback(
    (e, epNum, isWatched) => {
      e.preventDefault();
      e.stopPropagation();
      if (!mainAnime?.isInLibrary) return;
      setContextMenu({ x: e.clientX, y: e.clientY, epNum, isWatched });
    },
    [mainAnime?.isInLibrary],
  );

  const handleLinkFolder = useCallback(
    async (folderKey) => {
      if (!animeId) return;
      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: { ...prev[animeId], folderName: folderKey, lastUpdated: new Date().toISOString() },
      }));
      setShowLinkFolderModal(false);
      setFolderSearch("");
      await performSync();
      showToast(`Carpeta "${folderKey}" vinculada.`, "success");
    },
    [animeId, setMyAnimes, performSync, showToast],
  );

  // ─── Episode status (4 states) ──────────────────────────────────────────────

  const getEpisodeStatus = useCallback(
    (epNum) => {
      const isWatched = mainAnime?.watchedEpisodes?.includes(epNum);
      const localFile = animeFilesData.files.find(
        (f) => (f.episodeNumber ?? extractEpisodeNumber(f.name, [mainAnime?.title, folderName])) === epNum,
      );
      if (isWatched) return { label: "VISTO", type: "tagWatched", file: localFile };
      if (localFile) return { label: "DESCARGADO", type: "tagDownloaded", file: localFile };

      const st = mainAnime?.status;

      // Si el anime ya terminó, todos están emitidos
      if (st === "Finalizado" || st === "Finished Airing" || st === "FINISHED") {
        return { label: "EMITIDO", type: "tagAired", file: null };
      }

      // Si aún no sale
      if (st === "Próximamente" || st === "NOT_YET_RELEASED" || st === "Not yet aired") {
        return { label: "PRÓXIMO", type: "tagNotAired", file: null };
      }

      // Si está en emisión (o cancelado/en pausa)
      if (mainAnime?.nextAiringEpisode) {
        const nextEp = mainAnime.nextAiringEpisode.episode;
        if (epNum < nextEp) return { label: "EMITIDO", type: "tagAired", file: null };
        return { label: "PRÓXIMO", type: "tagNotAired", file: null };
      }

      // Fallback si no hay nextAiringEpisode pero está en emisión,
      // comparamos si la cantidad total/emitidos conocida de los datos alcanza para este episodio
      const airedEstimate = mainAnime?.episodes || mainAnime?.episodeList?.length || 0;
      if (airedEstimate > 0 && epNum <= airedEstimate) {
        return { label: "EMITIDO", type: "tagAired", file: null };
      }

      return { label: "PRÓXIMO", type: "tagNotAired", file: null };
    },
    [
      mainAnime?.watchedEpisodes,
      mainAnime?.title,
      mainAnime?.status,
      mainAnime?.nextAiringEpisode,
      mainAnime?.episodes,
      mainAnime?.episodeList,
      animeFilesData.files,
      folderName,
    ],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

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
  const watchedCount = mainAnime.watchedEpisodes.length;
  const progressPct = episodes.length > 0 ? (watchedCount / episodes.length) * 100 : 0;
  const isLinked = !!mainAnime.folderName;

  return (
    <div className={styles.container}>
      <div className={styles.contentLayout}>
        {/* SIDEBAR */}
        <aside className={styles.sidebar}>
          <div className={styles.posterWrapper}>
            {mainAnime.coverImage ? (
              <img src={mainAnime.coverImage} className={styles.poster} alt={mainAnime.title} />
            ) : (
              <div className={styles.posterFallback}>DESVINCULADO</div>
            )}
          </div>
          <div className={styles.mainActions} style={{ width: "100%", marginBottom: "16px" }}>
            {!mainAnime.isInLibrary ? (
              <button
                className={`${styles.actionBtn} ${styles.primaryBtn}`}
                style={{ width: "100%" }}
                onClick={handleAddToLibraryBtnClick}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                AÑADIR A LISTA
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button className={`${styles.actionBtn} ${styles.secondaryBtn}`} style={{ flex: 1 }} disabled>
                  ✓ EN BIBLIOTECA
                </button>
                <div className={styles.menuWrapper} ref={menuRef}>
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
                        {isLinked ? "CAMBIAR CARPETA" : "VINCULAR CARPETA"}
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
          <div className={styles.tagsList}>
            {mainAnime.genres?.map((g) => (
              <span key={g.mal_id} className={styles.tag}>
                {g.name}
              </span>
            ))}
          </div>
          <div className={styles.dataGrid}>
            <div className={styles.dataItem} data-label="ESTUDIO">
              <span className={styles.dataValue}>{mainAnime.studios?.map((s) => s.name).join(", ") || "N/A"}</span>
            </div>
            <div className={styles.dataItem} data-label="DURACIÓN">
              <span className={styles.dataValue}>{mainAnime.duration || "N/A"}</span>
            </div>
            <div className={styles.dataItem} data-label="ESTRENO">
              <span className={styles.dataValue}>{mainAnime.airedDate || "N/A"}</span>
            </div>
            <div className={styles.dataItem} data-label="TEMPORADA">
              <span className={styles.dataValue}>{mainAnime.season || "N/A"}</span>
            </div>
            <div className={styles.dataItem} data-label="PUNTUACIÓN">
              <span className={styles.dataValue} style={{ color: "var(--px-yellow)" }}>
                ★ {mainAnime.score || "0.0"}
              </span>
            </div>
            <div className={styles.dataItem} data-label="MIEMBROS">
              <span className={styles.dataValue}>{mainAnime.members ? mainAnime.members.toLocaleString() : "N/A"}</span>
            </div>
            <div className={styles.dataItem} data-label="FAVORITOS">
              <span className={styles.dataValue}>
                ❤ {mainAnime.favorites ? mainAnime.favorites.toLocaleString() : "0"}
              </span>
            </div>
            <div className={styles.dataItem} data-label="ORIGEN">
              <span className={styles.dataValue}>{mainAnime.source || "N/A"}</span>
            </div>
          </div>
          <div className={styles.synopsisBox}>
            <p className={styles.synopsisText}>{mainAnime.synopsis || "Sinopsis no disponible."}</p>
          </div>
        </aside>

        {/* MAIN */}
        <main className={styles.mainContent}>
          <header className={styles.headerArea}>
            <div className={styles.titleContainer}>
              <h1 className={styles.mainTitle}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 40 40"
                  width="18"
                  height="18"
                  className={styles.titleIcon}
                >
                  <polygon
                    points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8"
                    fill="currentColor"
                  />
                  <polygon
                    points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8"
                    transform="translate(20, 20) scale(0.4) translate(-20, -20)"
                    className={styles.titleIconInner}
                  />
                </svg>
                {mainAnime.title}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 40 40"
                  width="18"
                  height="18"
                  className={styles.titleIcon}
                >
                  <polygon
                    points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8"
                    fill="currentColor"
                  />
                  <polygon
                    points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8"
                    transform="translate(20, 20) scale(0.4) translate(-20, -20)"
                    className={styles.titleIconInner}
                  />
                </svg>
              </h1>
              <div className={styles.titleMeta}>
                <span>{mainAnime.type}</span>
                <span className={styles.separator}>•</span>
                <span>{mainAnime.year}</span>
                <span className={styles.separator}>•</span>
                <span className={styles.statusText}>{mainAnime.status}</span>
              </div>
            </div>
          </header>

          <section className={styles.episodesSection}>
            <div className={styles.episodesHeader}>
              <h2 className={styles.episodesTitle}>Lista de Episodios</h2>
              <span className={styles.episodesStats}>
                {watchedCount} / {episodes.length} VISTOS
              </span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <div className={styles.episodesList}>
              {episodes.map((epNum) => {
                const status = getEpisodeStatus(epNum);
                const isPlaying = playingEp === epNum;
                const isPlayable = !!status.file;
                return (
                  <div
                    key={epNum}
                    className={`${styles.episodeCard} ${status.type === "tagWatched" ? styles.episodeCardWatched : ""} ${isPlayable ? styles.episodeCardPlayable : ""} ${!isPlayable && status.type !== "tagNotAired" ? styles.episodeCardNoFile : ""} ${isPlaying ? styles.episodeCardPlaying : ""}`}
                    onClick={() => isPlayable && handlePlayEpisode(epNum, status.file.path)}
                    onContextMenu={(e) => handleContextMenu(e, epNum, status.type === "tagWatched")}
                  >
                    {isPlayable && (
                      <span className={styles.epPlayIcon}>
                        <svg width="40" height="50" viewBox="0 0 70 90" className={styles.playPixel}>
                          <polygon
                            points="
                            0,0
                            12,0 12,6
                            18,6 18,12
                            24,12 24,18
                            30,18 30,24
                            36,24 36,30
                            42,30 42,36
                            48,36 48,42
                            42,42 42,48
                            36,48 36,54
                            30,54 30,60
                            24,60 24,66
                            18,66 18,72
                            12,72 12,78
                            0,78
                          "
                            className={styles.pixelFill}
                          />
                        </svg>
                        <span className={styles.playText}>REPRODUCIR</span>
                      </span>
                    )}
                    <div className={styles.episodeInfo}>
                      <span className={styles.episodeTitle}>
                        {mainAnime.episodeList?.find((e) => e.mal_id === epNum)?.title || `Episodio ${epNum}`}
                      </span>
                      <span className={`${styles.statusTag} ${styles[status.type]}`}>{status.label}</span>
                    </div>
                    {isPlaying && <span className={styles.tagPlaying}>REPRODUCIENDO</span>}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      {/* Context menu (right-click) */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              handleToggleWatched(contextMenu.epNum, contextMenu.isWatched);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {contextMenu.isWatched ? "MARCAR COMO NO VISTO" : "MARCAR COMO VISTO"}
          </button>
        </div>
      )}

      {/* Link folder modal */}
      {showLinkFolderModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setShowLinkFolderModal(false);
            setFolderSearch("");
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.sectionTitle}>{isLinked ? "CAMBIAR CARPETA" : "VINCULAR CARPETA"}</h3>
            <input
              type="text"
              className={styles.folderSearchInput}
              placeholder="Buscar carpeta..."
              value={folderSearch}
              onChange={(e) => setFolderSearch(e.target.value)}
              autoFocus
            />
            <div className={styles.folderList}>
              {filteredFolders.length === 0 && (
                <p className={styles.emptyFolderText}>No hay carpetas sin vincular disponibles.</p>
              )}
              {filteredFolders.map((f) => (
                <div key={f.key} className={styles.folderItem} onClick={() => handleLinkFolder(f.key)}>
                  <span className={styles.folderName}>{f.key}</span>
                  <span className={styles.folderEpCount}>{f.files?.length || 0} archivos</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search API Modal para vincular la carpeta */}
      {showSearchApiModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setShowSearchApiModal(false);
            setApiSearchResults([]);
          }}
        >
          <div className={`${styles.modal} ${styles.apiSearchModal}`} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.sectionTitle}>BUSCAR EN LA RED</h3>
            <div className={styles.apiSearchForm}>
              <input
                type="text"
                className={styles.apiSearchInput}
                placeholder="Nombre del anime..."
                value={apiSearchQuery}
                onChange={(e) => setApiSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApiSearch()}
                autoFocus
              />
              <button
                className={`${styles.actionBtn} ${styles.primaryBtn} ${styles.apiSearchBtn}`}
                onClick={handleApiSearch}
                disabled={isSearchingApi}
              >
                {isSearchingApi ? "..." : "BUSCAR"}
              </button>
            </div>

            <div className={styles.apiResultList}>
              {apiSearchResults.length === 0 && !isSearchingApi && (
                <p className={styles.emptyFolderText}>No hay resultados para mostrar.</p>
              )}
              {apiSearchResults.map((animeResult) => (
                <div
                  key={animeResult.mal_id}
                  className={styles.apiResultItem}
                  onClick={() => handleLinkAndAdd(animeResult)}
                >
                  <img src={animeResult.images?.jpg?.small_image_url} className={styles.apiResultThumb} alt="" />
                  <div className={styles.apiResultInfo}>
                    <span className={styles.apiResultTitle}>{animeResult.title}</span>
                    <span className={styles.apiResultMeta}>
                      {animeResult.type} • {animeResult.episodes || "?"} EPS • {animeResult.status}
                    </span>
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

      {toast && (
        <div className={styles.toast} data-type={toast.type}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default AnimeDetails;
