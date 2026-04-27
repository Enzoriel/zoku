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
import { deleteVirtualFolderFiles, findAnimeFolderCandidates } from "../services/fileSystem";
import ConfirmModal from "../components/ui/ConfirmModal";
import TorrentAliasModal from "../components/ui/TorrentAliasModal";
import FolderLinkModal from "../components/ui/FolderLinkModal";
import SearchApiModal from "../components/ui/SearchApiModal";
import { usePlayback } from "../hooks/usePlayback";
import useSafeAsync from "../hooks/useSafeAsync";
import { AnimeHeader } from "../components/anime/details/AnimeHeader";
import { AnimeSidebar } from "../components/anime/details/AnimeSidebar";
import { EpisodeList } from "../components/anime/details/EpisodeList";
import { METADATA_REFRESH_DAYS } from "../constants";
import { buildStoredAnimeEntry } from "../utils/animeEntry";
import { getReleasedEpisodeCount, isAnimeActivelyAiring, isAiringMetadataStale } from "../utils/airingStatus";
import { buildEpisodeFileMap } from "../utils/episodeFiles";
import { acceptSuggestedFolder, rejectSuggestedFolder } from "../utils/linkingState";
import { getEffectiveTorrentSourceFansub } from "../utils/torrentConfig";
import { getBestFolderMatch } from "../utils/libraryView";
import styles from "./AnimeDetails.module.css";

const AIRING_METADATA_REFRESH_MS = 6 * 60 * 60 * 1000;
const NON_SEASON_METADATA_REFRESH_MS = 24 * 60 * 60 * 1000;

