import { useCallback, useEffect, useMemo, useRef } from "react";
import { getReleasedEpisodeCount, isAnimeActivelyAiring } from "../../../utils/airingStatus";
import { getEpisodeTorrentAvailability } from "../../../utils/torrentAvailability";
import styles from "../../../pages/AnimeDetails.module.css";

const LEFT_MOUSE_BUTTON = 0;
const RIGHT_MOUSE_BUTTON = 2;
const RIGHT_MOUSE_BUTTON_MASK = 2;
const SELECT_DRAG_THRESHOLD = 5;
const AUTO_SCROLL_EDGE_PX = 42;
const AUTO_SCROLL_MAX_STEP = 16;

function areNumberArraysEqual(first, second) {
  if (first.length !== second.length) return false;
  return first.every((value, index) => value === second[index]);
}

function buildSortedUniqueNumbers(values) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

export function EpisodeList({
  mainAnime,
  episodes,
  episodeFileMap = new Map(),
  torrentData,
  playingEp,
  handlePlayEpisode,
  handleContextMenu,
  principalFansub,
  activeFansub,
  setTorrentModalItems,
  setTorrentModalOpen,
  canManageFiles,
  selectedEpisodes,
  onReplaceEpisodeSelection,
  onClearEpisodeSelection,
}) {
  const listRef = useRef(null);
  const cardRefs = useRef(new Map());
  const selectionDragRef = useRef(null);
  const suppressLeftClickRef = useRef(false);
  const autoScrollFrameRef = useRef(null);
  const selectedEpisodesRef = useRef(selectedEpisodes);

  useEffect(() => {
    selectedEpisodesRef.current = selectedEpisodes;
  }, [selectedEpisodes]);

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

  const episodeStatusByNumber = useMemo(() => {
    const releasedEpisodes = getReleasedEpisodeCount(mainAnime);
    const animeStatus = mainAnime?.status;
    const watchedEpisodes = mainAnime?.watchedEpisodes || [];
    const statusMap = new Map();

    episodes.forEach((epNum) => {
      const isWatched = watchedEpisodes.includes(epNum);
      const localFiles = episodeFileMap.get(epNum) || [];
      const playableFile = localFiles.find((file) => !file.isDownloading) || null;
      const downloadingFile = localFiles.find((file) => file.isDownloading) || null;
      const localFile = playableFile || downloadingFile;
      const deletableFiles = localFiles.filter((file) => !file.isDownloading);

      if (isWatched) {
        statusMap.set(epNum, { label: "VISTO", type: "tagWatched", file: localFile, deletableFiles });
        return;
      }

      if (!playableFile && downloadingFile) {
        statusMap.set(epNum, { label: "DESCARGANDO", type: "tagDownloading", file: downloadingFile, deletableFiles });
        return;
      }

      if (playableFile) {
        statusMap.set(epNum, { label: "DESCARGADO", type: "tagDownloaded", file: playableFile, deletableFiles });
        return;
      }

      if (animeStatus === "Finalizado" || animeStatus === "Finished Airing" || animeStatus === "FINISHED") {
        statusMap.set(epNum, { label: "EMITIDO", type: "tagAired", file: null, deletableFiles });
        return;
      }

      if (
        animeStatus === "Proximamente" ||
        animeStatus === "Proximo" ||
        animeStatus === "Pr\u00f3ximamente" ||
        animeStatus === "NOT_YET_RELEASED" ||
        animeStatus === "Not yet aired"
      ) {
        statusMap.set(epNum, { label: "PROXIMO", type: "tagNotAired", file: null, deletableFiles });
        return;
      }

      if (
        (mainAnime?.nextAiringEpisode || isAnimeActivelyAiring(mainAnime) || releasedEpisodes > 0) &&
        epNum <= releasedEpisodes
      ) {
        statusMap.set(epNum, { label: "EMITIDO", type: "tagAired", file: null, deletableFiles });
        return;
      }

      statusMap.set(epNum, { label: "PROXIMO", type: "tagNotAired", file: null, deletableFiles });
    });

    return statusMap;
  }, [episodeFileMap, episodes, mainAnime]);

  const selectableEpisodes = useMemo(
    () =>
      new Set(
        episodes.filter((epNum) => (episodeStatusByNumber.get(epNum)?.deletableFiles || []).length > 0),
      ),
    [episodeStatusByNumber, episodes],
  );

  const replaceSelectionIfChanged = useCallback(
    (nextEpisodes) => {
      const next = buildSortedUniqueNumbers(nextEpisodes).filter((epNum) => selectableEpisodes.has(epNum));
      if (areNumberArraysEqual(next, selectedEpisodesRef.current)) return;
      selectedEpisodesRef.current = next;
      onReplaceEpisodeSelection(next);
    },
    [onReplaceEpisodeSelection, selectableEpisodes],
  );

  const stopAutoScroll = useCallback(() => {
    if (!autoScrollFrameRef.current) return;
    cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
  }, []);

  const selectRangeToPoint = useCallback(
    (clientY) => {
      const state = selectionDragRef.current;
      if (!state) return;

      let targetEp = state.lastTargetEp;
      for (const epNum of episodes) {
        if (!selectableEpisodes.has(epNum)) continue;
        const card = cardRefs.current.get(epNum);
        if (!card) continue;
        const rect = card.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          targetEp = epNum;
          break;
        }
      }

      state.lastTargetEp = targetEp;
      const startIndex = episodes.indexOf(state.startEp);
      const endIndex = episodes.indexOf(targetEp);
      if (startIndex < 0 || endIndex < 0) return;

      const minIndex = Math.min(startIndex, endIndex);
      const maxIndex = Math.max(startIndex, endIndex);
      const rangeEpisodes = episodes
        .slice(minIndex, maxIndex + 1)
        .filter((epNum) => selectableEpisodes.has(epNum));

      replaceSelectionIfChanged(
        state.shouldSelect
          ? [...state.baseSelection, ...rangeEpisodes]
          : state.baseSelection.filter((epNum) => !rangeEpisodes.includes(epNum)),
      );
    },
    [episodes, replaceSelectionIfChanged, selectableEpisodes],
  );

  const runAutoScroll = useCallback(
    (clientY) => {
      const list = listRef.current;
      const state = selectionDragRef.current;
      if (!list || !state?.didDrag) return;

      const getStep = (currentY) => {
        const rect = list.getBoundingClientRect();
        if (currentY < rect.top + AUTO_SCROLL_EDGE_PX) {
          return -Math.ceil(((rect.top + AUTO_SCROLL_EDGE_PX - currentY) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP);
        }
        if (currentY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
          return Math.ceil(((currentY - (rect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP);
        }
        return 0;
      };

      if (getStep(clientY) === 0) {
        stopAutoScroll();
        return;
      }

      state.autoScrollClientY = clientY;
      if (autoScrollFrameRef.current) return;

      const tick = () => {
        const currentState = selectionDragRef.current;
        if (!currentState?.didDrag) {
          autoScrollFrameRef.current = null;
          return;
        }
        const step = getStep(currentState.autoScrollClientY);
        if (step === 0) {
          autoScrollFrameRef.current = null;
          return;
        }
        list.scrollTop += step;
        selectRangeToPoint(currentState.autoScrollClientY);
        autoScrollFrameRef.current = requestAnimationFrame(tick);
      };

      autoScrollFrameRef.current = requestAnimationFrame(tick);
    },
    [selectRangeToPoint, stopAutoScroll],
  );

  const finishSelectionDrag = useCallback(
    (event) => {
      const state = selectionDragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      stopAutoScroll();
      selectionDragRef.current = null;
      const nextSelection = selectedEpisodesRef.current.length > 0 ? selectedEpisodesRef.current : [state.startEp];
      event.preventDefault();
      event.stopPropagation();
      handleContextMenu(event, nextSelection);
    },
    [handleContextMenu, stopAutoScroll],
  );

  const handleEpisodePointerDown = useCallback(
    (event, epNum) => {
      if (event.pointerType !== "mouse") return;

      if (event.button === LEFT_MOUSE_BUTTON) {
        if (selectedEpisodesRef.current.length > 0) {
          suppressLeftClickRef.current = true;
          selectedEpisodesRef.current = [];
          onClearEpisodeSelection();
        }
        return;
      }

      if (event.button !== RIGHT_MOUSE_BUTTON) return;
      if (!canManageFiles || !selectableEpisodes.has(epNum)) {
        event.preventDefault();
        return;
      }
      if (event.target instanceof Element && event.target.closest("button")) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      const baseSelection = [];
      replaceSelectionIfChanged([epNum]);

      selectionDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startEp: epNum,
        lastTargetEp: epNum,
        shouldSelect: true,
        baseSelection,
        didDrag: false,
        autoScrollClientY: event.clientY,
      };
    },
    [canManageFiles, onClearEpisodeSelection, replaceSelectionIfChanged, selectableEpisodes],
  );

  const handleEpisodePointerMove = useCallback(
    (event) => {
      const state = selectionDragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if ((event.buttons & RIGHT_MOUSE_BUTTON_MASK) !== RIGHT_MOUSE_BUTTON_MASK) {
        finishSelectionDrag(event);
        return;
      }

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      if (!state.didDrag && Math.hypot(deltaX, deltaY) < SELECT_DRAG_THRESHOLD) return;

      state.didDrag = true;
      event.preventDefault();
      event.stopPropagation();
      selectRangeToPoint(event.clientY);
      runAutoScroll(event.clientY);
    },
    [finishSelectionDrag, runAutoScroll, selectRangeToPoint],
  );

  const handleEpisodeClick = useCallback(
    (event, epNum, status, isPlayable) => {
      if (suppressLeftClickRef.current) {
        suppressLeftClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isPlayable) {
        handlePlayEpisode(epNum, status.file.path);
      }
    },
    [handlePlayEpisode],
  );

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

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
      <div ref={listRef} className={styles.episodesList}>
        {episodes.map((epNum) => {
          const status = episodeStatusByNumber.get(epNum);
          const isSelected = selectedEpisodes.includes(epNum);
          const canToggleDelete = canManageFiles && selectableEpisodes.has(epNum);
          const isPlaying =
            String(playingEp?.animeId || "") === String(mainAnime.malId || mainAnime.mal_id || "") &&
            playingEp?.epNumber === epNum;
          const isPlayable = !!status.file && status.type !== "tagDownloading";
          const availability = torrentMatchesByEpisode[epNum] || { matches: [], hasPrincipalMatch: false };
          const matches = availability.matches;
          const hasPrincipalMatch = availability.hasPrincipalMatch;

          return (
            <div
              key={epNum}
              ref={(node) => {
                if (node) cardRefs.current.set(epNum, node);
                else cardRefs.current.delete(epNum);
              }}
              data-episode-number={epNum}
              className={`${styles.episodeCard} ${isPlaying ? styles.episodeCardPlaying : ""} ${isPlayable ? styles.episodeCardPlayable : ""} ${isSelected ? styles.episodeCardSelected : ""} ${canToggleDelete ? styles.episodeCardSelectableDelete : ""}`}
              onPointerDown={(event) => handleEpisodePointerDown(event, epNum)}
              onPointerMove={handleEpisodePointerMove}
              onPointerUp={finishSelectionDrag}
              onPointerCancel={finishSelectionDrag}
              onClick={(event) => handleEpisodeClick(event, epNum, status, isPlayable)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
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
              {(activeFansub || principalFansub) && !isPlayable && !isPlaying && matches.length > 0 && (
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
