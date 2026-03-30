import { useMemo } from "react";
import { findTorrentMatches } from "../../../utils/torrentMatch";
import { extractEpisodeNumber } from "../../../utils/fileParsing";
import styles from "../../../pages/AnimeDetails.module.css";

export function EpisodeList({
  mainAnime,
  episodes,
  animeFilesData,
  torrentData,
  playingEp,
  handlePlayEpisode,
  handleContextMenu,
  principalFansub,
  setTorrentModalItems,
  setTorrentModalOpen,
  folderName,
}) {
  const progressPct = useMemo(() => 
    episodes.length > 0 ? (mainAnime?.watchedEpisodes?.length / episodes.length) * 100 : 0
  , [mainAnime?.watchedEpisodes, episodes.length]);

  const torrentMatchesByEpisode = useMemo(() => {
    const matchesMap = {};
    if (mainAnime && torrentData && torrentData.length > 0) {
      episodes.forEach((epNum) => {
        matchesMap[epNum] = findTorrentMatches(
          mainAnime.title,
          mainAnime.title_english,
          epNum,
          torrentData,
          mainAnime.torrentAlias
        );
      });
    }
    return matchesMap;
  }, [mainAnime, torrentData, episodes]);

  const getEpisodeStatus = (epNum) => {
    const isWatched = mainAnime?.watchedEpisodes?.includes(epNum);
    const localFile = animeFilesData.files.find((f) => {
      const n = f.episodeNumber ?? extractEpisodeNumber(f.name, [
        mainAnime?.title, 
        mainAnime?.title_english,
        folderName
      ]);
      return n !== null && n === epNum;
    });
    
    if (isWatched) return { label: "VISTO", type: "tagWatched", file: localFile };
    if (localFile?.isDownloading) return { label: "DESCARGANDO", type: "tagDownloading", file: localFile };
    if (localFile) return { label: "DESCARGADO", type: "tagDownloaded", file: localFile };
    
    const st = mainAnime?.status;
    if (st === "Finalizado" || st === "Finished Airing" || st === "FINISHED")
      return { label: "EMITIDO", type: "tagAired", file: null };
    if (st === "Próximamente" || st === "NOT_YET_RELEASED" || st === "Not yet aired")
      return { label: "PRÓXIMO", type: "tagNotAired", file: null };
    
    if (mainAnime?.nextAiringEpisode) {
      const nextEp = mainAnime.nextAiringEpisode.episode;
      if (epNum < nextEp) return { label: "EMITIDO", type: "tagAired", file: null };
      return { label: "PRÓXIMO", type: "tagNotAired", file: null };
    }
    const airedEstimate = mainAnime?.episodes || mainAnime?.episodeList?.length || 0;
    if (airedEstimate > 0 && epNum <= airedEstimate) return { label: "EMITIDO", type: "tagAired", file: null };
    return { label: "PRÓXIMO", type: "tagNotAired", file: null };
  };


  return (
    <section className={styles.episodesSection}>
      <div className={styles.episodesHeader}>
        <h2 className={styles.episodesTitle}>Lista de Episodios</h2>
        <span className={styles.episodesStats}>
          {mainAnime.watchedEpisodes.length} / {episodes.length} VISTOS
        </span>
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>
      <div className={styles.episodesList}>
        {episodes.map((epNum) => {
          const status = getEpisodeStatus(epNum);
          const isPlaying = playingEp?.animeId === (mainAnime.malId || mainAnime.mal_id) && playingEp?.epNumber === epNum;
          const isPlayable = !!status.file && status.type !== "tagDownloading";
          const matches = torrentMatchesByEpisode[epNum] || [];
          const hasPrincipalMatch = matches.some((m) => m.fansub === principalFansub);

          return (
            <div
              key={epNum}
              className={`${styles.episodeCard} ${isPlaying ? styles.episodeCardPlaying : ""} ${isPlayable ? styles.episodeCardPlayable : ""}`}
              onClick={() => isPlayable && handlePlayEpisode(epNum, status.file.path)}
              onContextMenu={(e) => handleContextMenu(e, epNum, status.type === "tagWatched")}
            >
              {isPlayable && !isPlaying && (
                <span className={styles.epPlayIcon}>
                  <svg width="40" height="50" viewBox="0 0 70 90" className={styles.playPixel}>
                    <polygon points="0,0 12,0 12,6 18,6 18,12 24,12 24,18 30,18 30,24 36,24 36,30 42,30 42,36 48,36 48,42 42,42 42,48 36,48 36,54 30,54 30,60 24,60 24,66 18,66 18,72 12,72 12,78 0,78" className={styles.pixelFill} />
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
              {principalFansub && !isPlayable && !isPlaying && matches.length > 0 && (
                <button
                  className={`${styles.torrentBtn} ${hasPrincipalMatch ? styles.torrentBtnPrincipal : styles.torrentBtnAlt}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTorrentModalItems(matches);
                    setTorrentModalOpen(true);
                  }}
                >
                  ⬇ {hasPrincipalMatch ? "Disponible" : "Alternativa"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