function buildSuggestedLinkLabel(folder) {
  if (!folder) return "";
  return folder.folderName || "";
}

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const folderName = searchParams.get("folder");
  const navigate = useNavigate();

  const { data, setMyAnimes, libraryScopeReady } = useStore();
  const { getAnimeById, getFreshAnimeById, refreshAnimeById, loading: animeLoading } = useAnime();
  const { performSync, localFilesIndex } = useLibrary();
  const { principalFansub, getItemsForAnime } = useTorrent();

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
  const [deleteSelectionMode, setDeleteSelectionMode] = useState(false);
  const [selectedDeleteEpisodes, setSelectedDeleteEpisodes] = useState([]);
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);

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

      await setMyAnimes((prev) => ({
        ...prev,
        [currentAnimeId]: {
          ...prev[currentAnimeId],
          ...safeApiData,
          lastMetadataFetch: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        },
      }));
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
      title: "Quitar serie de tu lista de animes?",
      message: "Se eliminara todo progreso guardado.",
      onConfirm: async () => {
        setConfirmModal(null);
        await performRemoval();
      },
    });
  }, [animeId, mainAnime?.folderName, data.myAnimes, setMyAnimes, performSync, navigate, safeExecute]);

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
    (event, epNum, status) => {
      event.preventDefault();
      event.stopPropagation();
      if (!mainAnime?.isInLibrary) return;
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        epNum,
        isWatched: status.type === "tagWatched",
        deletableFiles: status.deletableFiles || [],
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
  const localMaxEp =
    animeFilesData.files.length > 0 ? Math.max(...animeFilesData.files.map((file) => file.episodeNumber || 0)) : 0;
  const totalEps = apiTotal > 0 ? Math.max(apiTotal, Math.min(localMaxEp, apiTotal)) : Math.max(apiTotal, localMaxEp);
  const episodes = Array.from({ length: totalEps || 1 }, (_, index) => index + 1);
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
    setDeleteSelectionMode((prev) => (prev ? false : prev));
    setSelectedDeleteEpisodes((prev) => (prev.length > 0 ? [] : prev));
  }, [canDeleteFiles]);

  const normalizeTrackedPath = useCallback(
    (path) =>
      String(path || "")
        .replace(/\\/g, "/")
        .replace(/\/+$/, "")
        .toLowerCase(),
    [],
  );

  const getRemainingTrackedFiles = useCallback(
    (localFilesSnapshot, filesToCheck) => {
      const targetPaths = new Set((filesToCheck || []).map((file) => normalizeTrackedPath(file.path)).filter(Boolean));
      if (targetPaths.size === 0) return [];

      return Object.values(localFilesSnapshot || {})
        .flatMap((folder) => folder.files || [])
        .filter((file) => targetPaths.has(normalizeTrackedPath(file.path)));
    },
    [normalizeTrackedPath],
  );

  const closeDeleteSelectionMode = useCallback(() => {
    setDeleteSelectionMode((prev) => (prev ? false : prev));
    setSelectedDeleteEpisodes((prev) => (prev.length > 0 ? [] : prev));
  }, []);

  const requestDeleteEpisodes = useCallback(
    (episodeNumbers, options = {}) => {
      if (!data.folderPath) {
        showInfoModal("Biblioteca no disponible", "No hay una biblioteca configurada para borrar archivos.");
        return;
      }

      const normalizedEpisodes = Array.from(new Set((episodeNumbers || []).filter((epNum) => Number.isFinite(epNum)))).sort(
        (first, second) => first - second,
      );
      const filesToDelete = normalizedEpisodes.flatMap(
        (epNum) => deletableEpisodeEntries.find((entry) => entry.epNum === epNum)?.files || [],
      );

      if (filesToDelete.length === 0) {
        showInfoModal("No hay archivos para borrar", "Selecciona episodios con archivos descargados.");
        return;
      }

      const fileNames = filesToDelete.map((file) => file.name).join("\n- ");
      const episodeLabel =
        options.mode === "all"
          ? "Se borraran todos los archivos locales vinculados a este anime."
          : normalizedEpisodes.length === 1
            ? `Se borraran los archivos del episodio ${normalizedEpisodes[0]}.`
            : `Se borraran los archivos de los episodios ${normalizedEpisodes.join(", ")}.`;

      setConfirmModal({
        title: options.mode === "all" ? "Borrar todos los archivos" : "Borrar archivos seleccionados",
        message: `${episodeLabel}\n\n- ${fileNames}`,
        variant: "danger",
        confirmLabel: options.mode === "all" ? "BORRAR TODO" : "BORRAR",
        onCancel: () => !isDeletingFiles && setConfirmModal(null),
        onConfirm: async () => {
          setIsDeletingFiles(true);
          const result = await deleteVirtualFolderFiles(filesToDelete, data.folderPath);
          const nextLocalFiles = await performSync();

          if (nextLocalFiles === null) {
            setIsDeletingFiles(false);
            showInfoModal(
              "No se pudo verificar el borrado",
              "No se pudo reescanear la biblioteca despues del intento de borrado.",
            );
            return;
          }

          const remainingTargetedFiles = getRemainingTrackedFiles(nextLocalFiles, filesToDelete);
          if (remainingTargetedFiles.length > 0) {
            setIsDeletingFiles(false);
            const lockedFile = result.errors.find((item) => item.code === "FILE_IN_USE");
            const remainingNames = remainingTargetedFiles.map((file) => file.name).join("\n- ");
            showInfoModal(
              "No se pudo completar el borrado",
              lockedFile?.error || `Uno o mas archivos siguen en uso o no pudieron eliminarse:\n\n- ${remainingNames}`,
            );
            return;
          }

          if (result.failed > 0 && result.deleted === 0) {
            setIsDeletingFiles(false);
            showInfoModal(
              "No se pudo completar el borrado",
              result.errors[0]?.error || "Uno o mas archivos no pudieron eliminarse.",
            );
            return;
          }

          const remainingAnimeFiles = getRemainingTrackedFiles(nextLocalFiles, animeFilesData.files);
          setConfirmModal(null);
          setIsDeletingFiles(false);
          setSelectedDeleteEpisodes((prev) => prev.filter((epNum) => !normalizedEpisodes.includes(epNum)));

          if (remainingAnimeFiles.length === 0) {
            closeDeleteSelectionMode();
            showToast("No quedan archivos locales para este anime.", "info");
            return;
          }

          showToast(`${result.deleted} archivo(s) eliminados del disco.`, "success");
        },
      });
    },
    [
      animeFilesData.files,
      closeDeleteSelectionMode,
      data.folderPath,
      deletableEpisodeEntries,
      getRemainingTrackedFiles,
      isDeletingFiles,
      performSync,
      showInfoModal,
      showToast,
    ],
  );

  const handleDeleteAllFiles = useCallback(() => {
    requestDeleteEpisodes(deletableEpisodeNumbers, { mode: "all" });
  }, [deletableEpisodeNumbers, requestDeleteEpisodes]);

  const handleDeleteSelectedFiles = useCallback(() => {
    requestDeleteEpisodes(selectedDeleteEpisodes, { mode: "selected" });
  }, [requestDeleteEpisodes, selectedDeleteEpisodes]);

  const handleToggleDeleteSelectionMode = useCallback(() => {
    if (!canDeleteFiles) {
      showInfoModal("No hay archivos para borrar", "Este anime no tiene archivos locales borrables en disco.");
      return;
    }
    setContextMenu(null);
    if (deleteSelectionMode) {
      closeDeleteSelectionMode();
      return;
    }
    setDeleteSelectionMode(true);
  }, [canDeleteFiles, closeDeleteSelectionMode, deleteSelectionMode, showInfoModal]);

  const handleToggleEpisodeSelection = useCallback((epNum) => {
    setSelectedDeleteEpisodes((prev) =>
      prev.includes(epNum) ? prev.filter((value) => value !== epNum) : [...prev, epNum].sort((a, b) => a - b),
    );
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
          onDeleteFiles={handleToggleDeleteSelectionMode}
          canDeleteFiles={canDeleteFiles}
          onLinkFolder={() => setShowLinkFolderModal(true)}
          onEditAlias={() => setShowAliasModal(true)}
        />
        <main className={styles.mainContent}>
          <AnimeHeader title={mainAnime.title} type={mainAnime.type} year={mainAnime.year} status={mainAnime.status} />
          <EpisodeList
            mainAnime={mainAnime}
            episodes={episodes}
            animeFilesData={animeFilesData}
            episodeFileMap={episodeFileMap}
            torrentData={torrentData}
            playingEp={playingEp}
            handlePlayEpisode={handlePlayEpisode}
            handleContextMenu={handleContextMenu}
            principalFansub={principalFansub}
            activeFansub={effectiveTorrentFansub}
            setTorrentModalItems={setTorrentModalItems}
            setTorrentModalOpen={setTorrentModalOpen}
            folderName={folderName}
            canManageFiles={canDeleteFiles}
            deleteSelectionMode={deleteSelectionMode}
            selectedEpisodes={selectedDeleteEpisodes}
            onToggleDeleteMode={handleToggleDeleteSelectionMode}
            onToggleEpisodeSelection={handleToggleEpisodeSelection}
            onClearEpisodeSelection={handleClearEpisodeSelection}
            onDeleteSelectedEpisodes={handleDeleteSelectedFiles}
            onDeleteAllEpisodes={handleDeleteAllFiles}
          />
        </main>
      </div>

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={(event) => {
              event.stopPropagation();
              toggleEpisodeWatched(animeId, contextMenu.epNum, contextMenu.isWatched);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {contextMenu.isWatched ? "MARCAR COMO NO VISTO" : "MARCAR COMO VISTO"}
          </button>
          {deleteSelectionMode && contextMenu.deletableFiles?.length > 0 && (
            <button
              className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
              onClick={(event) => {
                event.stopPropagation();
                requestDeleteEpisodes([contextMenu.epNum], { mode: "selected" });
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
              BORRAR ESTE EPISODIO DEL DISCO
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
