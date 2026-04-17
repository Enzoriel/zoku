import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../hooks/useStore";
import { useToast } from "../hooks/useToast";
import { WATCH_TIMER_MS } from "../constants";
import ConfirmModal from "../components/ui/ConfirmModal";
import { checkPlayerStatus, launchConfiguredPlayer, normalizeComparablePath } from "../services/fileSystem";
import { getConfiguredPlayerProcessNames, isValidPlayerConfig } from "../utils/playerDetection";
import { updateAnimeWatchProgress } from "../utils/watchProgress";
import styles from "./PlaybackContext.module.css";

const PlaybackContext = createContext(null);

const POLL_INTERVAL_MS = 3000;
const PLAYER_CLOSE_RETRY_MS = 1000;
const MISSING_LOCK_POLLS_BEFORE_FALLBACK = 3;
const REQUIRED_SWITCH_CONFIRMATIONS = 2;
const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".avi", ".webm", ".mov"];

function isVideoPath(path) {
  const normalized = String(path || "").toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAnimeFromStore(data, animeId) {
  if (!animeId) return null;
  const id = String(animeId);
  return data?.myAnimes?.[id] || null;
}

function resolveCandidateFilesFromStore(data, animeId, initialFilePath) {
  const anime = getAnimeFromStore(data, animeId);
  const normalizedInitialPath = normalizeComparablePath(initialFilePath);
  const folders = Object.values(data?.localFiles || {}).filter((folder) => {
    if (!folder?.files?.length) return false;
    if (anime?.folderName && folder.folderName === anime.folderName) return true;

    const resolvedId =
      folder?.resolvedMalId ?? folder?.malId ?? folder?.animeData?.malId ?? folder?.animeData?.mal_id ?? null;
    if (resolvedId !== null && String(resolvedId) === String(animeId)) return true;

    return folder.files.some((file) => normalizeComparablePath(file.path) === normalizedInitialPath);
  });

  return folders.flatMap((folder) => folder.files || []);
}

function sortCandidateFiles(files, currentEpisodeNumber, currentFilePath) {
  const normalizedCurrentPath = normalizeComparablePath(currentFilePath);

  return [...files].sort((first, second) => {
    const firstIsCurrent = normalizeComparablePath(first.path) === normalizedCurrentPath ? 0 : 1;
    const secondIsCurrent = normalizeComparablePath(second.path) === normalizedCurrentPath ? 0 : 1;
    if (firstIsCurrent !== secondIsCurrent) return firstIsCurrent - secondIsCurrent;

    const firstDistance = Number.isFinite(first.episodeNumber)
      ? Math.abs(first.episodeNumber - currentEpisodeNumber)
      : Number.MAX_SAFE_INTEGER;
    const secondDistance = Number.isFinite(second.episodeNumber)
      ? Math.abs(second.episodeNumber - currentEpisodeNumber)
      : Number.MAX_SAFE_INTEGER;
    if (firstDistance !== secondDistance) return firstDistance - secondDistance;

    return first.name.localeCompare(second.name);
  });
}

function buildCandidateSnapshot({ data, animeId, episodeNumber, filePath, candidateFiles }) {
  const anime = getAnimeFromStore(data, animeId);
  const initialPath = normalizeComparablePath(filePath);
  const resolvedFiles = candidateFiles?.length
    ? candidateFiles
    : resolveCandidateFilesFromStore(data, animeId, filePath);
  const uniqueByPath = new Map();

  resolvedFiles.forEach((file) => {
    const normalizedPath = normalizeComparablePath(file?.path);
    if (!normalizedPath || uniqueByPath.has(normalizedPath)) return;
    uniqueByPath.set(normalizedPath, {
      name: file?.name || "",
      path: normalizedPath,
      episodeNumber: Number.isFinite(file?.episodeNumber) ? file.episodeNumber : null,
      isDownloading: Boolean(file?.isDownloading),
    });
  });

  if (!uniqueByPath.has(initialPath)) {
    uniqueByPath.set(initialPath, {
      name: filePath?.split(/[\\/]/).pop() || "",
      path: initialPath,
      episodeNumber,
      isDownloading: false,
    });
  }

  const rawFiles = [...uniqueByPath.values()];
  const singleEpisodeAnime = (anime?.totalEpisodes || anime?.episodes || 0) === 1;
  const playableCount = rawFiles.filter((file) => !file.isDownloading && isVideoPath(file.path)).length;

  const normalizedFiles = rawFiles
    .map((file) => {
      const isInitialFile = file.path === initialPath;
      let nextEpisodeNumber = Number.isFinite(file.episodeNumber) ? file.episodeNumber : null;

      if (!Number.isFinite(nextEpisodeNumber)) {
        if (isInitialFile) {
          nextEpisodeNumber = episodeNumber;
        } else if (singleEpisodeAnime || playableCount <= 1) {
          nextEpisodeNumber = 1;
        }
      }

      return {
        ...file,
        episodeNumber: Number.isFinite(nextEpisodeNumber) ? nextEpisodeNumber : null,
      };
    })
    .filter((file) => {
      if (file.path === initialPath) return true;
      if (file.isDownloading || !isVideoPath(file.path)) return false;
      return Number.isFinite(file.episodeNumber);
    });

  return sortCandidateFiles(normalizedFiles, episodeNumber, initialPath);
}

function setForSession(mapLike, episodeNumber, shouldAdd) {
  if (!Number.isFinite(episodeNumber)) return;
  if (shouldAdd) {
    mapLike.add(episodeNumber);
  } else {
    mapLike.delete(episodeNumber);
  }
}

function getCurrentPlayerConfig(data) {
  return data?.settings?.playerConfig || null;
}

function getPlayingEpState(session) {
  if (!session) return null;
  return { animeId: String(session.animeId), epNumber: session.currentEpisodeNumber };
}

function openConfigurationPage() {
  if (window.location.pathname === "/configuration") return;
  window.history.pushState({}, "", "/configuration");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function PlaybackProvider({ children }) {
  const { data, setMyAnimes } = useStore();
  const { toast, showToast } = useToast();
  const [playingEp, setPlayingEp] = useState(null);
  const [playerLaunchError, setPlayerLaunchError] = useState(null);

  const dataRef = useRef(data);
  const sessionRef = useRef(null);
  const sessionIdRef = useRef(0);
  const pollTimeoutRef = useRef(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const clearPollTimer = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const clearSession = useCallback(() => {
    clearPollTimer();
    sessionRef.current = null;
    setPlayingEp(null);
  }, [clearPollTimer]);

  const updateAnimeEpisodeProgress = useCallback(
    async (animeId, episodeNumber, markWatched) => {
      const watchedAt = new Date().toISOString();
      await setMyAnimes((previous) => {
        const currentAnime = previous?.[animeId];
        if (!currentAnime) return previous;

        const updatedAnime = updateAnimeWatchProgress(currentAnime, episodeNumber, {
          markWatched,
          watchedAt,
        });

        if (updatedAnime === currentAnime) return previous;
        return { ...previous, [animeId]: updatedAnime };
      });
    },
    [setMyAnimes],
  );

  const maybeMarkEpisodeWatched = useCallback(
    async (sessionId, sessionSnapshot, episodeNumber, watchStartedAt, options = {}) => {
      if (!Number.isFinite(episodeNumber)) return false;
      if (sessionId !== sessionIdRef.current) return false;

      const activeSession = sessionRef.current;
      if (!activeSession || activeSession.token !== sessionSnapshot.token) return false;
      if (!options.ignorePendingSwitch && activeSession.pendingSwitch) return false;
      if (activeSession.markedEpisodes.has(episodeNumber) || activeSession.suppressedEpisodes.has(episodeNumber)) {
        return false;
      }
      if (Date.now() - watchStartedAt < WATCH_TIMER_MS) return false;

      await updateAnimeEpisodeProgress(activeSession.animeId, episodeNumber, true);

      if (
        sessionId !== sessionIdRef.current ||
        !sessionRef.current ||
        sessionRef.current.token !== sessionSnapshot.token
      ) {
        return false;
      }

      sessionRef.current.markedEpisodes.add(episodeNumber);
      showToast(`Episodio ${episodeNumber} marcado como visto`, "success");
      return true;
    },
    [showToast, updateAnimeEpisodeProgress],
  );

  const finalizeSession = useCallback(
    async (sessionId) => {
      if (sessionId !== sessionIdRef.current) return;

      const activeSession = sessionRef.current;
      if (!activeSession) return;

      await maybeMarkEpisodeWatched(
        sessionId,
        activeSession,
        activeSession.currentEpisodeNumber,
        activeSession.watchStartedAt,
        { ignorePendingSwitch: true },
      );

      if (sessionId !== sessionIdRef.current) return;
      clearSession();
    },
    [clearSession, maybeMarkEpisodeWatched],
  );

  const schedulePoll = useCallback(
    (sessionId, delay = POLL_INTERVAL_MS) => {
      clearPollTimer();
      pollTimeoutRef.current = setTimeout(() => {
        void (async () => {
          if (sessionId !== sessionIdRef.current) return;

          const activeSession = sessionRef.current;
          if (!activeSession) return;

          const playerConfig = getCurrentPlayerConfig(dataRef.current);
          const preferredProcessNames = getConfiguredPlayerProcessNames(playerConfig);
          const candidatePaths = activeSession.candidateFilesSnapshot.map((file) => file.path);
          let status = await checkPlayerStatus(candidatePaths, preferredProcessNames);

          if (sessionId !== sessionIdRef.current || !sessionRef.current) return;

          if (!status.isRunning) {
            await sleep(PLAYER_CLOSE_RETRY_MS);
            if (sessionId !== sessionIdRef.current || !sessionRef.current) return;

            status = await checkPlayerStatus(candidatePaths, preferredProcessNames);
            if (sessionId !== sessionIdRef.current || !sessionRef.current) return;

            if (!status.isRunning) {
              await finalizeSession(sessionId);
              return;
            }
          }

          if (sessionId !== sessionIdRef.current || !sessionRef.current) return;

          const session = sessionRef.current;
          const normalizedDetectedPath = status.activeFile?.path || null;

          if (normalizedDetectedPath) {
            session.missingLockPolls = 0;
            session.mode = "advanced";

            if (normalizedDetectedPath === session.currentFilePath) {
              session.pendingSwitch = null;
            } else {
              const nextCandidate = session.candidateByPath.get(normalizedDetectedPath);
              if (nextCandidate) {
                if (session.pendingSwitch?.path === normalizedDetectedPath) {
                  session.pendingSwitch.confirmations += 1;
                } else {
                  session.pendingSwitch = {
                    path: normalizedDetectedPath,
                    episodeNumber: nextCandidate.episodeNumber,
                    confirmations: 1,
                  };
                }

                if (session.pendingSwitch.confirmations >= REQUIRED_SWITCH_CONFIRMATIONS) {
                  await maybeMarkEpisodeWatched(
                    sessionId,
                    session,
                    session.currentEpisodeNumber,
                    session.watchStartedAt,
                    { ignorePendingSwitch: true },
                  );

                  if (sessionId !== sessionIdRef.current || !sessionRef.current) return;

                  session.currentFilePath = normalizedDetectedPath;
                  session.currentEpisodeNumber = nextCandidate.episodeNumber;
                  session.watchStartedAt = Date.now();
                  session.pendingSwitch = null;
                  session.mode = "advanced";
                  setPlayingEp(getPlayingEpState(session));
                }
              }
            }
          } else {
            session.missingLockPolls += 1;
            if (session.missingLockPolls >= MISSING_LOCK_POLLS_BEFORE_FALLBACK) {
              session.mode = "fallback";
            }
          }

          const latestSession = sessionRef.current;
          if (!latestSession || sessionId !== sessionIdRef.current) return;

          if (latestSession.mode === "advanced" && normalizedDetectedPath === latestSession.currentFilePath) {
            await maybeMarkEpisodeWatched(
              sessionId,
              latestSession,
              latestSession.currentEpisodeNumber,
              latestSession.watchStartedAt,
            );
          } else if (latestSession.mode === "fallback") {
            await maybeMarkEpisodeWatched(
              sessionId,
              latestSession,
              latestSession.currentEpisodeNumber,
              latestSession.watchStartedAt,
            );
          }

          if (sessionId !== sessionIdRef.current || !sessionRef.current) return;
          schedulePoll(sessionId);
        })();
      }, delay);
    },
    [clearPollTimer, finalizeSession, maybeMarkEpisodeWatched],
  );

  const cancelPlayback = useCallback(() => {
    sessionIdRef.current += 1;
    clearSession();
  }, [clearSession]);

  const playEpisode = useCallback(
    async ({ animeId, episodeNumber, filePath, candidateFiles }) => {
      if (!animeId || !Number.isFinite(episodeNumber) || !filePath) return false;

      const playerConfig = getCurrentPlayerConfig(dataRef.current);
      if (!isValidPlayerConfig(playerConfig)) {
        setPlayerLaunchError(
          "No hay un reproductor configurado valido. Configuralo en Ajustes para poder abrir episodios.",
        );
        return false;
      }

      const nextSessionId = sessionIdRef.current + 1;
      sessionIdRef.current = nextSessionId;
      clearSession();

      const normalizedCandidates = buildCandidateSnapshot({
        data: dataRef.current,
        animeId: String(animeId),
        episodeNumber,
        filePath,
        candidateFiles,
      });

      const launchResult = await launchConfiguredPlayer(playerConfig.executablePath, filePath);
      if (sessionIdRef.current !== nextSessionId) return false;

      if (!launchResult.ok) {
        setPlayerLaunchError(
          "El reproductor configurado no pudo abrir este episodio. Revisa la ruta del ejecutable en Configuracion.",
        );
        return false;
      }

      const normalizedFilePath = normalizeComparablePath(filePath);
      const candidateMap = new Map(normalizedCandidates.map((candidate) => [candidate.path, candidate]));
      if (!candidateMap.has(normalizedFilePath)) {
        candidateMap.set(normalizedFilePath, {
          name: filePath.split(/[\\/]/).pop() || "",
          path: normalizedFilePath,
          episodeNumber,
          isDownloading: false,
        });
      }

      const session = {
        token: nextSessionId,
        animeId: String(animeId),
        currentEpisodeNumber: episodeNumber,
        currentFilePath: normalizedFilePath,
        candidateFilesSnapshot: sortCandidateFiles([...candidateMap.values()], episodeNumber, normalizedFilePath),
        candidateByPath: candidateMap,
        watchStartedAt: Date.now(),
        markedEpisodes: new Set(),
        suppressedEpisodes: new Set(),
        pendingSwitch: null,
        missingLockPolls: 0,
        mode: "advanced",
      };

      sessionRef.current = session;
      setPlayingEp(getPlayingEpState(session));
      schedulePoll(nextSessionId);
      return true;
    },
    [clearSession, schedulePoll],
  );

  const toggleEpisodeWatched = useCallback(
    async (animeId, episodeNumber, currentlyWatched) => {
      if (!animeId || !Number.isFinite(episodeNumber)) return;

      const markWatched = !currentlyWatched;
      await updateAnimeEpisodeProgress(String(animeId), episodeNumber, markWatched);

      const activeSession = sessionRef.current;
      if (!activeSession) return;
      if (activeSession.animeId !== String(animeId) || activeSession.currentEpisodeNumber !== episodeNumber) return;

      if (markWatched) {
        setForSession(activeSession.suppressedEpisodes, episodeNumber, false);
        setForSession(activeSession.markedEpisodes, episodeNumber, true);
        return;
      }

      setForSession(activeSession.markedEpisodes, episodeNumber, false);
      setForSession(activeSession.suppressedEpisodes, episodeNumber, true);
    },
    [updateAnimeEpisodeProgress],
  );

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const value = useMemo(
    () => ({
      playingEp,
      playEpisode,
      cancelPlayback,
      toggleEpisodeWatched,
    }),
    [playingEp, playEpisode, cancelPlayback, toggleEpisodeWatched],
  );

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      {playerLaunchError && (
        <ConfirmModal
          title="Reproductor no disponible"
          message={playerLaunchError}
          onConfirm={() => {
            setPlayerLaunchError(null);
            openConfigurationPage();
          }}
          onCancel={() => setPlayerLaunchError(null)}
          confirmLabel="IR A CONFIGURACION"
        />
      )}
      {toast && (
        <div className={styles.toast} data-type={toast.type} role="alert" aria-live="polite">
          {toast.message}
        </div>
      )}
    </PlaybackContext.Provider>
  );
}

export function usePlaybackContext() {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback debe usarse dentro de PlaybackProvider");
  }
  return context;
}
