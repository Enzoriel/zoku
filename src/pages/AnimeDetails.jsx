import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { useAnime } from "../context/AnimeContext";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import { searchAnime } from "../services/api";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { findAnimeFolderCandidates } from "../services/fileSystem";
import ConfirmModal from "../components/ui/ConfirmModal";
import TorrentAliasModal from "../components/ui/TorrentAliasModal";
import FolderLinkModal from "../components/ui/FolderLinkModal";
import SearchApiModal from "../components/ui/SearchApiModal";
import { usePlayback } from "../hooks/usePlayback";
import useSafeAsync from "../hooks/useSafeAsync";
import { AnimeHeader } from "../components/anime/details/AnimeHeader";
import { AnimeSidebar } from "../components/anime/details/AnimeSidebar";
import { EpisodeList } from "../components/anime/details/EpisodeList";
import { METADATA_REFRESH_DAYS, TORRENT_REFRESH_INTERVAL_MS } from "../constants";
import { buildStoredAnimeEntry } from "../utils/animeEntry";
import { getReleasedEpisodeCount, isAnimeActivelyAiring, isAiringMetadataStale } from "../utils/airingStatus";
import { detectNewEpisodeAirDates } from "../utils/recentEpisodes";
import { buildEpisodeFileMap, buildVisibleEpisodeNumbers } from "../utils/episodeFiles";
import { acceptSuggestedFolder, rejectSuggestedFolder, unlinkAnimeFolder } from "../utils/linkingState";
import { getEffectiveTorrentSourceFansub, getFansubConfig } from "../utils/torrentConfig";
import { getBestFolderMatch } from "../utils/libraryView";
import { extractBaseTitle } from "../utils/titleIdentity";
import { useDeleteEpisodes } from "../hooks/useDeleteEpisodes";
import styles from "./AnimeDetails.module.css";

const AIRING_METADATA_REFRESH_MS = 6 * 60 * 60 * 1000;
const NON_SEASON_METADATA_REFRESH_MS = 24 * 60 * 60 * 1000;

function buildSuggestedLinkLabel(folder) {
  if (!folder) return "";
  return folder.folderName || "";
}

