import { useMemo } from "react";
import { getReleasedEpisodeCount, isAnimeActivelyAiring } from "../../../utils/airingStatus";
import { getEpisodeTorrentAvailability } from "../../../utils/torrentAvailability";
import styles from "../../../pages/AnimeDetails.module.css";

export function EpisodeList({
  mainAnime,
  episodes,
  animeFilesData,
  episodeFileMap = new Map(),
  torrentData,
  playingEp,
  handlePlayEpisode,
  handleContextMenu,
  principalFansub,
  activeFansub,
  setTorrentModalItems,
  setTorrentModalOpen,
  folderName,
  canManageFiles,
  deleteSelectionMode,
  selectedEpisodes,
  onToggleDeleteMode,
  onToggleEpisodeSelection,
  onClearEpisodeSelection,
  onDeleteSelectedEpisodes,
  onDeleteAllEpisodes,
}) {
  const progressPct = useMemo(
    () => (episodes.length > 0 ? (mainAnime?.watchedEpisodes?.length / episodes.length) * 100 : 0),
    [mainAnime?.watchedEpisodes, episodes.length],
  );

  const torrentMatchesByEpisode = useMemo(() => {
    const matchesMap = {};
    if (mainAnime && torrentData && torrentData.length > 0) {
      episodes.forEach((epNum) => {
        matchesMap[epNum] = getEpisodeTorrentAvailability(
          mainAnime.title,
          mainAnime.title_english,
          epNum,
          torrentData,
          activeFansub || principalFansub,
          mainAnime.torrentAlias,
          mainAnime.torrentSearchTerm,
          mainAnime.torrentTitle,
          mainAnime.synonyms || [],
        );
      });
    }
    return matchesMap;
  }, [mainAnime, torrentData, episodes, principalFansub, activeFansub]);

  const getEpisodeStatus = (epNum) => {
    const isWatched = mainAnime?.watchedEpisodes?.includes(epNum);
    const localFiles = episodeFileMap.get(epNum) || [];
    const playableFile = localFiles.find((file) => !file.isDownloading) || null;
    const downloadingFile = localFiles.find((file) => file.isDownloading) || null;
    const localFile = playableFile || downloadingFile;
    const deletableFiles = localFiles.filter((file) => !file.isDownloading);

    if (isWatched) return { label: "VISTO", type: "tagWatched", file: localFile, deletableFiles };
    if (!playableFile && downloadingFile) {
      return { label: "DESCARGANDO", type: "tagDownloading", file: downloadingFile, deletableFiles };
    }
    if (playableFile) return { label: "DESCARGADO", type: "tagDownloaded", file: playableFile, deletableFiles };

    const status = mainAnime?.status;
    if (status === "Finalizado" || status === "Finished Airing" || status === "FINISHED") {
      return { label: "EMITIDO", type: "tagAired", file: null, deletableFiles };
    }
    if (
      status === "Proximamente" ||
      status === "Próximamente" ||
      status === "NOT_YET_RELEASED" ||
      status === "Not yet aired"
    ) {
      return { label: "PROXIMO", type: "tagNotAired", file: null, deletableFiles };
    }

    const releasedEpisodes = getReleasedEpisodeCount(mainAnime);
    if (
      (mainAnime?.nextAiringEpisode || isAnimeActivelyAiring(mainAnime) || releasedEpisodes > 0) &&
      epNum <= releasedEpisodes
    ) {
      return { label: "EMITIDO", type: "tagAired", file: null, deletableFiles };
    }
    return { label: "PROXIMO", type: "tagNotAired", file: null, deletableFiles };
  };

  return (
    <section className={styles.episodesSection}>
      <div className={styles.episodesHeader}>
        <h2 className={styles.episodesTitle}>Lista de Episodios</h2>
        <span className={styles.episodesStats}>
          {mainAnime.watchedEpisodes.length} / {episodes.length} VISTOS
        </span>
      </div>
      {canManageFiles && deleteSelectionMode && (
        <div className={styles.fileManagementBar}>
          <span className={styles.fileManagementText}>
            {selectedEpisodes.length > 0
              ? `${selectedEpisodes.length} episodios seleccionados`
              : `0 episodios seleccionados.`}
          </span>
          <div className={styles.fileManagementActions}>
            <button type="button" className={styles.fileManagementBtn} onClick={onClearEpisodeSelection}>
              LIMPIAR
            </button>
            <button
              type="button"
              className={`${styles.fileManagementBtn} ${styles.fileManagementBtnDanger}`}
              onClick={onDeleteSelectedEpisodes}
              disabled={selectedEpisodes.length === 0}
            >
              BORRAR SELECCION
            </button>
            <button
              type="button"
              className={`${styles.fileManagementBtn} ${styles.fileManagementBtnDanger}`}
              onClick={onDeleteAllEpisodes}
            >
              BORRAR TODO
            </button>
            <button type="button" className={styles.fileManagementBtn} onClick={onToggleDeleteMode}>
              CERRAR
            </button>
          </div>
        </div>
      )}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>
      <div className={styles.episodesList}>
        {episodes.map((epNum) => {
          const status = getEpisodeStatus(epNum);
          const isSelected = selectedEpisodes.includes(epNum);
          const canToggleDelete = deleteSelectionMode && status.deletableFiles.length > 0;
          const isPlaying =
            String(playingEp?.animeId || "") === String(mainAnime.malId || mainAnime.mal_id || "") &&
            playingEp?.epNumber === epNum;
          const isPlayable = !deleteSelectionMode && !!status.file && status.type !== "tagDownloading";
          const availability = torrentMatchesByEpisode[epNum] || { matches: [], hasPrincipalMatch: false };
          const matches = availability.matches;
          const hasPrincipalMatch = availability.hasPrincipalMatch;

          return (
            <div
              key={epNum}
              className={`${styles.episodeCard} ${isPlaying ? styles.episodeCardPlaying : ""} ${isPlayable ? styles.episodeCardPlayable : ""} ${isSelected ? styles.episodeCardSelected : ""} ${canToggleDelete ? styles.episodeCardSelectableDelete : ""}`}
              onClick={() => {
                if (canToggleDelete) {
                  onToggleEpisodeSelection(epNum);
                  return;
                }
                if (isPlayable) {
                  handlePlayEpisode(epNum, status.file.path);
                }
              }}
              onContextMenu={(event) => handleContextMenu(event, epNum, status)}
            >
              {deleteSelectionMode && status.deletableFiles.length > 0 && (
                <span className={`${styles.episodeSelectToggle} ${isSelected ? styles.episodeSelectToggleActive : ""}`}>
                  {isSelected ? "X" : "+"}
                </span>
              )}
              {isPlayable && !isPlaying && (
                <span className={styles.epPlayIcon}>
                  <svg width="40" height="50" viewBox="0 0 70 90" className={styles.playPixel}>
                    <polygon
                      points="0,0 12,0 12,6 18,6 18,12 24,12 24,18 30,18 30,24 36,24 36,30 42,30 42,36 48,36 48,42 42,42 42,48 36,48 36,54 30,54 30,60 24,60 24,66 18,66 18,72 12,72 12,78 0,78"
                      className={styles.pixelFill}
                    />
                  </svg>
                  <span className={styles.playText}>REPRODUCIR</span>
                </span>
              )}
              <div className={styles.episodeInfo}>
                <span className={styles.episodeTitle}>Episodio {epNum}</span>
                {status.type === "tagWatched" ? (
                  <span className={`${styles.statusTag} ${styles.tagWatched}`}>VISTO</span>
                ) : (
                  <span className={`${styles.statusTag} ${styles[status.type]}`}>{status.label}</span>
                )}
              </div>
              {isPlaying && <span className={styles.tagPlaying}>REPRODUCIENDO</span>}
              {(activeFansub || principalFansub) &&
                !isPlayable &&
                !isPlaying &&
                !deleteSelectionMode &&
                matches.length > 0 && (
                  <button
                    className={`${styles.torrentBtn} ${hasPrincipalMatch ? styles.torrentBtnPrincipal : styles.torrentBtnAlt}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTorrentModalItems(matches);
                      setTorrentModalOpen(true);
                    }}
                  >
                    Disponible
                  </button>
                )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
