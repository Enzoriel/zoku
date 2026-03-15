import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { selectFolder, syncLibraryFolders, scanLibrary } from "../services/fileSystem";
import Button from "../components/ui/Button";
import styles from "./Biblioteca.module.css";

function Biblioteca() {
  const { data, setFolderPath, setLocalFiles } = useStore();
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  const handleSelectFolder = async () => {
    const path = await selectFolder();
    if (path) {
      await setFolderPath(path);
    }
  };

  const performSync = async () => {
    if (syncing) return;
    const animeCount = Object.keys(data.myAnimes || {}).length;
    if (data.folderPath && animeCount > 0) {
      setSyncing(true);
      try {
        console.log("[Library] Iniciando sincronización completa...");
        // 1. Asegurar que las carpetas existen
        await syncLibraryFolders(data.folderPath, data.myAnimes);
        
        // 2. Escanear archivos (raíz + subcarpetas)
        const localFiles = await scanLibrary(data.folderPath, data.myAnimes);
        
        await setLocalFiles(localFiles);
        console.log("[Library] Sincronización finalizada.");
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

  const allLibraryFolders = Object.entries(data.localFiles || {}).map(([name, folderData]) => {
    const linkedAnime = data.myAnimes[name] || Object.values(data.myAnimes).find(a => a.malId === folderData.malId);
    return {
      name,
      files: folderData.files,
      isLinked: !!linkedAnime,
      animeData: linkedAnime,
      malId: linkedAnime?.malId || folderData.malId
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const handleNavigateToAnime = (folder) => {
    if (folder.malId) {
      navigate(`/anime/${folder.malId}?folder=${encodeURIComponent(folder.name)}`);
    } else {
      navigate(`/anime/null?folder=${encodeURIComponent(folder.name)}`);
    }
  };

  if (!data.folderPath) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyContent}>
          <div className={styles.folderIconLarge}>📁</div>
          <h1>Configura tu Biblioteca</h1>
          <p>Selecciona una carpeta para empezar a organizar tus animes físicamente.</p>
          <Button onClick={handleSelectFolder}>Seleccionar Carpeta Raíz</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1>Biblioteca Universal</h1>
          <p className={styles.path}>Ubicación: <span>{data.folderPath}</span></p>
        </div>
        <div className={styles.actions}>
          <Button onClick={performSync} disabled={syncing}>
            {syncing ? "ESCANEANDO..." : "ESCANEAR AHORA"}
          </Button>
          <Button onClick={handleSelectFolder} variant="secondary">Cambiar Carpeta</Button>
        </div>
      </header>

      <div className={styles.folderGrid}>
        {allLibraryFolders.length === 0 ? (
          <div className={styles.noAnimes}>
            <p>No se encontraron carpetas con contenido multimedia.</p>
          </div>
        ) : (
          allLibraryFolders.map((folder) => {
            const hasPoster = folder.isLinked && folder.animeData?.coverImage;
            
            return (
              <div 
                key={folder.name} 
                className={`${styles.animeCard} ${!folder.isLinked ? styles.localFolder : ""}`}
                onDoubleClick={() => handleNavigateToAnime(folder)}
                title={folder.isLinked ? folder.animeData.title : folder.name}
              >
                <div className={styles.posterWrapper}>
                  {hasPoster ? (
                    <img src={folder.animeData.coverImage} alt="" className={styles.posterImage} />
                  ) : (
                    <div className={styles.folderIconLarge}>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
                      </svg>
                      <span>{folder.files.length} EPS</span>
                    </div>
                  )}
                  <div className={styles.overlay}>
                    <span className={styles.folderRealName}>{folder.name}</span>
                  </div>
                </div>
                <div className={styles.cardInfo}>
                  <h3 className={styles.cardTitle}>
                    {folder.isLinked ? folder.animeData.title : folder.name}
                  </h3>
                  {!folder.isLinked && <span className={styles.localBadge}>LOCAL</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Biblioteca;
