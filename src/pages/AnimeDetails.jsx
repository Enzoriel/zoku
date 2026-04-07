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
import { usePlayTracking } from "../hooks/usePlayTracking";
import { AnimeHeader } from "../components/anime/details/AnimeHeader";
import { AnimeSidebar } from "../components/anime/details/AnimeSidebar";
import { EpisodeList } from "../components/anime/details/EpisodeList";
import { METADATA_REFRESH_DAYS } from "../constants";
import { buildStoredAnimeEntry } from "../utils/animeEntry";
import { getReleasedEpisodeCount, isAnimeActivelyAiring, isAiringMetadataStale } from "../utils/airingStatus";
import { acceptSuggestedFolder, rejectSuggestedFolder } from "../utils/linkingState";
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
  const { performSync } = useLibrary();
  const { data: torrentData, principalFansub } = useTorrent();

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

  const { toast, showToast } = useToast();
  const {
    playingEp,
    handlePlayEpisode: trackPlay,
    handleToggleWatched,
  } = usePlayTracking((message, type) => showToast(message, type));

  const animeId = useMemo(() => {
    if (id === "null" || id === "undefined") return null;
    return id || anime?.malId || anime?.mal_id || null;
  }, [id, anime]);

  const mainAnime = useMemo(() => {
    if (!animeId) {
      if (anime) return { ...anime, malId: null, isInLibrary: false, watchedEpisodes: [] };
      if (folderName) {
        return { title: folderName, isUnknown: true, episodeList: [], isInLibrary: false, watchedEpisodes: [] };
      }
      return null;
    }

    const stored = data.myAnimes[animeId];
    if (stored) {
      return { ...stored, malId: animeId, isInLibrary: true, watchedEpisodes: stored.watchedEpisodes || [] };
    }

    const contextAnime = getAnimeById(animeId);
    if (contextAnime) {
      return { ...contextAnime, malId: animeId, isInLibrary: false, watchedEpisodes: [] };
    }

    return anime ? { ...anime, malId: animeId, isInLibrary: false, watchedEpisodes: [] } : null;
  }, [animeId, data.myAnimes, getAnimeById, anime, folderName]);

  const linkedFolder = useMemo(() => {
    if (!mainAnime) return null;

    return (
      Object.values(data?.localFiles || {}).find((folder) => {
        if (mainAnime.folderName && folder.folderName === mainAnime.folderName) return true;
        if (!mainAnime.isInLibrary && folderName && folder.folderName === folderName) return true;
        if (!mainAnime.isInLibrary && folder.isLinked && folder.malId && mainAnime.malId) {
          return String(folder.malId) === String(mainAnime.malId);
        }
        return false;
      }) || null
    );
  }, [mainAnime, data?.localFiles, folderName]);

  const animeFilesData = useMemo(() => linkedFolder || { files: [] }, [linkedFolder]);

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
  }, []);

  useEffect(() => {
    if (!mainAnime && folderName) {
      setAnime({ title: folderName, isUnknown: true, episodeList: [] });
    }

    if (animeId && data.myAnimes[animeId]) {
      autoRefreshMetadata(animeId);
    }
  }, [folderName, mainAnime, animeId, autoRefreshMetadata, data.myAnimes]);

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
      const result = await searchAnime(query, 1);
      setApiSearchResults(result.data);
    } catch (error) {
      console.error(error);
      showToast("Error buscando animes en API.", "warn");
    } finally {
      setIsSearchingApi(false);
    }
  };

  const handleAddToLibrary = useCallback(async () => {
    if (!mainAnime || !animeId) return;

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
    navigate(`/anime/${newMalId}`);
  };

  const handleRemoveFromLibrary = useCallback(() => {
    if (!animeId) return;

    const performRemoval = async () => {
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
    };

    setConfirmModal({
      title: "¿Quitar serie de tu lista de animes?",
      message: "Se eliminara todo progreso guardado.",
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
    [animeId, mainAnime?.isInLibrary, trackPlay],
  );

  const handleContextMenu = useCallback(
    (event, epNum, isWatched) => {
      event.preventDefault();
      event.stopPropagation();
      if (!mainAnime?.isInLibrary) return;
      setContextMenu({ x: event.clientX, y: event.clientY, epNum, isWatched });
    },
    [mainAnime?.isInLibrary],
  );

  const handleLinkFolder = useCallback(
    async (folderKey) => {
      if (!animeId) return;

      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: acceptSuggestedFolder(prev[animeId], folderKey),
      }));
      setShowLinkFolderModal(false);
      setFolderSearch("");
      await performSync();
      showToast(`Carpeta "${folderKey}" vinculada.`, "success");
    },
    [animeId, setMyAnimes, performSync, showToast],
  );

  const handleAcceptSuggestedLink = useCallback(async () => {
    if (!animeId || !suggestedFolder?.folderName) return;

    await setMyAnimes((prev) => ({
      ...prev,
      [animeId]: acceptSuggestedFolder(prev[animeId], suggestedFolder.folderName),
    }));
    await performSync();
    showToast(`Carpeta "${suggestedFolder.folderName}" vinculada.`, "success");
  }, [animeId, suggestedFolder, setMyAnimes, performSync, showToast]);

  const handleRejectSuggestedLink = useCallback(async () => {
    if (!suggestedFolder?.folderName) return;
    await setMyAnimes((prev) => ({
      ...prev,
      [animeId]: rejectSuggestedFolder(prev[animeId], suggestedFolder.folderName),
    }));
    await performSync();
    showToast("La sugerencia fue descartada. La serie seguira en seguimiento.", "info");
  }, [animeId, suggestedFolder, setMyAnimes, performSync, showToast]);

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

  const totalEps = Math.max(
    mainAnime.totalEpisodes || 0,
    getReleasedEpisodeCount(mainAnime),
    mainAnime.episodeList?.length || 0,
    animeFilesData.files.length > 0 ? Math.max(...animeFilesData.files.map((file) => file.episodeNumber || 0)) : 0,
  );
  const episodes = Array.from({ length: totalEps || 1 }, (_, index) => index + 1);

  return (
    <div className={styles.container}>
      <div className={styles.contentLayout}>
        <AnimeSidebar
          mainAnime={mainAnime}
          libraryNotice={libraryNotice}
          onAdd={handleAddToLibraryBtnClick}
          onRemove={handleRemoveFromLibrary}
          onLinkFolder={() => setShowLinkFolderModal(true)}
          onEditAlias={() => setShowAliasModal(true)}
        />
        <main className={styles.mainContent}>
          <AnimeHeader title={mainAnime.title} type={mainAnime.type} year={mainAnime.year} status={mainAnime.status} />
          <EpisodeList
            mainAnime={mainAnime}
            episodes={episodes}
            animeFilesData={animeFilesData}
            torrentData={torrentData}
            playingEp={playingEp}
            handlePlayEpisode={handlePlayEpisode}
            handleContextMenu={handleContextMenu}
            principalFansub={principalFansub}
            setTorrentModalItems={setTorrentModalItems}
            setTorrentModalOpen={setTorrentModalOpen}
            folderName={folderName}
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

      {!confirmModal && suggestedFolder && (
        <ConfirmModal
          title="Vincular carpeta detectada"
          message={`Se detectó la carpeta "${buildSuggestedLinkLabel(suggestedFolder)}" con ${suggestedFolder.files?.length || 0} archivos locales. ¿Vincular esta carpeta con la serie?`}
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
          onSave={async (newAlias) => {
            await setMyAnimes((prev) => ({
              ...prev,
              [animeId]: {
                ...prev[animeId],
                torrentAlias: newAlias,
                torrentSearchTerm: newAlias,
                lastUpdated: new Date().toISOString(),
              },
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
