import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { useAnime } from "../context/AnimeContext";
import { useTorrent } from "../context/TorrentContext";
import { findTorrentMatches } from "../utils/torrentMatch";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import { openFile, isPlayerStillOpen, normalizeForSearch } from "../services/fileSystem";
import { searchAnime } from "../services/api";
import { extractEpisodeNumber } from "../utils/fileParsing";
import { calculateUserStatus } from "../utils/animeStatus";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ConfirmModal from "../components/ui/ConfirmModal";
import TorrentAliasModal from "../components/ui/TorrentAliasModal";
import FolderLinkModal from "../components/ui/FolderLinkModal";
import SearchApiModal from "../components/ui/SearchApiModal";
import { usePlayTracking } from "../hooks/usePlayTracking";
import styles from "./AnimeDetails.module.css";

const WATCH_TIMER_MS = 60 * 1000; // 1 minuto exacto
const METADATA_REFRESH_DAYS = 7;

function titlesMatch(normalizedTitle, normalizedKey) {
  if (!normalizedTitle || !normalizedKey) return false;
  if (normalizedTitle === normalizedKey) return true;
  const blacklist = ["season", "part", "anime", "2nd", "3rd", "4th", "5th", "s2", "s3", "s4"];
  const getBaseNameWords = (str) =>
    str.split(" ").filter((w) => w.length > 2 && !blacklist.includes(w));
  const wordsTitle = getBaseNameWords(normalizedTitle);
  const wordsKey = getBaseNameWords(normalizedKey);
  if (wordsTitle.length === 0 || wordsKey.length === 0) return false;
  const matches = wordsTitle.filter((w) => wordsKey.includes(w)).length;
  const totalUniqueWords = Math.max(wordsTitle.length, wordsKey.length);
  return matches / totalUniqueWords >= 0.8;
}

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const folderName = searchParams.get("folder");

  const { data, setMyAnimes } = useStore();
  const { getAnimeById } = useAnime();
  const { performSync } = useLibrary();
  const { data: torrentData, isLoading: torrentLoading, principalFansub } = useTorrent();

  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLinkFolderModal, setShowLinkFolderModal] = useState(false);
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [toast, setToast] = useState(null);

  const [showSearchApiModal, setShowSearchApiModal] = useState(false);
  const [apiSearchQuery, setApiSearchQuery] = useState("");
  const [apiSearchResults, setApiSearchResults] = useState([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  const [torrentModalOpen, setTorrentModalOpen] = useState(false);
  const [torrentModalItems, setTorrentModalItems] = useState([]);
  const [torrentModalTitle, setTorrentModalTitle] = useState("");

  const menuRef = useRef(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
  }, []);

  const { 
    playingEp, 
    handlePlayEpisode: trackPlay, 
    handleToggleWatched 
  } = usePlayTracking(showToast);

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
    const folderObj = Object.values(data?.localFiles || {}).find((f) => {
      if (f.malId && mainAnime.malId && String(f.malId) === String(mainAnime.malId)) return true;
      if (mainAnime.folderName && f.folderName === mainAnime.folderName) return true;
      if (folderName && f.folderName === folderName) return true;
      return false;
    });
    return folderObj || { files: [] };
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

  const dataMyAnimesRef = useRef(data.myAnimes);
  const getAnimeByIdRef = useRef(getAnimeById);
  const setMyAnimesRef = useRef(setMyAnimes);
  const settingsRef = useRef(data.settings);
  useEffect(() => { dataMyAnimesRef.current = data.myAnimes; }, [data.myAnimes]);
  useEffect(() => { getAnimeByIdRef.current = getAnimeById; }, [getAnimeById]);
  useEffect(() => { setMyAnimesRef.current = setMyAnimes; }, [setMyAnimes]);
  useEffect(() => { settingsRef.current = data.settings; }, [data.settings]);

  const autoRefreshMetadata = useCallback(async (currentAnimeId) => {
    const stored = dataMyAnimesRef.current[currentAnimeId];
    if (!stored) return;
    const lastFetch = stored.lastMetadataFetch;
    const daysSince = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    const isMissingData = !stored.rank && !stored.studios?.length;
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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
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
      if (cleanName) handleApiSearch(cleanName);
    } else {
      handleAddToLibrary();
    }
  };

  const handleLinkAndAdd = async (apiAnime) => {
    const newMalId = apiAnime.mal_id || apiAnime.malId;
    const animeData = {
      malId: newMalId,
      mal_id: newMalId,
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
    await setMyAnimes({ ...data.myAnimes, [newMalId]: animeData });
    setShowSearchApiModal(false);
    await performSync({ ...data.myAnimes, [newMalId]: animeData });
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
      userStatus: "PLAN_TO_WATCH",
    };
    const normalizedTitle = normalizeForSearch(mainAnime.title);
    const match = Object.entries(data.localFiles).find(
      ([k, v]) => !v.isLinked && titlesMatch(normalizedTitle, normalizeForSearch(k)),
    );
    const newMyAnimes = { ...data.myAnimes, [animeId]: entry };
    if (match) {
      entry.folderName = match[0];
      newMyAnimes[animeId] = entry;
      await setMyAnimes(newMyAnimes);
      await performSync(newMyAnimes);
      showToast(`Vinculado con "${match[0]}"`, "success");
    } else {
      await setMyAnimes(newMyAnimes);
      showToast("Añadido a la lista.", "info");
    }
  }, [mainAnime, animeId, data.myAnimes, data.localFiles, setMyAnimes, performSync, showToast]);

  const handleRemoveFromLibrary = useCallback(() => {
    if (!animeId) return;
    setMenuOpen(false);
    const performRemoval = async () => {
      const newMyAnimes = { ...data.myAnimes };
      delete newMyAnimes[animeId];
      await setMyAnimes(newMyAnimes);
      await performSync(newMyAnimes);
      if (mainAnime.folderName)
        navigate(`/anime/null?folder=${encodeURIComponent(mainAnime.folderName)}`, { replace: true });
      else navigate(-1);
    };
    setConfirmModal({
      title: "¿Quitar de la lista?",
      message: "Se eliminará el progreso.",
      onConfirm: async () => {
        setConfirmModal(null);
        await performRemoval();
      },
    });
  }, [animeId, mainAnime?.folderName, data.myAnimes, setMyAnimes, performSync, navigate]);

  const handlePlayEpisode = useCallback(
    (epNumber, filePath) => {
      if (!animeId || !mainAnime?.isInLibrary) return;
      trackPlay(animeId, epNumber, filePath);
    },
    [animeId, mainAnime?.isInLibrary, trackPlay]
  );

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

  const getEpisodeStatus = useCallback(
    (epNum) => {
      const isWatched = mainAnime?.watchedEpisodes?.includes(epNum);
      const localFile = animeFilesData.files.find(
        (f) => (f.episodeNumber ?? extractEpisodeNumber(f.name, [mainAnime?.title, folderName])) === epNum,
      );
      if (isWatched) return { label: "VISTO", type: "tagWatched", file: localFile };
      if (localFile?.isDownloading) return { label: "DESCARGANDO", type: "tagDownloading", file: localFile };
      if (localFile) return { label: "DESCARGADO", type: "tagDownloaded", file: localFile };
      const st = mainAnime?.status;
      if (st === "Finalizado" || st === "Finished Airing" || st === "FINISHED")
        return { label: "EMITIDO", type: "tagAired", file: null };
      if (st === "Próximamente" || st === "NOT_YET_RELEASED" || st === "Not yet aired")
        return { label: "PRÓXIMO", type: "tagNotAired", file: null };
      if (mainAnime?.nextAiringEpisode) {
        const nextEp = mainAnime.nextAiringEpisode.episode;
        if (epNum < nextEp) return { label: "EMITIDO", type: "tagAired", file: null };
        return { label: "PRÓXIMO", type: "tagNotAired", file: null };
      }
      const airedEstimate = mainAnime?.episodes || mainAnime?.episodeList?.length || 0;
      if (airedEstimate > 0 && epNum <= airedEstimate) return { label: "EMITIDO", type: "tagAired", file: null };
      return { label: "PRÓXIMO", type: "tagNotAired", file: null };
    },
    [mainAnime, animeFilesData.files, folderName],
  );

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
  const progressPct = episodes.length > 0 ? (mainAnime.watchedEpisodes.length / episodes.length) * 100 : 0;
  const isLinked = !!mainAnime.folderName;

  return (
    <div className={styles.container}>
      <div className={styles.contentLayout}>
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        {isLinked ? "CAMBIAR CARPETA" : "VINCULAR CARPETA"}
                      </button>
                      <button
                        className={styles.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          setShowAliasModal(true);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        CAMBIAR ALIAS NYAA
                      </button>
                      <button
                        className={`${styles.menuItem} ${styles.menuItemDanger}`}
                        onClick={handleRemoveFromLibrary}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              <span key={g.mal_id || g.name} className={styles.tag}>
                {g.name || g}
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
              <span className={styles.dataValue}>{mainAnime.members?.toLocaleString() || "N/A"}</span>
            </div>
            <div className={styles.dataItem} data-label="FAVORITOS">
              <span className={styles.dataValue}>❤ {mainAnime.favorites?.toLocaleString() || "0"}</span>
            </div>
            <div className={styles.dataItem} data-label="ORIGEN">
              <span className={styles.dataValue}>{mainAnime.source || "N/A"}</span>
            </div>
          </div>
          <div className={styles.synopsisBox}>
            <p className={styles.synopsisText}>{mainAnime.synopsis || "Sinopsis no disponible."}</p>
          </div>
        </aside>
        <main className={styles.mainContent}>
          <header className={styles.headerArea}>
            <div className={styles.titleContainer}>
              <h1 className={styles.mainTitle}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="18" height="18" className={styles.titleIcon}>
                  <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" fill="currentColor" />
                  <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" transform="translate(20, 20) scale(0.4) translate(-20, -20)" className={styles.titleIconInner} />
                </svg>
                {mainAnime.title}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="18" height="18" className={styles.titleIcon}>
                  <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" fill="currentColor" />
                  <polygon points="16,0 24,0 24,8 32,8 32,16 40,16 40,24 32,24 32,32 24,32 24,40 16,40 16,32 8,32 8,24 0,24 0,16 8,16 8,8 16,8" transform="translate(20, 20) scale(0.4) translate(-20, -20)" className={styles.titleIconInner} />
                </svg>
              </h1>
              <div className={styles.titleMeta}>
                <span>{mainAnime.type}</span> • <span>{mainAnime.year}</span> •{" "}
                <span className={styles.statusText}>{mainAnime.status}</span>
              </div>
            </div>
          </header>
          <section className={styles.episodesSection}>
            <div className={styles.episodesHeader}>
              <h2 className={styles.episodesTitle}>Lista de Episodios</h2>
              <span className={styles.episodesStats}>
                {mainAnime.watchedEpisodes.length} / {episodes.length} VISTOS
              </span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <div className={styles.episodesList}>
              {episodes.map((epNum) => {
                const status = getEpisodeStatus(epNum);
                const isPlaying = playingEp?.animeId === (animeId || anime?.mal_id || anime?.malId) && playingEp?.epNumber === epNum;
                const isPlayable = !!status.file && status.type !== "tagDownloading";
                const matches = findTorrentMatches(
                  mainAnime.title,
                  mainAnime.title_english,
                  epNum,
                  torrentData,
                  mainAnime.torrentAlias,
                );
                const hasPrincipalMatch = matches.some((m) => m.fansub === principalFansub);
                return (
                  <div
                    key={epNum}
                    className={`${styles.episodeCard} ${isPlaying ? styles.episodeCardPlaying : ""} ${isPlayable ? styles.episodeCardPlayable : ""}`}
                    onClick={() => isPlayable && handlePlayEpisode(epNum, status.file.path)}
                    onContextMenu={(e) => handleContextMenu(e, epNum, status.type === "tagWatched")}
                  >
                    {isPlayable && !isPlaying && (
                      <span className={styles.epPlayIcon}>
                        <svg width="40" height="50" viewBox="0 0 70 90" className={styles.playPixel}>
                          <polygon points="0,0 12,0 12,6 18,6 18,12 24,12 24,18 30,18 30,24 36,24 36,30 42,30 42,36 48,36 48,42 42,42 42,48 36,48 36,54 30,54 30,60 24,60 24,66 18,66 18,72 12,72 12,78 0,78" className={styles.pixelFill} />
                        </svg>
                        <span className={styles.playText}>REPRODUCIR</span>
                      </span>
                    )}
                    <div className={styles.episodeInfo}>
                      <span className={styles.episodeTitle}>Episodio {epNum}</span>
                      {status.type === "tagWatched" ? (
                        <span className={`${styles.statusTag} ${styles.tagWatched}`}>VISTO</span>
                      ) : (
                        <span className={`${styles.statusTag} ${styles[status.type]}`}>{status.label}</span>
                      )}
                    </div>
                    {isPlaying && <span className={styles.tagPlaying}>REPRODUCIENDO</span>}
                    {principalFansub && !isPlayable && !isPlaying && matches.length > 0 && (
                      <button
                        className={`${styles.torrentBtn} ${hasPrincipalMatch ? styles.torrentBtnPrincipal : styles.torrentBtnAlt}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTorrentModalItems(matches);
                          setTorrentModalTitle(`${mainAnime.title} — EP ${epNum}`);
                          setTorrentModalOpen(true);
                        }}
                      >
                        ⬇ {hasPrincipalMatch ? "Disponible" : "Alternativa"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
      {contextMenu && (
        <div 
          className={styles.contextMenu} 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleWatched(animeId, contextMenu.epNum, contextMenu.isWatched);
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
      <FolderLinkModal
        isOpen={showLinkFolderModal}
        onClose={() => {
          setShowLinkFolderModal(false);
          setFolderSearch("");
        }}
        folderSearch={folderSearch}
        setFolderSearch={setFolderSearch}
        filteredFolders={filteredFolders}
        onLink={handleLinkFolder}
      />
      <SearchApiModal
        isOpen={showSearchApiModal}
        onClose={() => {
          setShowSearchApiModal(false);
          setApiSearchResults([]);
        }}
        query={apiSearchQuery}
        setQuery={setApiSearchQuery}
        results={apiSearchResults}
        onSearch={handleApiSearch}
        onSelect={handleLinkAndAdd}
        isLoading={isSearchingApi}
      />
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
      {showAliasModal && (
        <TorrentAliasModal
          isOpen={showAliasModal}
          onClose={() => setShowAliasModal(false)}
          initialValue={data.myAnimes[animeId]?.torrentAlias || ""}
          onSave={async (newAlias) => {
            await setMyAnimes((prev) => ({
              ...prev,
              [animeId]: { ...prev[animeId], torrentAlias: newAlias, lastUpdated: new Date().toISOString() },
            }));
            showToast("Alias de Nyaa actualizado.", "success");
          }}
        />
      )}
      <TorrentDownloadModal
        isOpen={torrentModalOpen}
        onClose={() => setTorrentModalOpen(false)}
        animeTitle={mainAnime?.title}
        items={torrentModalItems}
        malId={animeId}
        showToast={showToast}
      />
    </div>
  );
}

export default AnimeDetails;
