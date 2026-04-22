import { useEffect, useMemo, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import useSafeAsync from "../hooks/useSafeAsync";
import { deleteFolderFromDisk, deleteVirtualFolderFiles } from "../services/fileSystem";
import { unlinkAnimeFolder } from "../utils/linkingState";
import { buildLibraryViewModel } from "../utils/libraryView";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import LibraryAnimeCard from "../components/anime/LibraryAnimeCard";
import styles from "./Library.module.css";

const USER_FILTERS = {
  ALL: "Todos",
  WATCHING: "Viendo",
  COMPLETED: "Completados",
  PLAN_TO_WATCH: "Pendientes",
  PAUSED: "Pausados",
  DROPPED: "Abandonados",
};

function Library() {
  const { data, libraryScopeReady, libraryScopeError, setMyAnimes, retryLibraryScope } = useStore();
  const { performSync, syncing, localFilesIndex } = useLibrary();
  const { safeExecute } = useSafeAsync();
  const [confirmModal, setConfirmModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userFilter, setUserFilter] = useState("ALL");
  const [activeCollectionView, setActiveCollectionView] = useState("ANIMES");
  const [pendingFilter, startTransition] = useTransition();
  const navigate = useNavigate();

  const showInfoModal = (title, message) => {
    setConfirmModal({
      title,
      message,
      confirmLabel: "ENTENDIDO",
      hideCancel: true,
      onConfirm: () => setConfirmModal(null),
    });
  };

  const normalizeTrackedPath = (path) =>
    String(path || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();

  const getRemainingRootFiles = (localFilesSnapshot, filesToCheck) => {
    const targetPaths = new Set((filesToCheck || []).map((file) => normalizeTrackedPath(file.path)).filter(Boolean));
    if (targetPaths.size === 0) return [];

    return Object.values(localFilesSnapshot || {})
      .flatMap((folder) => folder.files || [])
      .filter((file) => targetPaths.has(normalizeTrackedPath(file.path)));
  };

  const hasRemainingPhysicalFolder = (localFilesSnapshot, physicalPath) => {
    const normalizedTarget = normalizeTrackedPath(physicalPath);
    if (!normalizedTarget) return false;

    return Object.values(localFilesSnapshot || {}).some(
      (folder) => normalizeTrackedPath(folder.physicalPath) === normalizedTarget,
    );
  };

  useEffect(() => {
    if (!data?.folderPath || !libraryScopeReady) return;
    performSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.folderPath, libraryScopeReady]);

  const { animeEntries, localEntries } = useMemo(
    () => buildLibraryViewModel(data.myAnimes, data.localFiles, localFilesIndex),
    [data.myAnimes, data.localFiles, localFilesIndex],
  );

  const stats = useMemo(() => {
    const total = animeEntries.length;
    const watching = animeEntries.filter((entry) => entry.computedStatus === "WATCHING").length;
    const completed = animeEntries.filter((entry) => entry.computedStatus === "COMPLETED").length;
    const linked = animeEntries.filter((entry) => entry.libraryStatus === "LINKED").length;
    const unresolved = animeEntries.filter((entry) => entry.libraryStatus === "UNLINKED").length;
    return { total, watching, completed, linked, unresolved };
  }, [animeEntries]);

  const filteredAnimeEntries = useMemo(() => {
    return animeEntries.filter((entry) => {
      const matchesUser = userFilter === "ALL" || entry.computedStatus === userFilter;
      return matchesUser;
    });
  }, [animeEntries, userFilter]);

  const changeFilter = (setter, value) => {
    startTransition(() => setter(value));
  };

  const handleNavigateToAnime = (itemOrFolder) => {
    const folder = itemOrFolder.folderMatch || itemOrFolder;
    const resolvedMalId = folder?.resolvedMalId || folder?.malId || itemOrFolder?.malId;

    if (resolvedMalId) {
      const folderParam = folder?.folderName ? `?folder=${encodeURIComponent(folder.folderName)}` : "";
      navigate(`/anime/${resolvedMalId}${folderParam}`);
      return;
    }

    navigate(`/anime/null?folder=${encodeURIComponent(folder?.folderName || folder?.name || "")}`);
  };

  const promptRemoveFromLibrary = (malId, title = "este anime") => {
    setConfirmModal({
      title: "Eliminar de biblioteca",
      message: `Quieres eliminar tambien "${title}" de tu lista de seguimiento?`,
      onConfirm: async () => {
        await safeExecute(async () => {
          const newMyAnimes = { ...data.myAnimes };
          delete newMyAnimes[malId];
          await setMyAnimes(newMyAnimes);
          setConfirmModal(null);
          await performSync(newMyAnimes);
        }, "No se pudo eliminar la serie. Intenta de nuevo.");
      },
    });
  };

  const handleDeleteFolder = (folder, titleOverride = null) => {
    const displayTitle =
      titleOverride || folder?.resolvedAnimeData?.title || folder?.animeData?.title || folder?.name || "este anime";

    if (folder.isTracking) {
      setConfirmModal({
        title: "Quitar de seguimiento",
        message: `"${displayTitle}" se eliminara de tu lista. No hay archivos que borrar.`,
        onConfirm: async () => {
          setConfirmModal(null);
          const newMyAnimes = { ...data.myAnimes };
          delete newMyAnimes[folder.malId];
          await setMyAnimes(newMyAnimes);
          await performSync(newMyAnimes);
        },
      });
      return;
    }

    if (folder.isRootFile) {
      const fileCount = folder.files?.length || 0;
      if (fileCount === 0) {
        showInfoModal("No hay archivos para borrar", `"${folder.name}" ya no contiene archivos locales.`);
        return;
      }

      const fileNames = folder.files.map((file) => file.name).join("\n- ");
      setConfirmModal({
        title: "Borrar archivos",
        message: `Se eliminaran ${fileCount} archivo(s) del disco:\n\n- ${fileNames}`,
        onConfirm: async () => {
          setIsDeleting(true);
          const result = await deleteVirtualFolderFiles(folder.files, data.folderPath);
          const nextLocalFiles = await performSync();

          if (nextLocalFiles === null) {
            setIsDeleting(false);
            showInfoModal(
              "No se pudo verificar el borrado",
              "No se pudo reescanear la biblioteca despues del intento de borrado.",
            );
            return;
          }

          const remainingFiles = getRemainingRootFiles(nextLocalFiles, folder.files);
          if (remainingFiles.length > 0) {
            setIsDeleting(false);
            const lockedFile = result.errors.find((item) => item.code === "FILE_IN_USE");
            const remainingNames = remainingFiles.map((file) => file.name).join("\n- ");
            showInfoModal(
              "No se pudo completar el borrado",
              lockedFile?.error || `Uno o mas archivos siguen en uso o no pudieron eliminarse:\n\n- ${remainingNames}`,
            );
            return;
          }

          if (result.failed > 0 && result.deleted === 0) {
            setIsDeleting(false);
            showInfoModal(
              "No se pudo completar el borrado",
              result.errors[0]?.error || "Uno o mas archivos no pudieron eliminarse.",
            );
            return;
          }

          if (folder.malId) {
            await promptRemoveFromLibrary(folder.malId, displayTitle);
          }
          setIsDeleting(false);
          setConfirmModal(null);
        },
      });
      return;
      }

      // ... (dentro de handleDeleteFolder, el bloque principal de borrar carpeta)
      setConfirmModal({
      title: "Borrar carpeta",
      message: `"${displayTitle}" y todos sus archivos se eliminaran permanentemente del disco.`,
      onConfirm: async () => {
        setIsDeleting(true);
        const result = await deleteFolderFromDisk(folder.physicalPath, data.folderPath);
        const nextLocalFiles = await performSync();

        if (nextLocalFiles === null) {
          setIsDeleting(false);
          showInfoModal(
            "No se pudo verificar el borrado",
            "No se pudo reescanear la biblioteca despues del intento de borrado.",
          );
          return;
        }

        const folderStillExists = hasRemainingPhysicalFolder(nextLocalFiles, folder.physicalPath);
        if (folderStillExists) {
          setIsDeleting(false);
          showInfoModal(
            "No se pudo borrar la carpeta",
            result.code === "FILE_IN_USE"
              ? `${result.error} Cierra qBittorrent, el reproductor u otra app que este usando archivos dentro de "${displayTitle}".`
              : result.error || `La carpeta "${displayTitle}" sigue existiendo en disco.`,
          );
          return;
        }

        if (!result.ok && result.code && result.code !== "FILE_IN_USE") {
          setIsDeleting(false);
          showInfoModal("No se pudo borrar la carpeta", result.error || "La carpeta no pudo eliminarse.");
          return;
        }

        if (folder.malId) {
          await promptRemoveFromLibrary(folder.malId, displayTitle);
        }
        setIsDeleting(false);
        setConfirmModal(null);
      },
      });
      };
  const handleDeleteAnimeEntry = (item) => {
    const folder = item.folderMatch;
    if (!folder) {
      setConfirmModal({
        title: "Quitar de seguimiento",
        message: `"${item.anime.title}" se eliminara de tu lista. No hay archivos que borrar.`,
        onConfirm: async () => {
          setConfirmModal(null);
          const newMyAnimes = { ...data.myAnimes };
          delete newMyAnimes[item.malId];
          await setMyAnimes(newMyAnimes);
          await performSync(newMyAnimes);
        },
      });
      return;
    }

    handleDeleteFolder(folder, item.anime.title);
  };

  const handleUnlinkAnime = (item) => {
    if (!item.malId) return;

    setConfirmModal({
      title: "Desvincular carpeta",
      message: `"${item.anime.title}" dejara de estar vinculada. El anime permanece en tu lista sin archivos asociados.`,
      onConfirm: async () => {
        await safeExecute(async () => {
          const newMyAnimes = {
            ...data.myAnimes,
            [item.malId]: unlinkAnimeFolder(data.myAnimes[item.malId]),
          };

          await setMyAnimes(newMyAnimes);
          setConfirmModal(null);
          await performSync(newMyAnimes);
        }, "No se pudo desvincular la serie. Intenta de nuevo.");
      },
    });
  };

  if (!data.folderPath) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyContent}>
          <div className={styles.folderIconLarge}>Biblioteca</div>
          <h1>Biblioteca Digital</h1>
          <p>Organiza tus series, su progreso y los archivos locales desde una sola vista.</p>
          <p>Selecciona el directorio raiz desde Configuracion para comenzar.</p>
        </div>
      </div>
    );
  }

  if (libraryScopeError) {
    return (
      <div className={styles.errorState}>
        <div className={styles.errorContent}>
          <div className={styles.errorIconLarge}>ERROR</div>
          <h1>Error de Acceso</h1>
          <p>{libraryScopeError}</p>
          <div className={styles.errorActions}>
            <Button onClick={retryLibraryScope} variant="secondary">
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!libraryScopeReady) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p>Autorizando acceso a la biblioteca...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>Biblioteca</h1>
          <p>Tu coleccion, progreso y estado de archivos en una sola vista</p>
        </div>
        <div className={styles.headerActions}>
          <p className={styles.path}>
            Escaneando: <span>{data.folderPath}</span>
          </p>
          {syncing ? <span className={styles.syncing}>Actualizando...</span> : null}
        </div>
      </header>

      <section className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Series</span>
          <span className={styles.statValue}>{stats.total}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Viendo Ahora</span>
          <span className={styles.statValue}>{stats.watching}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Completados</span>
          <span className={styles.statValue}>{stats.completed}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Con Archivos</span>
          <span className={styles.statValue}>{stats.linked}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Sin Vincular</span>
          <span className={styles.statValue}>{stats.unresolved}</span>
        </div>
      </section>

      <section className={styles.filterPanel}>
        <div className={styles.collectionSwitch}>
          <button
            type="button"
            className={`${styles.collectionButton} ${activeCollectionView === "ANIMES" ? styles.collectionButtonActive : ""}`}
            onClick={() => setActiveCollectionView("ANIMES")}
          >
            Animes
          </button>
          <button
            type="button"
            className={`${styles.collectionButton} ${activeCollectionView === "LOCAL_FILES" ? styles.collectionButtonActive : ""}`}
            onClick={() => setActiveCollectionView("LOCAL_FILES")}
          >
            Archivos locales
          </button>
        </div>

        {activeCollectionView === "ANIMES" ? (
          <>
            <div className={styles.filterButtons}>
              {Object.entries(USER_FILTERS).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.filterButton} ${userFilter === id ? styles.filterButtonActive : ""}`}
                  onClick={() => changeFilter(setUserFilter, id)}
                  disabled={pendingFilter}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.filterHint}>
            <p>Carpetas o archivos detectados en disco que aun no estan vinculados a una serie.</p>
          </div>
        )}
      </section>

      {activeCollectionView === "ANIMES" ? (
        filteredAnimeEntries.length === 0 ? (
          <div className={styles.emptyGrid}>
            <p>No hay resultados para la combinacion de filtros actual.</p>
            <p>Ajusta el estado de usuario o el estado de biblioteca para ver mas series.</p>
          </div>
        ) : (
          <section className={styles.grid} style={{ opacity: pendingFilter ? 0.6 : 1 }}>
            {filteredAnimeEntries.map((item) => (
              <LibraryAnimeCard
                key={item.malId}
                item={item}
                onOpen={() => handleNavigateToAnime(item)}
                onUnlink={() => handleUnlinkAnime(item)}
                onDelete={() => handleDeleteAnimeEntry(item)}
                onRemove={() => promptRemoveFromLibrary(item.malId, item.anime.title)}
              />
            ))}
          </section>
        )
      ) : localEntries.length === 0 ? (
        <div className={styles.emptyGrid}>
          <p>No se detectaron carpetas o archivos locales pendientes de vincular.</p>
          <p>Cuando aparezcan nuevos archivos en disco se mostraran aqui.</p>
        </div>
      ) : (
        <section className={styles.localGrid}>
          {localEntries.map((folder) => {
            const displayTitle = folder.suggestedAnimeData?.title || folder.resolvedAnimeData?.title || folder.name;
            const subtitle = folder.isSuggested
              ? `Sugerida para ${folder.suggestedAnimeData?.title || "una serie"}`
              : folder.isRootFile
                ? "Archivos detectados en la raiz"
                : "Carpeta local por vincular";

            return (
              <article key={folder.name} className={styles.localCard} onClick={() => handleNavigateToAnime(folder)}>
                <div className={styles.localCardBody}>
                  <div className={styles.localCardHeader}>
                    <div>
                      <h3>{displayTitle}</h3>
                      <p>{subtitle}</p>
                    </div>
                    <span className={`${styles.localBadge} ${folder.isSuggested ? styles.localBadgeSuggested : ""}`}>
                      {folder.isSuggested ? "SUGERIDA" : "SIN VINCULAR"}
                    </span>
                  </div>
                  <div className={styles.localMeta}>
                    <span>{folder.fileCount} archivo(s)</span>
                    <span>{folder.folderName || folder.name}</span>
                  </div>
                </div>
                <div className={styles.localActions} onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => handleNavigateToAnime(folder)}>
                    RESOLVER
                  </button>
                  <button type="button" className={styles.dangerAction} onClick={() => handleDeleteFolder(folder)}>
                    ELIMINAR EN DISCO
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => !isDeleting && setConfirmModal(null)}
          confirmLabel={confirmModal.confirmLabel}
          hideCancel={confirmModal.hideCancel}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}

export default Library;
