import { useMemo, useState } from "react";
import AnimeCardExt from "./AnimeCardExt";
import styles from "./AnimeList.module.css";
import { useStore } from "../../hooks/useStore";
import { useLibrary } from "../../context/LibraryContext";
import ConfirmModal from "../ui/ConfirmModal";
import FolderLinkModal from "../ui/FolderLinkModal";
import { findAnimeFolderCandidates } from "../../services/fileSystem";
import { buildStoredAnimeEntry } from "../../utils/animeEntry";
import { acceptSuggestedFolder, rejectSuggestedFolder } from "../../utils/linkingState";
import { getBestFolderMatch } from "../../utils/libraryView";

const PAGE_SIZE = 12;

function getCandidateFolders(anime, localFiles) {
  const rejectedFolderName = String(anime?.rejectedSuggestion?.folderName || "").toLowerCase();

  return findAnimeFolderCandidates(anime, localFiles || {}, { onlyWithFiles: true })
    .filter(([folderKey]) => !rejectedFolderName || rejectedFolderName !== folderKey.toLowerCase())
    .map(([key, folder]) => ({ key, ...folder }));
}

function buildRemovalMessage({ title, watchedCount, fileCount, folderName }) {
  const risks = [];
  if (watchedCount > 0) {
    risks.push(`Se perderá el progreso guardado de ${watchedCount} episodio(s) visto(s).`);
  }
  if (fileCount > 0) {
    risks.push(`La carpeta "${folderName}" con ${fileCount} archivo(s) quedará sin vincular. No se borrará nada del disco.`);
  }

  return `¿Quieres quitar "${title}" de tu lista?\n\n${risks.join("\n")}`;
}

