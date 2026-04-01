import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { useAnime } from "../context/AnimeContext";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import { searchAnime } from "../services/api";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { normalizeForSearch } from "../services/fileSystem";
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
import styles from "./AnimeDetails.module.css";

function titlesMatch(normalizedTitle, normalizedKey) {
  if (!normalizedTitle || !normalizedKey) return false;
  if (normalizedTitle === normalizedKey) return true;
  const blacklist = ["season", "part", "anime", "2nd", "3rd", "4th", "5th", "s2", "s3", "s4"];
  const getBaseNameWords = (str) => str.split(" ").filter((word) => word.length > 2 && !blacklist.includes(word));
  const wordsTitle = getBaseNameWords(normalizedTitle);
  const wordsKey = getBaseNameWords(normalizedKey);
  if (wordsTitle.length === 0 || wordsKey.length === 0) return false;
  const matches = wordsTitle.filter((word) => wordsKey.includes(word)).length;
  const totalUniqueWords = Math.max(wordsTitle.length, wordsKey.length);
  return matches / totalUniqueWords >= 0.8;
}

function buildSuggestedLinkLabel(folder) {
  if (!folder?.files?.length) {
    return folder?.folderName || "";
  }

  const firstFile = folder.files[0]?.name || folder.folderName || "";
  return firstFile
    .replace(/\.[^/.]+$/, "")
    .replace(/\s*-\s*\d{1,4}.*$/i, "")
    .replace(/\s+\d{1,4}.*$/i, "")
    .trim();
}

function AnimeDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const folderName = searchParams.get("folder");
  const navigate = useNavigate();

  const { data, setMyAnimes, setSettings } = useStore();
  const { getAnimeById, getFreshAnimeById, loading: animeLoading } = useAnime();
  const { performSync } = useLibrary();
  const { data: torrentData, principalFansub } = useTorrent();

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
    return id && id !== "null" && id !== "undefined" ? id : anime?.malId || anime?.mal_id || null;
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

  const animeFilesData = useMemo(() => {
    if (!mainAnime) return { files: [] };

    const folderObj = Object.values(data?.localFiles || {}).find((folder) => {
      const resolvedMalId = folder.resolvedMalId || folder.malId;
      if (resolvedMalId && mainAnime.malId && String(resolvedMalId) === String(mainAnime.malId)) return true;
      if (mainAnime.folderName && folder.folderName === mainAnime.folderName) return true;
      if (folderName && folder.folderName === folderName) return true;
      return false;
    });

    return folderObj || { files: [] };
  }, [mainAnime, data?.localFiles, folderName]);

  const suggestedFolder = useMemo(() => {
    if (!mainAnime?.malId || mainAnime?.folderName) return null;

    return (
      Object.values(data?.localFiles || {}).find((folder) => {
        if (!folder?.isSuggested || folder?.isLinked) return false;
        return String(folder.suggestedMalId || folder.resolvedMalId) === String(mainAnime.malId);
      }) || null
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

  const dataMyAnimesRef = useRef(data.myAnimes);
  const getAnimeByIdRef = useRef(getAnimeById);
  const getFreshAnimeByIdRef = useRef(getFreshAnimeById);
  const setMyAnimesRef = useRef(setMyAnimes);

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
    setMyAnimesRef.current = setMyAnimes;
  }, [setMyAnimes]);

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
    const daysSince = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    const isMissingData = !stored.rank && !stored.studios?.length;
    if (daysSince < METADATA_REFRESH_DAYS && !isMissingData) return;

    const apiData = getFreshAnimeByIdRef.current(currentAnimeId) || getAnimeByIdRef.current(currentAnimeId);
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

    await setMyAnimesRef.current((prev) => ({
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

    const normalizedTitle = normalizeForSearch(mainAnime.title);
    const match = Object.entries(data.localFiles).find(
      ([key, value]) => !value.isLinked && titlesMatch(normalizedTitle, normalizeForSearch(key)),
    );
    const newMyAnimes = { ...data.myAnimes, [animeId]: entry };

    if (match) {
      const nextSettings = {
        ...data.settings,
        library: {
          ...(data.settings?.library || {}),
          ignoredSuggestions: (data.settings?.library?.ignoredSuggestions || []).filter(
            (name) => name.toLowerCase() !== match[0].toLowerCase(),
          ),
        },
      };

      entry.folderName = match[0];
      newMyAnimes[animeId] = entry;
      await setMyAnimes(newMyAnimes);
      await setSettings(nextSettings);
      await performSync(newMyAnimes, nextSettings);
      showToast(`Vinculado con "${match[0]}"`, "success");
      return;
    }

    await setMyAnimes(newMyAnimes);
    showToast("Añadido a la lista.", "info");
  }, [mainAnime, animeId, data.myAnimes, data.localFiles, data.settings, setMyAnimes, setSettings, performSync, showToast]);

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

    let nextSettings = data.settings;
    if (folderName) {
      nextSettings = {
        ...data.settings,
        library: {
          ...(data.settings?.library || {}),
          ignoredSuggestions: (data.settings?.library?.ignoredSuggestions || []).filter(
            (name) => name.toLowerCase() !== folderName.toLowerCase(),
          ),
        },
      };
      await setSettings(nextSettings);
    }

    setShowSearchApiModal(false);
    await performSync({ ...data.myAnimes, [newMalId]: animeData }, nextSettings);
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

      const nextSettings = {
        ...data.settings,
        library: {
          ...(data.settings?.library || {}),
          ignoredSuggestions: (data.settings?.library?.ignoredSuggestions || []).filter(
            (name) => name.toLowerCase() !== folderKey.toLowerCase(),
          ),
        },
      };

      await setMyAnimes((prev) => ({
        ...prev,
        [animeId]: { ...prev[animeId], folderName: folderKey, lastUpdated: new Date().toISOString() },
      }));
      await setSettings(nextSettings);
      setShowLinkFolderModal(false);
      setFolderSearch("");
      await performSync(null, nextSettings);
      showToast(`Carpeta "${folderKey}" vinculada.`, "success");
    },
    [animeId, setMyAnimes, setSettings, data.settings, performSync, showToast],
  );

  const handleAcceptSuggestedLink = useCallback(async () => {
    if (!animeId || !suggestedFolder?.folderName) return;

    const nextSettings = {
      ...data.settings,
      library: {
        ...(data.settings?.library || {}),
        ignoredSuggestions: (data.settings?.library?.ignoredSuggestions || []).filter(
          (name) => name.toLowerCase() !== suggestedFolder.folderName.toLowerCase(),
        ),
      },
    };

    await setMyAnimes((prev) => ({
      ...prev,
      [animeId]: {
        ...prev[animeId],
        folderName: suggestedFolder.folderName,
        lastUpdated: new Date().toISOString(),
      },
    }));
    await setSettings(nextSettings);
    await performSync(null, nextSettings);
    showToast(`Carpeta "${suggestedFolder.folderName}" vinculada.`, "success");
  }, [animeId, suggestedFolder, data.settings, setMyAnimes, setSettings, performSync, showToast]);

  const handleRejectSuggestedLink = useCallback(async () => {
    if (!suggestedFolder?.folderName) return;

    const nextSettings = {
      ...data.settings,
      library: {
        ...(data.settings?.library || {}),
        ignoredSuggestions: Array.from(
          new Set([...(data.settings?.library?.ignoredSuggestions || []), suggestedFolder.folderName]),
        ),
      },
    };

    await setSettings(nextSettings);
    await performSync(null, nextSettings);
  }, [suggestedFolder, data.settings, setSettings, performSync]);

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
    mainAnime.episodeList?.length || 0,
    animeFilesData.files.length > 0 ? Math.max(...animeFilesData.files.map((file) => file.episodeNumber || 0)) : 0,
  );
  const episodes = Array.from({ length: totalEps || 1 }, (_, index) => index + 1);

  return (
    <div className={styles.container}>
      <div className={styles.contentLayout}>
        <AnimeSidebar
          mainAnime={mainAnime}
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
          title="Aceptar vinculacion automatica"
          message={`Se ha vinculado esta serie con ${suggestedFolder.files?.length || 0} archivos locales con el siguiente nombre: ${buildSuggestedLinkLabel(suggestedFolder)}. ¿Aceptar vinculacion?`}
          confirmLabel="ACEPTAR"
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