function buildFolderApiSearchQuery(value) {
  return extractBaseTitle(value || "")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .trim();
}

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const folderName = searchParams.get("folder");
  const shouldResolveFolder = searchParams.get("resolve") === "1";
  const navigate = useNavigate();

  const { data, setMyAnimes, libraryScopeReady } = useStore();
  const { getAnimeById, getFreshAnimeById, refreshAnimeById, loading: animeLoading } = useAnime();
  const { performSync, localFilesIndex } = useLibrary();
  const {
    principalFansub,
    getItemsForAnime,
    refresh: refreshTorrents,
    isLoading: torrentsLoading,
    lastFetch: torrentsLastFetch,
  } = useTorrent();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const [anime, setAnime] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [showLinkFolderModal, setShowLinkFolderModal] = useState(false);
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [showSearchApiModal, setShowSearchApiModal] = useState(false);
  const [apiSearchQuery, setApiSearchQuery] = useState("");
  const [apiSearchResults, setApiSearchResults] = useState([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const [torrentModalOpen, setTorrentModalOpen] = useState(false);
  const [torrentModalItems, setTorrentModalItems] = useState([]);
  const [selectedDeleteEpisodes, setSelectedDeleteEpisodes] = useState([]);

  const { toast, showToast } = useToast();
  const { safeExecute } = useSafeAsync();
  const { playingEp, playEpisode, toggleEpisodeWatched } = usePlayback();

  const showInfoModal = useCallback((title, message) => {
    setConfirmModal({
      title,
      message,
      confirmLabel: "ENTENDIDO",
      hideCancel: true,
      onConfirm: () => setConfirmModal(null),
      onCancel: () => setConfirmModal(null),
    });
  }, []);

  const animeId = useMemo(() => {
    if (id === "null" || id === "undefined") return null;
    return id || anime?.malId || anime?.mal_id || null;
  }, [id, anime]);

  const storedAnime = data.myAnimes[animeId];
  const mainAnime = useMemo(() => {
    if (!animeId) {
      if (anime) return { ...anime, malId: null, isInLibrary: false, watchedEpisodes: [] };
      if (folderName) {
        return { title: folderName, isUnknown: true, episodeList: [], isInLibrary: false, watchedEpisodes: [] };
      }
      return null;
    }

    if (storedAnime) {
      return { ...storedAnime, malId: animeId, isInLibrary: true, watchedEpisodes: storedAnime.watchedEpisodes || [] };
    }

    const contextAnime = getAnimeById(animeId);
    if (contextAnime) {
      return { ...contextAnime, malId: animeId, isInLibrary: false, watchedEpisodes: [] };
    }

    return anime ? { ...anime, malId: animeId, isInLibrary: false, watchedEpisodes: [] } : null;
  }, [animeId, storedAnime, getAnimeById, anime, folderName]);

  const linkedFolder = useMemo(() => {
    if (!mainAnime) return null;

    if (folderName && !mainAnime.isInLibrary) {
      const explicitFolder = Object.values(data?.localFiles || {}).find((folder) => folder.folderName === folderName);
      if (explicitFolder) return explicitFolder;
    }

    return getBestFolderMatch(mainAnime, data?.localFiles, localFilesIndex);
  }, [mainAnime, data?.localFiles, folderName, localFilesIndex]);

  const animeFilesData = useMemo(() => linkedFolder || { files: [] }, [linkedFolder]);
  const effectiveTorrentFansub = useMemo(
    () => getEffectiveTorrentSourceFansub(mainAnime, principalFansub),
    [mainAnime, principalFansub],
  );
  const torrentData = useMemo(() => getItemsForAnime(mainAnime), [getItemsForAnime, mainAnime]);

  useEffect(() => {
    if (!mainAnime?.isInLibrary || !isAnimeActivelyAiring(mainAnime)) return;
    if (!refreshTorrents || torrentsLoading) return;

    const lastFetchMs = torrentsLastFetch ? Number(torrentsLastFetch) : 0;
    const isStale = !lastFetchMs || Date.now() - lastFetchMs >= TORRENT_REFRESH_INTERVAL_MS;
    if (!isStale) return;

    refreshTorrents();
  }, [mainAnime, refreshTorrents, torrentsLastFetch, torrentsLoading]);

  const candidateFolders = useMemo(() => {
    if (!mainAnime?.malId || !mainAnime?.isInLibrary || mainAnime?.folderName) return [];

    return findAnimeFolderCandidates(mainAnime, data?.localFiles || {}, { onlyWithFiles: true })
      .filter(
        ([folderKey]) =>
          String(mainAnime?.rejectedSuggestion?.folderName || "").toLowerCase() !== folderKey.toLowerCase(),
      )
      .map(([key, folder]) => ({ key, ...folder }));
  }, [mainAnime, data?.localFiles]);

  const suggestedFolder = useMemo(() => {
    if (!mainAnime?.linkSuggestion?.folderName) return null;
    return (
      Object.values(data?.localFiles || {}).find(
        (folder) => folder.folderName === mainAnime.linkSuggestion.folderName,
      ) || null
    );
  }, [mainAnime, data?.localFiles]);

  const unlinkedFolders = useMemo(() => {
    return Object.entries(data.localFiles || {})
      .filter(([, folder]) => !folder.isLinked && !folder.isTracking && folder.files?.length > 0)
      .map(([key, folder]) => ({ key, ...folder }));
  }, [data.localFiles]);

  const filteredFolders = useMemo(() => {
    if (!folderSearch.trim()) return unlinkedFolders;
    const query = folderSearch.toLowerCase();
    return unlinkedFolders.filter((folder) => folder.key.toLowerCase().includes(query));
  }, [unlinkedFolders, folderSearch]);

  const libraryNotice = useMemo(() => {
    if (!mainAnime?.isInLibrary) return null;

    if (mainAnime.folderName && !linkedFolder) {
      return {
        tone: "warn",
        message: "La carpeta vinculada ya no existe. Revisa la vinculacion manualmente.",
        actionLabel: "Vincular manualmente",
      };
    }

    if (candidateFolders.length > 1) {
      return {
        tone: "warn",
        message: "Se encontraron varias carpetas posibles. Debes elegir una manualmente.",
        actionLabel: "Elegir carpeta",
      };
    }

    if (suggestedFolder) {
      return {
        tone: "info",
        message: `Se detecto una carpeta sugerida: ${buildSuggestedLinkLabel(suggestedFolder)}.`,
        actionLabel: "Revisar sugerencia",
      };
    }

    if (mainAnime.rejectedSuggestion?.folderName && !mainAnime.folderName) {
      return {
        tone: "info",
        message: "La sugerencia anterior fue descartada. La serie sigue en seguimiento sin archivos asociados.",
        actionLabel: "Vincular manualmente",
      };
    }

    if (!mainAnime.folderName) {
      return {
        tone: "info",
        message: "No se encontraron archivos locales vinculados para esta serie.",
        actionLabel: "Vincular carpeta",
      };
    }

    return null;
  }, [mainAnime, linkedFolder, candidateFolders, suggestedFolder]);

  const dataMyAnimesRef = useRef(data.myAnimes);
  const getAnimeByIdRef = useRef(getAnimeById);
  const getFreshAnimeByIdRef = useRef(getFreshAnimeById);

  useEffect(() => {
    dataMyAnimesRef.current = data.myAnimes;
  }, [data.myAnimes]);

  useEffect(() => {
    getAnimeByIdRef.current = getAnimeById;
  }, [getAnimeById]);

  useEffect(() => {
    getFreshAnimeByIdRef.current = getFreshAnimeById;
  }, [getFreshAnimeById]);

  useEffect(() => {
    if (animeId && !Number.isNaN(Number(animeId))) {
      const stored = data.myAnimes[animeId];
      if (stored) {
        setAnime(stored);
        return;
      }

      const found = getAnimeById(animeId);
      if (found) {
        setAnime(found);
      }
    }
  }, [animeId, data.myAnimes, getAnimeById]);

  const autoRefreshMetadata = useCallback(async (currentAnimeId) => {
    try {
      const stored = dataMyAnimesRef.current[currentAnimeId];
      if (!stored) return;

      const lastFetch = stored.lastMetadataFetch;
      const now = Date.now();
      const lastFetchAt = lastFetch ? new Date(lastFetch).getTime() : 0;
      const ageMs = lastFetchAt > 0 ? now - lastFetchAt : Infinity;
      const daysSince = ageMs / (1000 * 60 * 60 * 24);
      const isMissingData = !stored.rank && !stored.studios?.length;
      const isAiring = isAnimeActivelyAiring(stored);
      const hasFreshContext = Boolean(getFreshAnimeByIdRef.current(currentAnimeId));
      const staleAiringData = isAiringMetadataStale(stored, now);
      const needsScheduledRefresh = isAiring ? ageMs >= AIRING_METADATA_REFRESH_MS : daysSince >= METADATA_REFRESH_DAYS;
      const needsOffSeasonRetry = !hasFreshContext && ageMs >= NON_SEASON_METADATA_REFRESH_MS;

      if (!isMissingData && !staleAiringData && !needsScheduledRefresh && !needsOffSeasonRetry) {
        return;
      }

      let apiData = getFreshAnimeByIdRef.current(currentAnimeId);
      const shouldQueryApi =
        isMissingData ||
        staleAiringData ||
        needsScheduledRefresh ||
        needsOffSeasonRetry ||
        (!hasFreshContext && isAiring);

      if (shouldQueryApi) {
        const refreshedData = await refreshAnimeById(currentAnimeId, {
          force: true,
          anilistId: stored.anilistId,
        });
        if (refreshedData) {
          apiData = refreshedData;
        }
      }
      if (!apiData) {
        apiData = getFreshAnimeByIdRef.current(currentAnimeId);
      }
      if (!apiData) {
        apiData = getAnimeByIdRef.current(currentAnimeId);
      }
      if (!apiData) return;

      const {
        watchedEpisodes,
        watchHistory,
        userStatus,
        folderName: persistedFolderName,
        torrentAlias,
        addedAt,
        notes,
        completedAt,
        isInLibrary,
        ...safeApiData
      } = apiData;

      await setMyAnimes((prev) => {
        const stored = prev[currentAnimeId];
        const mergedForCount = { ...stored, ...safeApiData };
        const updatedAirDates = detectNewEpisodeAirDates(stored, mergedForCount);

        return {
          ...prev,
          [currentAnimeId]: {
            ...stored,
            ...safeApiData,
            episodeAirDates: updatedAirDates,
            lastMetadataFetch: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
        };
      });
    } catch (error) {
      console.error("[AnimeDetails] Error en auto-refresh de metadata:", error);
    }
  }, [refreshAnimeById, setMyAnimes]);

  useEffect(() => {
    if (!mainAnime && folderName) {
      setAnime({ title: folderName, isUnknown: true, episodeList: [] });
    }

    if (animeId && dataMyAnimesRef.current[animeId]) {
      autoRefreshMetadata(animeId);
    }
  }, [folderName, mainAnime, animeId, autoRefreshMetadata]);

  useEffect(() => {
    if (!data.folderPath || !libraryScopeReady) return;
    if (!animeId && !folderName) return;
    performSync();
  }, [animeId, folderName, data.folderPath, libraryScopeReady, performSync]);

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

  useEffect(() => {
    if (selectedDeleteEpisodes.length === 0) return;

    const clearOnLeftPointerDown = (event) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("[data-selection-context-menu]")) return;
      setContextMenu(null);
      setSelectedDeleteEpisodes([]);
    };

    document.addEventListener("pointerdown", clearOnLeftPointerDown);
    return () => document.removeEventListener("pointerdown", clearOnLeftPointerDown);
  }, [selectedDeleteEpisodes.length]);

  const handleApiSearch = async (queryToSearch) => {
    const query = typeof queryToSearch === "string" ? queryToSearch : apiSearchQuery;
    if (!query.trim()) return;

    setIsSearchingApi(true);
    try {
      await safeExecute(async () => {
        const result = await searchAnime(query, 1);
        setApiSearchResults(result.data);
      }, "Error buscando animes en API.");
    } finally {
      setIsSearchingApi(false);
    }
  };

  useEffect(() => {
    if (!shouldResolveFolder || !folderName || animeId) return;

    const query = buildFolderApiSearchQuery(folderName);
    setApiSearchQuery(query);
    setShowSearchApiModal(true);
    if (query) {
      handleApiSearch(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldResolveFolder, folderName, animeId]);

  const handleAddToLibrary = useCallback(async () => {
    if (!mainAnime || !animeId) return;

    try {
      const entry = buildStoredAnimeEntry(
        {
          ...mainAnime,
          ...(data.myAnimes[animeId] || {}),
        },
        {
          malId: animeId,
          userStatus: data.myAnimes[animeId]?.userStatus || "PLAN_TO_WATCH",
        },
      );

      const newMyAnimes = { ...data.myAnimes, [animeId]: entry };

      await setMyAnimes(newMyAnimes);
      await performSync(newMyAnimes);

      const candidates = findAnimeFolderCandidates(entry, data.localFiles, { onlyWithFiles: true });
      if (candidates.length === 0) {
        showToast("Serie anadida a seguimiento. No se encontraron archivos locales para vincular.", "info");
        return;
      }

      if (candidates.length === 1) {
        showToast("Serie anadida a seguimiento. Se detecto una carpeta sugerida.", "info");
        return;
      }

      showToast("Se encontraron varias carpetas posibles. Vinculala manualmente desde Detalles.", "warn");
    } catch (error) {
      showToast("No se pudo agregar la serie. Intenta de nuevo.", "warn");
    }
  }, [mainAnime, animeId, data.myAnimes, data.localFiles, setMyAnimes, performSync, showToast]);

  const handleAddToLibraryBtnClick = () => {
    if (!mainAnime?.isUnknown) {
      handleAddToLibrary();
      return;
    }

    const cleanName = buildFolderApiSearchQuery(mainAnime.title || folderName || "");

    setApiSearchQuery(cleanName);
    setShowSearchApiModal(true);
    if (cleanName) {
      handleApiSearch(cleanName);
    }
  };

  const handleLinkAndAdd = async (apiAnime) => {
    try {
      const newMalId = apiAnime.mal_id || apiAnime.malId;
      const animeData = buildStoredAnimeEntry(apiAnime, {
        malId: newMalId,
        mal_id: newMalId,
        folderName,
      });

      await setMyAnimes({ ...data.myAnimes, [newMalId]: animeData });

      setShowSearchApiModal(false);
      await performSync({ ...data.myAnimes, [newMalId]: animeData });
      showToast("Serie vinculada con exito.", "success");
      navigate(`/anime/${newMalId}`, { replace: true });
    } catch (error) {
      showToast("No se pudo vincular la serie. Intenta de nuevo.", "warn");
    }
  };

  const handleRemoveFromLibrary = useCallback(() => {
    if (!animeId) return;
    const displayTitle = mainAnime?.title || "este anime";

    const performRemoval = async () => {
      await safeExecute(async () => {
        const newMyAnimes = { ...data.myAnimes };
        delete newMyAnimes[animeId];
        await setMyAnimes(newMyAnimes);
        await performSync(newMyAnimes);
        setAnime(null);
        if (mainAnime.folderName) {
          navigate(`/anime/null?folder=${encodeURIComponent(mainAnime.folderName)}`, { replace: true });
        } else {
          navigate(-1);
        }
      }, "No se pudo eliminar la serie. Intenta de nuevo.");
    };

    setConfirmModal({
      title: "Eliminar de biblioteca",
      message: `Quieres eliminar tambien "${displayTitle}" de tu lista de seguimiento?`,
      onConfirm: async () => {
        setConfirmModal(null);
        await performRemoval();
      },
    });
  }, [animeId, mainAnime?.folderName, mainAnime?.title, data.myAnimes, setMyAnimes, performSync, navigate, safeExecute]);

  const handleUnlinkAnime = useCallback(() => {
    if (!animeId || !mainAnime?.folderName) return;
    const displayTitle = mainAnime?.title || "este anime";

    setConfirmModal({
      title: "Desvincular carpeta",
      message: `"${displayTitle}" dejara de estar vinculada. El anime permanece en tu lista sin archivos asociados.`,
      onConfirm: async () => {
        await safeExecute(async () => {
          const newMyAnimes = {
            ...data.myAnimes,
            [animeId]: unlinkAnimeFolder(data.myAnimes[animeId]),
          };

          await setMyAnimes(newMyAnimes);
          setAnime(newMyAnimes[animeId]);
          setConfirmModal(null);
          await performSync(newMyAnimes);
          navigate(`/anime/${animeId}`, { replace: true });
        }, "No se pudo desvincular la serie. Intenta de nuevo.");
      },
    });
  }, [animeId, mainAnime?.folderName, mainAnime?.title, data.myAnimes, setMyAnimes, performSync, navigate, safeExecute]);

  const handlePlayEpisode = useCallback(
    (epNumber, filePath) => {
      if (!animeId || !mainAnime?.isInLibrary) return;
      playEpisode({
        animeId,
        episodeNumber: epNumber,
        filePath,
        candidateFiles: animeFilesData.files,
      });
    },
    [animeFilesData.files, animeId, mainAnime?.isInLibrary, playEpisode],
  );

  const handleContextMenu = useCallback(
    (event, episodeNumbers) => {
      event.preventDefault();
      event.stopPropagation();
      if (!mainAnime?.isInLibrary) return;
      const normalizedEpisodes = Array.from(
        new Set((Array.isArray(episodeNumbers) ? episodeNumbers : [episodeNumbers]).filter(Number.isFinite)),
      ).sort((first, second) => first - second);
      if (normalizedEpisodes.length === 0) return;

      setSelectedDeleteEpisodes(normalizedEpisodes);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        episodeNumbers: normalizedEpisodes,
      });
    },
    [mainAnime?.isInLibrary],
  );

  const handleLinkFolder = useCallback(
    async (folderKey) => {
      if (!animeId) return;

      await safeExecute(async () => {
        await setMyAnimes((prev) => ({
          ...prev,
          [animeId]: acceptSuggestedFolder(prev[animeId], folderKey),
        }));
        setShowLinkFolderModal(false);
        setFolderSearch("");
        await performSync();
        showToast(`Carpeta "${folderKey}" vinculada.`, "success");
      }, "No se pudo vincular la carpeta. Intenta de nuevo.");
    },
    [animeId, setMyAnimes, performSync, showToast, safeExecute],
  );

  const handleAcceptSuggestedLink = useCallback(async () => {
    if (!animeId || !suggestedFolder?.folderName) return;

    await safeExecute(async () => {
      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: acceptSuggestedFolder(prev[animeId], suggestedFolder.folderName),
      }));
      await performSync();
      showToast(`Carpeta "${suggestedFolder.folderName}" vinculada.`, "success");
    }, "No se pudo vincular la carpeta sugerida. Intenta de nuevo.");
  }, [animeId, suggestedFolder, setMyAnimes, performSync, showToast, safeExecute]);

  const handleRejectSuggestedLink = useCallback(async () => {
    if (!suggestedFolder?.folderName) return;
    await safeExecute(async () => {
      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: rejectSuggestedFolder(prev[animeId], suggestedFolder.folderName),
      }));
      await performSync();
      showToast("La sugerencia fue descartada. La serie seguira en seguimiento.", "info");
    }, "No se pudo descartar la sugerencia. Intenta de nuevo.");
  }, [animeId, suggestedFolder, setMyAnimes, performSync, showToast, safeExecute]);

  const apiTotal = Math.max(
    mainAnime?.totalEpisodes || 0,
    getReleasedEpisodeCount(mainAnime),
    mainAnime?.episodeList?.length || 0,
  );
  const episodes = useMemo(
    () => buildVisibleEpisodeNumbers({ apiTotal, files: animeFilesData.files }),
    [apiTotal, animeFilesData.files],
  );
  const episodeFileMap = useMemo(
    () => buildEpisodeFileMap({ episodes, files: animeFilesData.files, mainAnime, folderName }),
    [episodes, animeFilesData.files, mainAnime, folderName],
  );
  const deletableEpisodeEntries = useMemo(
    () =>
      episodes
        .map((epNum) => ({
          epNum,
          files: (episodeFileMap.get(epNum) || []).filter((file) => !file.isDownloading),
        }))
        .filter((entry) => entry.files.length > 0),
    [episodes, episodeFileMap],
  );
  const deletableEpisodeNumbers = useMemo(
    () => deletableEpisodeEntries.map((entry) => entry.epNum),
    [deletableEpisodeEntries],
  );
  const canDeleteFiles = Boolean(mainAnime?.isInLibrary) && deletableEpisodeNumbers.length > 0;

  useEffect(() => {
    setSelectedDeleteEpisodes((prev) => {
      const next = prev.filter((epNum) => deletableEpisodeNumbers.includes(epNum));
      return next.length === prev.length && next.every((value, index) => value === prev[index]) ? prev : next;
    });
  }, [deletableEpisodeNumbers]);

  useEffect(() => {
    if (canDeleteFiles) return;
    setSelectedDeleteEpisodes((prev) => (prev.length > 0 ? [] : prev));
  }, [canDeleteFiles]);

  const closeDeleteSelectionMode = useCallback(() => {
    setSelectedDeleteEpisodes((prev) => (prev.length > 0 ? [] : prev));
  }, []);

  const { requestDeleteEpisodes, isDeletingFiles } = useDeleteEpisodes({
    folderPath: data.folderPath,
    deletableEpisodeEntries,
    animeFilesDataFiles: animeFilesData.files,
    performSync,
    showInfoModal,
    showToast,
    setConfirmModal,
    setSelectedDeleteEpisodes,
    closeDeleteSelectionMode,
  });

  const handleDeleteAllFiles = useCallback(() => {
    requestDeleteEpisodes(deletableEpisodeNumbers, { mode: "all" });
  }, [deletableEpisodeNumbers, requestDeleteEpisodes]);

  const buildTorrentShortcutQuery = useCallback(() => {
    const candidates = [
      mainAnime?.torrentSearchTerm,
      mainAnime?.torrentAlias,
      mainAnime?.torrentTitle,
      mainAnime?.title,
    ];

    for (const candidate of candidates) {
      const rawValue = String(candidate || "").trim();
      if (!rawValue) continue;

      const cleanValue = extractBaseTitle(rawValue).trim() || rawValue;
      if (cleanValue) return cleanValue;
    }

    return "";
  }, [mainAnime]);

  const handleSearchTorrent = useCallback(() => {
    if (!mainAnime) return;

    const query = buildTorrentShortcutQuery();
    const targetFansub = effectiveTorrentFansub || "general";
    const fansubConfig = targetFansub === "general" ? null : getFansubConfig(data.settings, targetFansub);

    navigate("/torrents", {
      state: {
        activeTab: targetFansub,
        activeQuery: query,
        searchInput: query,
        langMode: fansubConfig?.language === "es" ? "es" : "en",
        malId: animeId,
        animeTitle: mainAnime.title,
      },
    });
  }, [animeId, buildTorrentShortcutQuery, data.settings, effectiveTorrentFansub, mainAnime, navigate]);

  const handleReplaceEpisodeSelection = useCallback((epNums) => {
    setSelectedDeleteEpisodes(epNums);
  }, []);

  const handleClearEpisodeSelection = useCallback(() => {
    setSelectedDeleteEpisodes([]);
  }, []);

  if (animeLoading && !mainAnime) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner size={60} />
      </div>
    );
  }

  if (!mainAnime) {
    return <div className={styles.container}>No encontrado</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.contentLayout}>
        <AnimeSidebar
          mainAnime={mainAnime}
          libraryNotice={libraryNotice}
          onAdd={handleAddToLibraryBtnClick}
          onRemove={handleRemoveFromLibrary}
          onUnlink={handleUnlinkAnime}
          onDeleteFiles={handleDeleteAllFiles}
          canDeleteFiles={canDeleteFiles}
          onSearchTorrent={handleSearchTorrent}
          canSearchTorrent={Boolean(mainAnime?.title)}
          onLinkFolder={() => setShowLinkFolderModal(true)}
          onEditAlias={() => setShowAliasModal(true)}
        />
        <main className={styles.mainContent}>
          <AnimeHeader title={mainAnime.title} type={mainAnime.type} year={mainAnime.year} status={mainAnime.status} />
          <EpisodeList
            mainAnime={mainAnime}
            episodes={episodes}
            episodeFileMap={episodeFileMap}
            torrentData={torrentData}
            playingEp={playingEp}
            handlePlayEpisode={handlePlayEpisode}
            handleContextMenu={handleContextMenu}
            principalFansub={principalFansub}
            activeFansub={effectiveTorrentFansub}
            setTorrentModalItems={setTorrentModalItems}
            setTorrentModalOpen={setTorrentModalOpen}
            canManageFiles={canDeleteFiles}
            selectedEpisodes={selectedDeleteEpisodes}
            onReplaceEpisodeSelection={handleReplaceEpisodeSelection}
            onClearEpisodeSelection={handleClearEpisodeSelection}
          />
        </main>
      </div>

      {contextMenu && (
        <div
          className={styles.contextMenu}
          data-selection-context-menu
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {(() => {
            const watchedEpisodes = mainAnime?.watchedEpisodes || [];
            const selectedEpisodes = contextMenu.episodeNumbers || [];
            const allSelectedWatched =
              selectedEpisodes.length > 0 && selectedEpisodes.every((epNum) => watchedEpisodes.includes(epNum));
            const markWatched = !allSelectedWatched;

            return (
              <button
                className={styles.contextMenuItem}
                onClick={async (event) => {
                  event.stopPropagation();
                  await Promise.all(
                    selectedEpisodes
                      .filter((epNum) =>
                        markWatched ? !watchedEpisodes.includes(epNum) : watchedEpisodes.includes(epNum),
                      )
                      .map((epNum) => toggleEpisodeWatched(animeId, epNum, !markWatched)),
                  );
                  setContextMenu(null);
                  handleClearEpisodeSelection();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {markWatched ? "MARCAR COMO VISTO" : "MARCAR COMO NO VISTO"}
              </button>
            );
          })()}
          {contextMenu.episodeNumbers?.length > 0 && (
            <button
              className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
              onClick={(event) => {
                event.stopPropagation();
                requestDeleteEpisodes(contextMenu.episodeNumbers, { mode: "selected" });
                setContextMenu(null);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
              </svg>
              ELIMINAR DEL DISCO
            </button>
          )}
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
          onCancel={confirmModal.onCancel || (() => setConfirmModal(null))}
          confirmLabel={confirmModal.confirmLabel}
          variant={confirmModal.variant}
          hideCancel={confirmModal.hideCancel}
          loadingLabel={confirmModal.loadingLabel}
          isLoading={isDeletingFiles}
        />
      )}

      {!confirmModal && suggestedFolder && (
        <ConfirmModal
          title="Vincular carpeta detectada"
          message={`Se detecto la carpeta "${buildSuggestedLinkLabel(suggestedFolder)}" con ${suggestedFolder.files?.length || 0} archivos locales. Vincular esta carpeta con la serie?`}
          confirmLabel="VINCULAR"
          onConfirm={handleAcceptSuggestedLink}
          onCancel={handleRejectSuggestedLink}
        />
      )}

      {showAliasModal && (
        <TorrentAliasModal
          isOpen={showAliasModal}
          onClose={() => setShowAliasModal(false)}
          initialValue={data.myAnimes[animeId]?.torrentAlias || ""}
          initialFansub={data.myAnimes[animeId]?.torrentSourceFansub || null}
          animeTitle={mainAnime?.title}
          onError={(message) => showToast(message, "warn")}
          onSave={async ({ alias: newAlias, torrentSourceFansub }) => {
            try {
              await setMyAnimes((prev) => ({
                ...prev,
                [animeId]: {
                  ...prev[animeId],
                  torrentAlias: newAlias,
                  torrentSearchTerm: newAlias,
                  torrentSourceFansub,
                  lastUpdated: new Date().toISOString(),
                },
              }));
              showToast("Fuente de torrents actualizada.", "success");
            } catch (error) {
              showToast("No se pudo guardar la configuracion de torrents.", "warn");
              throw error;
            }
          }}
        />
      )}

      <TorrentDownloadModal
        isOpen={torrentModalOpen}
        onClose={() => setTorrentModalOpen(false)}
        animeTitle={mainAnime?.title}
        items={torrentModalItems}
        malId={animeId}
      />

      {toast && (
        <div className={styles.toast} data-type={toast.type} role="alert" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default AnimeDetails;
