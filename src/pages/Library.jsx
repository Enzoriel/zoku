import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useLibrary } from "../context/LibraryContext";
import { selectFolder, deleteFolderFromDisk, deleteVirtualFolderFiles } from "../services/fileSystem";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ui/ConfirmModal";
import styles from "./Library.module.css";

function Library() {
  const { data, setFolderPath, setMyAnimes, setSettings } = useStore();
  const { performSync, syncing } = useLibrary();
  const [viewMode, setViewMode] = useState("grid");
  const [confirmModal, setConfirmModal] = useState(null);
  const navigate = useNavigate();

  const handleSelectFolder = async () => {
    const path = await selectFolder();
    if (path) await setFolderPath(path);
  };

  useEffect(() => {
    performSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.folderPath]);

  const processedFolders = useMemo(() => {
    return Object.entries(data.localFiles || {})
      .map(([name, folderData]) => ({
        ...folderData,
        name,
        type: folderData.resolvedAnimeData?.type || folderData.animeData?.type || "UNKNOWN",
      }))
      .sort((a, b) => {
        // isTracking al final dentro de su grupo
        if (a.isTracking && !b.isTracking) return 1;
        if (!a.isTracking && b.isTracking) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [data.localFiles]);

  const groupedFolders = useMemo(() => {
    const groups = {
      TV: [],
      MOVIE: [],
      OVA_SPECIAL: [],
      UNLINKED: [],
      TRACKING: [], // en lista, sin carpeta física
      OTHER: [],
    };

    processedFolders.forEach((folder) => {
      if (folder.isTracking) {
        groups.TRACKING.push(folder);
        return;
      }
      if (!folder.isLinked) {
        groups.UNLINKED.push(folder);
        return;
      }
      const type = folder.type?.toUpperCase();
      if (type === "TV" || type === "TV_SHORT") groups.TV.push(folder);
      else if (type === "MOVIE") groups.MOVIE.push(folder);
      else if (type === "OVA" || type === "SPECIAL" || type === "ONA") groups.OVA_SPECIAL.push(folder);
      else groups.OTHER.push(folder);
    });

    return groups;
  }, [processedFolders]);

  const handleDeleteFolder = (folder) => {
    if (folder.isTracking) {
      setConfirmModal({
        title: "¿Quitar de seguimiento?",
        message: `"${folder.animeData?.title || folder.name}" se eliminará de tu lista. No hay archivos que borrar.`,
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

    // Carpetas virtuales: archivos sueltos en raíz agrupados por título
    if (folder.isRootFile) {
      const fileCount = folder.files?.length || 0;
      if (fileCount === 0) return;

      const fileNames = folder.files.map((f) => f.name).join("\n• ");
      setConfirmModal({
        title: "¿Borrar archivos?",
        message: `Se eliminarán ${fileCount} archivo(s) del disco:\n\n• ${fileNames}`,
        onConfirm: async () => {
          setConfirmModal(null);
          const result = await deleteVirtualFolderFiles(folder.files, data.folderPath);
          if (result.deleted > 0) {
            if (folder.malId) {
              setConfirmModal({
                title: "¿Eliminar de biblioteca?",
                message: "¿Quieres eliminar también este anime de tu lista de seguimiento?",
                onConfirm: async () => {
                  const newMyAnimes = { ...data.myAnimes };
                  delete newMyAnimes[folder.malId];
                  await setMyAnimes(newMyAnimes);
                  setConfirmModal(null);
                  await performSync(newMyAnimes);
                },
              });
            } else {
              await performSync();
            }
          }
        },
      });
      return;
    }

    // Carpetas físicas reales
    if (!folder.physicalPath) return;

    setConfirmModal({
      title: "¿Borrar carpeta?",
      message: `"${folder.name}" y todos sus archivos serán eliminados permanentemente del disco.`,
      onConfirm: async () => {
        setConfirmModal(null);
        const success = await deleteFolderFromDisk(folder.physicalPath, data.folderPath);
        if (success) {
          if (folder.malId) {
            setConfirmModal({
              title: "¿Eliminar de biblioteca?",
              message: "¿Quieres eliminar también este anime de tu lista de seguimiento?",
              onConfirm: async () => {
                const newMyAnimes = { ...data.myAnimes };
                delete newMyAnimes[folder.malId];
                await setMyAnimes(newMyAnimes);
                setConfirmModal(null);
                await performSync(newMyAnimes);
              },
            });
          } else {
            await performSync();
          }
        }
      },
    });
  };

  const handleUnlink = (e, folder) => {
    e.stopPropagation();
    if (!folder.malId) return;

    setConfirmModal({
      title: "¿Desvincular carpeta?",
      message: `"${folder.name}" dejará de estar vinculada. El anime permanece en tu lista sin archivos asociados.`,
      onConfirm: async () => {
        setConfirmModal(null);
        const newMyAnimes = {
          ...data.myAnimes,
          [folder.malId]: {
            ...data.myAnimes[folder.malId],
            folderName: null,
            lastUpdated: new Date().toISOString(),
          },
        };
        await setMyAnimes(newMyAnimes);
        await setSettings({
          ...data.settings,
          library: {
            ...(data.settings?.library || {}),
            ignoredSuggestions: Array.from(
              new Set([...(data.settings?.library?.ignoredSuggestions || []), folder.name]),
            ),
          },
        });
        await performSync(newMyAnimes, {
          ...data.settings,
          library: {
            ...(data.settings?.library || {}),
            ignoredSuggestions: Array.from(
              new Set([...(data.settings?.library?.ignoredSuggestions || []), folder.name]),
            ),
          },
        });
      },
    });
  };

  const handleNavigateToAnime = (folder) => {
    if (folder.isTracking) {
      // Anime sin carpeta: entrar por ID
      navigate(`/anime/${folder.malId}`);
      return;
    }
    const resolvedMalId = folder.resolvedMalId || folder.malId;
    if (resolvedMalId) {
      navigate(`/anime/${resolvedMalId}?folder=${encodeURIComponent(folder.name)}`);
    } else {
      navigate(`/anime/null?folder=${encodeURIComponent(folder.name)}`);
    }
  };

  const renderFolderCard = (folder) => {
    const displayAnime = folder.resolvedAnimeData || folder.animeData;
    const hasPoster = (folder.isLinked || folder.isTracking || folder.isSuggested) && displayAnime?.coverImage;
    const isGrid = viewMode === "grid";
    const isTracking = folder.isTracking;

    return (
      <div
        key={folder.name}
        className={`${isGrid ? styles.animeCard : styles.listItem} ${!folder.isLinked && !isTracking ? styles.localFolder : ""} ${isTracking ? styles.trackingFolder : ""}`}
        onClick={() => handleNavigateToAnime(folder)}
      >
        <div className={styles.posterWrapper}>
          {hasPoster ? (
            <img src={displayAnime.coverImage} alt={displayAnime?.title || folder.name} className={styles.posterImage} />
          ) : (
            <div className={styles.folderIcon}>
              {isTracking ? (
                // Icono de "en lista" para tracking
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
                </svg>
              )}
            </div>
          )}
          {isGrid && (
            <div className={styles.overlay}>
              <div className={styles.cardActions}>
                <button
                  className={styles.actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder);
                  }}
                  title={isTracking ? "Quitar de lista" : "Borrar del disco"}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6m4-16v6" />
                  </svg>
                </button>
                {folder.isLinked && !isTracking && (
                  <button
                    className={styles.actionBtn}
                    onClick={(e) => handleUnlink(e, folder)}
                    title="Desvincular carpeta"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                  </button>
                )}
              </div>
              <span className={styles.folderRealName}>{isTracking ? displayAnime?.title : folder.name}</span>
            </div>
          )}
        </div>

        <div className={styles.cardInfo}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              {folder.isLinked || isTracking || folder.isSuggested ? displayAnime?.title || folder.name : folder.name}
            </h3>
            {!isTracking && folder.files.length > 0 && (
              <span className={styles.epCount}>{folder.files.length} EPS</span>
            )}
          </div>
          <div className={styles.cardMeta}>
            {isTracking ? (
              <span className={styles.trackingBadge}>SIN ARCHIVOS</span>
            ) : folder.isSuggested && !folder.isLinked ? (
              <span className={styles.localBadge}>SUGERIDA</span>
            ) : !folder.isLinked ? (
              <span className={styles.localBadge}>SIN VINCULAR</span>
            ) : (
              <span className={styles.typeBadge}>{folder.type}</span>
            )}
          </div>
        </div>

        {!isGrid && (
          <div className={styles.listActions}>
            <button
              className={styles.listActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder);
              }}
            >
              {isTracking ? "QUITAR" : "BORRAR"}
            </button>
            {folder.isLinked && !isTracking && (
              <button className={styles.listActionBtn} onClick={(e) => handleUnlink(e, folder)}>
                DESVINCULAR
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (title, folders) => {
    if (folders.length === 0) return null;
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {title} <span>({folders.length})</span>
        </h2>
        <div className={viewMode === "grid" ? styles.folderGrid : styles.folderList}>
          {folders.map(renderFolderCard)}
        </div>
      </div>
    );
  };

  if (!data.folderPath) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyContent}>
          <div className={styles.folderIconLarge}>📁</div>
          <h1>Biblioteca Digital</h1>
          <p>Organiza tus carpetas físicas vinculándolas con la base de datos global.</p>
          <Button onClick={handleSelectFolder}>Seleccionar Directorio Raíz</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleGroup}>
            <h1>MI BIBLIOTECA</h1>
            <div className={styles.viewToggle}>
              <button className={viewMode === "grid" ? styles.activeView : ""} onClick={() => setViewMode("grid")}>
                CUADRICULA
              </button>
              <button className={viewMode === "list" ? styles.activeView : ""} onClick={() => setViewMode("list")}>
                LISTA
              </button>
            </div>
          </div>
          <p className={styles.path}>
            Escaneando: <span>{data.folderPath}</span>
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button onClick={() => performSync()} disabled={syncing} variant="primary">
            {syncing ? "Actualizando..." : "Refrescar"}
          </Button>
          <Button onClick={handleSelectFolder} variant="secondary">
            Cambiar ruta
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        {renderSection("SERIES TV", groupedFolders.TV)}
        {renderSection("PELÍCULAS", groupedFolders.MOVIE)}
        {renderSection("OVAS / ESPECIALES", groupedFolders.OVA_SPECIAL)}
        {renderSection("EN SEGUIMIENTO", groupedFolders.TRACKING)}
        {renderSection("SIN VINCULAR", groupedFolders.UNLINKED)}
        {renderSection("OTROS", groupedFolders.OTHER)}

        {processedFolders.length === 0 && (
          <div className={styles.noContent}>
            <p>No se encontraron archivos multimedia en esta ubicación.</p>
          </div>
        )}
      </main>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

export default Library;
