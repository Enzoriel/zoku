import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { selectFolder, scanLibrary, deleteFolderFromDisk } from "../services/fileSystem";
import Button from "../components/ui/Button";
import styles from "./Library.module.css";

function Library() {
  const { data, setFolderPath, setLocalFiles, setMyAnimes } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [filterType, setFilterType] = useState("ALL"); // ALL, TV, MOVIE, OVA, UNLINKED
  const navigate = useNavigate();

  const handleSelectFolder = async () => {
    const path = await selectFolder();
    if (path) {
      await setFolderPath(path);
    }
  };

  const performSync = async () => {
    if (syncing) return;
    if (data.folderPath) {
      setSyncing(true);
      try {
        const localFiles = await scanLibrary(data.folderPath, data.myAnimes);
        await setLocalFiles(localFiles);
      } catch (error) {
        console.error("Error sincronizando biblioteca:", error);
      } finally {
        setSyncing(false);
      }
    }
  };

  useEffect(() => {
    performSync();
  }, [data.folderPath, data.myAnimes]);

  // Procesar carpetas para la vista
  const processedFolders = useMemo(() => {
    return Object.entries(data.localFiles || {})
      .map(([name, folderData]) => {
        return {
          ...folderData,
          name,
          type: folderData.animeData?.type || "UNKNOWN",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.localFiles]);

  // Agrupar por categorías
  const groupedFolders = useMemo(() => {
    const groups = {
      TV: [],
      MOVIE: [],
      OVA_SPECIAL: [],
      UNLINKED: [],
      OTHER: []
    };

    processedFolders.forEach(folder => {
      if (!folder.isLinked) {
        groups.UNLINKED.push(folder);
      } else {
        const type = folder.type?.toUpperCase();
        if (type === "TV" || type === "TV_SHORT") groups.TV.push(folder);
        else if (type === "MOVIE") groups.MOVIE.push(folder);
        else if (type === "OVA" || type === "SPECIAL" || type === "ONA") groups.OVA_SPECIAL.push(folder);
        else groups.OTHER.push(folder);
      }
    });

    return groups;
  }, [processedFolders]);

  const handleDeleteFolder = async (folder) => {
    if (!folder.physicalPath) {
      alert("No se puede borrar: es una entrada virtual o archivo raíz.");
      return;
    }
    const success = await deleteFolderFromDisk(folder.physicalPath);
    if (success) {
      // Eliminar de MyAnimes si estaba vinculado
      if (folder.malId) {
        const confirmRemoveLibrary = await confirm("¿Quieres eliminar también este anime de tu biblioteca de seguimiento?");
        if (confirmRemoveLibrary) {
          const newMyAnimes = { ...data.myAnimes };
          delete newMyAnimes[folder.malId];
          await setMyAnimes(newMyAnimes);
        }
      }
      performSync();
    }
  };

  const handleUnlink = async (e, folder) => {
    e.stopPropagation();
    if (!folder.malId) return;
    
    if (window.confirm(`¿Quieres desvincular "${folder.name}" de la API?\nLos datos guardados se mantendrán pero la carpeta aparecerá como local.`)) {
      const newMyAnimes = { ...data.myAnimes };
      if (newMyAnimes[folder.malId]) {
        // Quitamos la referencia de folderName para que el scanner no lo encuentre por id
        newMyAnimes[folder.malId] = { ...newMyAnimes[folder.malId], folderName: null };
        await setMyAnimes(newMyAnimes);
        performSync();
      }
    }
  };

  const handleNavigateToAnime = (folder) => {
    if (folder.malId) {
      navigate(`/anime/${folder.malId}?folder=${encodeURIComponent(folder.name)}`);
    } else {
      navigate(`/anime/null?folder=${encodeURIComponent(folder.name)}`);
    }
  };

  const renderFolderCard = (folder) => {
    const hasPoster = folder.isLinked && folder.animeData?.coverImage;
    const isGrid = viewMode === "grid";

    return (
      <div
        key={folder.name}
        className={`${isGrid ? styles.animeCard : styles.listItem} ${!folder.isLinked ? styles.localFolder : ""}`}
        onClick={() => handleNavigateToAnime(folder)}
      >
        <div className={styles.posterWrapper}>
          {hasPoster ? (
            <img src={folder.animeData.coverImage} alt="" className={styles.posterImage} />
          ) : (
            <div className={styles.folderIcon}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
              </svg>
            </div>
          )}
          {isGrid && (
            <div className={styles.overlay}>
               <div className={styles.cardActions}>
                <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }} title="Borrar del disco">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6m4-16v6" /></svg>
                </button>
                {folder.isLinked && (
                  <button className={styles.actionBtn} onClick={(e) => handleUnlink(e, folder)} title="Desvincular API">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                  </button>
                )}
              </div>
              <span className={styles.folderRealName}>{folder.name}</span>
            </div>
          )}
        </div>
        
        <div className={styles.cardInfo}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{folder.isLinked ? folder.animeData.title : folder.name}</h3>
            {folder.files.length > 0 && <span className={styles.epCount}>{folder.files.length} EPS</span>}
          </div>
          <div className={styles.cardMeta}>
            {!folder.isLinked ? (
              <span className={styles.localBadge}>SIN VINCULAR</span>
            ) : (
              <span className={styles.typeBadge}>{folder.type}</span>
            )}
          </div>
        </div>
        
        {!isGrid && (
          <div className={styles.listActions}>
            <button className={styles.listActionBtn} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}>BORRAR</button>
            {folder.isLinked && <button className={styles.listActionBtn} onClick={(e) => handleUnlink(e, folder)}>DESVINCULAR</button>}
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
          <Button onClick={performSync} disabled={syncing} variant="primary">
            {syncing ? "ACTUALIZANDO..." : "REFRESCAR"}
          </Button>
          <Button onClick={handleSelectFolder} variant="secondary">
            CAMBIAR RUTA
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        {renderSection("SERIES TV", groupedFolders.TV)}
        {renderSection("PELÍCULAS", groupedFolders.MOVIE)}
        {renderSection("OVAS / ESPECIALES", groupedFolders.OVA_SPECIAL)}
        {renderSection("SERIES POR VINCULAR", groupedFolders.UNLINKED)}
        {renderSection("OTROS", groupedFolders.OTHER)}

        {processedFolders.length === 0 && (
          <div className={styles.noContent}>
            <p>No se encontraron archivos multimedia en esta ubicación.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default Library;