function AnimeList({ animes = [], disablePagination = false, currentPage = 1, onPageChange }) {
  const { data, setMyAnimes } = useStore();
  const { performSync, localFilesIndex } = useLibrary();
  const [confirmModal, setConfirmModal] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [folderSearch, setFolderSearch] = useState("");

  const totalPages = disablePagination ? 1 : Math.ceil(animes.length / PAGE_SIZE);
  const safeCurrentPage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);
  const visible = disablePagination
    ? animes
    : animes.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);
  const filteredFolders = useMemo(() => {
    const folders = linkModal?.folders || [];
    if (!folderSearch.trim()) return folders;
    const query = folderSearch.toLowerCase();
    return folders.filter((folder) => folder.key.toLowerCase().includes(query));
  }, [folderSearch, linkModal]);

  const closeLinkModal = () => {
    setLinkModal(null);
    setFolderSearch("");
  };

  const syncAfterMyAnimesUpdate = async (updateAction) => {
    const nextMyAnimes = await setMyAnimes(updateAction);
    const syncedLocalFiles = await performSync(nextMyAnimes);
    return { nextMyAnimes, syncedLocalFiles };
  };

  const handleAcceptFolder = async (animeId, folderName, fallbackEntry) => {
    await syncAfterMyAnimesUpdate((prev) => ({
      ...prev,
      [animeId]: acceptSuggestedFolder(prev[animeId] || fallbackEntry, folderName),
    }));
    setConfirmModal(null);
    closeLinkModal();
  };

  const handleRejectFolder = async (animeId, folderName, fallbackEntry) => {
    await syncAfterMyAnimesUpdate((prev) => ({
      ...prev,
      [animeId]: rejectSuggestedFolder(prev[animeId] || fallbackEntry, folderName),
    }));
    setConfirmModal(null);
  };

  const handleAddToLibrary = async (anime, animeId) => {
    const entry = buildStoredAnimeEntry(anime, { malId: animeId });
    const { syncedLocalFiles } = await syncAfterMyAnimesUpdate((prev) => ({ ...prev, [animeId]: entry }));
    const localFilesSnapshot = syncedLocalFiles || data.localFiles;
    const candidates = getCandidateFolders(entry, localFilesSnapshot);

    if (candidates.length === 0) return;

    if (candidates.length === 1) {
      const folder = candidates[0];
      setConfirmModal({
        title: "Vincular carpeta detectada",
        message: `Se detectó la carpeta "${folder.folderName || folder.key}" con ${folder.files?.length || 0} archivo(s) locales. ¿Vincular esta carpeta con la serie?`,
        confirmLabel: "VINCULAR",
        onConfirm: () => handleAcceptFolder(animeId, folder.folderName || folder.key, entry),
        onCancel: () => handleRejectFolder(animeId, folder.folderName || folder.key, entry),
      });
      return;
    }

    setLinkModal({ animeId, entry, folders: candidates });
  };

  const removeFromLibrary = async (animeId) => {
    await syncAfterMyAnimesUpdate((prev) => {
      const newState = { ...prev };
      delete newState[animeId];
      return newState;
    });
    setConfirmModal(null);
  };

  const handleRemoveFromLibrary = async (animeId) => {
    const storedAnime = data.myAnimes?.[animeId];
    if (!storedAnime) return;

    const folderMatch = getBestFolderMatch(storedAnime, data.localFiles, localFilesIndex);
    const linkedFileCount = folderMatch?.isLinked ? folderMatch.files?.length || 0 : 0;
    const watchedCount = Array.isArray(storedAnime.watchedEpisodes) ? storedAnime.watchedEpisodes.length : 0;

    if (linkedFileCount === 0 && watchedCount === 0) {
      await removeFromLibrary(animeId);
      return;
    }

    const title = storedAnime.title || storedAnime.title_english || "esta serie";
    setConfirmModal({
      title: "Quitar serie con datos guardados",
      message: buildRemovalMessage({
        title,
        watchedCount,
        fileCount: linkedFileCount,
        folderName: folderMatch?.folderName || storedAnime.folderName || "carpeta vinculada",
      }),
      confirmLabel: "QUITAR DE LISTA",
      variant: "danger",
      onConfirm: () => removeFromLibrary(animeId),
      onCancel: () => setConfirmModal(null),
    });
  };

  const handleToggleLibrary = async (anime, animeId) => {
    if (!animeId) return;
    if (data?.myAnimes?.[animeId]) {
      await handleRemoveFromLibrary(animeId);
      return;
    }
    await handleAddToLibrary(anime, animeId);
  };

  const handleLinkFolder = (folderKey) => {
    if (!linkModal) return;
    handleAcceptFolder(linkModal.animeId, folderKey, linkModal.entry);
  };

  if (animes.length === 0) {
    return <div className={styles.empty}>No se encontraron resultados</div>;
  }

  return (
    <div>
      <div className={styles.list}>
        {visible.map((anime) => {
          const malId = anime.mal_id || anime.malId;
          return (
            <AnimeCardExt
              key={malId}
              anime={anime}
              malId={malId}
              isInLibrary={!!data?.myAnimes?.[malId]}
              onToggleLibrary={handleToggleLibrary}
            />
          );
        })}
      </div>

      {!disablePagination && totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            onClick={() => onPageChange?.(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            className={styles.pageBtn}
          >
            ←
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              onClick={() => onPageChange?.(page)}
              className={`${styles.pageBtn} ${safeCurrentPage === page ? styles.activePage : ""}`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => onPageChange?.(safeCurrentPage + 1)}
            disabled={safeCurrentPage === totalPages}
            className={styles.pageBtn}
          >
            →
          </button>
        </div>
      )}

      <FolderLinkModal
        isOpen={Boolean(linkModal)}
        onClose={closeLinkModal}
        folderSearch={folderSearch}
        setFolderSearch={setFolderSearch}
        filteredFolders={filteredFolders}
        onLink={handleLinkFolder}
      />

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={confirmModal.onCancel}
          confirmLabel={confirmModal.confirmLabel}
          variant={confirmModal.variant}
        />
      )}
    </div>
  );
}

export default AnimeList;
