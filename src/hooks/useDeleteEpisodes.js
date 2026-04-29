import { useState, useCallback } from "react";
import { deleteVirtualFolderFiles } from "../services/fileSystem";

export function normalizeTrackedPath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function getRemainingTrackedFiles(localFilesSnapshot, filesToCheck) {
  const targetPaths = new Set((filesToCheck || []).map((file) => normalizeTrackedPath(file.path)).filter(Boolean));
  if (targetPaths.size === 0) return [];

  return Object.values(localFilesSnapshot || {})
    .flatMap((folder) => folder.files || [])
    .filter((file) => targetPaths.has(normalizeTrackedPath(file.path)));
}

function getFullyDeletedEpisodeNumbers(deletableEpisodeEntries, episodeNumbers, remainingTargetedFiles) {
  const remainingPaths = new Set(remainingTargetedFiles.map((file) => normalizeTrackedPath(file.path)).filter(Boolean));

  return episodeNumbers.filter((epNum) => {
    const files = deletableEpisodeEntries.find((entry) => entry.epNum === epNum)?.files || [];
    return files.length > 0 && files.every((file) => !remainingPaths.has(normalizeTrackedPath(file.path)));
  });
}

export function useDeleteEpisodes({
  folderPath,
  deletableEpisodeEntries,
  animeFilesDataFiles,
  performSync,
  showInfoModal,
  showToast,
  setConfirmModal,
  setSelectedDeleteEpisodes,
  closeDeleteSelectionMode,
}) {
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);

  const requestDeleteEpisodes = useCallback(
    (episodeNumbers, options = {}) => {
      if (!folderPath) {
        showInfoModal("Biblioteca no disponible", "No hay una biblioteca configurada para borrar archivos.");
        return;
      }

      const normalizedEpisodes = Array.from(
        new Set((episodeNumbers || []).filter((epNum) => Number.isFinite(epNum))),
      ).sort((first, second) => first - second);

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
        loadingLabel: "Borrando archivos y verificando la biblioteca...",
        onCancel: () => {
          setIsDeletingFiles((prev) => {
            if (!prev) setConfirmModal(null);
            return prev;
          });
        },
        onConfirm: async () => {
          setIsDeletingFiles(true);
          const result = await deleteVirtualFolderFiles(filesToDelete, folderPath);
          const nextLocalFiles = await performSync();

          if (nextLocalFiles === null) {
            setIsDeletingFiles(false);
            setConfirmModal(null);
            showInfoModal(
              "No se pudo verificar el borrado",
              "No se pudo reescanear la biblioteca despues del intento de borrado.",
            );
            return;
          }

          const remainingTargetedFiles = getRemainingTrackedFiles(nextLocalFiles, filesToDelete);
          if (remainingTargetedFiles.length > 0) {
            setIsDeletingFiles(false);

            const deletedEpisodeNumbers = getFullyDeletedEpisodeNumbers(
              deletableEpisodeEntries,
              normalizedEpisodes,
              remainingTargetedFiles,
            );
            if (deletedEpisodeNumbers.length > 0) {
              setSelectedDeleteEpisodes((prev) => prev.filter((epNum) => !deletedEpisodeNumbers.includes(epNum)));
            }

            const lockedFile = result.errors?.find((item) => item.code === "FILE_IN_USE");
            const remainingNames = remainingTargetedFiles.map((file) => file.name).join("\n- ");
            setConfirmModal(null);
            showInfoModal(
              result.deleted > 0 ? "Borrado parcial" : "No se pudo completar el borrado",
              lockedFile?.error || `Uno o mas archivos siguen en uso o no pudieron eliminarse:\n\n- ${remainingNames}`,
            );
            return;
          }

          if (result.failed > 0 && result.deleted === 0) {
            setIsDeletingFiles(false);
            setConfirmModal(null);
            showInfoModal(
              "No se pudo completar el borrado",
              result.errors?.[0]?.error || "Uno o mas archivos no pudieron eliminarse.",
            );
            return;
          }

          const remainingAnimeFiles = getRemainingTrackedFiles(nextLocalFiles, animeFilesDataFiles);
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
      animeFilesDataFiles,
      closeDeleteSelectionMode,
      folderPath,
      deletableEpisodeEntries,
      performSync,
      setConfirmModal,
      setSelectedDeleteEpisodes,
      showInfoModal,
      showToast,
    ],
  );

  return { requestDeleteEpisodes, isDeletingFiles };
}
