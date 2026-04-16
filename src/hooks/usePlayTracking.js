import { useState, useCallback, useRef, useEffect } from "react";
import { useStore } from "./useStore";
import { isPlayerStillOpen, openFile } from "../services/fileSystem";
import { calculateUserStatus } from "../utils/animeStatus";

import { WATCH_TIMER_MS } from "../constants";

/**
 * Hook para gestionar el seguimiento de episodios en reproducción y el marcado automático como visto.
 * @param {Function} showToast - Callback opcional para mostrar notificaciones.
 */
export function usePlayTracking(showToast) {
  const { data, setMyAnimes } = useStore();
  const [playingEp, setPlayingEp] = useState(null); // { animeId, epNumber }

  const watchIntervalRef = useRef(null);
  const watchStartTimeRef = useRef(null);

  // Refs para evitar stale closures en el setInterval
  const settingsRef = useRef(data.settings);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    settingsRef.current = data.settings;
  }, [data.settings]);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const handleToggleWatched = useCallback(
    async (animeId, epNumber, currentlyWatched) => {
      if (!animeId) return;

      try {
        await setMyAnimes((prev) => {
          const current = prev[animeId];
          if (!current) return prev;

          const watchedEps = currentlyWatched
            ? (current.watchedEpisodes || []).filter((n) => n !== epNumber)
            : [...(current.watchedEpisodes || []), epNumber];

          const filteredHistory = (current.watchHistory || []).filter((h) => h.episode !== epNumber);
          const newHistory = currentlyWatched
            ? filteredHistory
            : [...filteredHistory, { episode: epNumber, watchedAt: new Date().toISOString() }];

          const updated = {
            ...current,
            watchedEpisodes: [...new Set(watchedEps)],
            watchHistory: newHistory,
            lastUpdated: new Date().toISOString(),
          };
          updated.userStatus = calculateUserStatus(updated);
          // HALL-51: Setear/limpiar completedAt según estado
          if (updated.userStatus === "COMPLETED" && !current.completedAt) {
            updated.completedAt = new Date().toISOString();
          } else if (updated.userStatus !== "COMPLETED" && current.completedAt) {
            updated.completedAt = null;
          }
          return { ...prev, [animeId]: updated };
        });
      } catch (e) {
        console.error("[usePlayTracking] Error al marcar como visto:", e);
      }
    },
    [setMyAnimes],
  );

  const handleToggleWatchedRef = useRef(handleToggleWatched);
  useEffect(() => {
    handleToggleWatchedRef.current = handleToggleWatched;
  }, [handleToggleWatched]);

  const handlePlayEpisode = useCallback(async (animeId, epNumber, filePath) => {
    if (!filePath) return;

    const ok = await openFile(filePath);
    if (!ok) {
      if (showToastRef.current) showToastRef.current("Error al abrir el reproductor.", "warn");
      return;
    }

    setPlayingEp({ animeId, epNumber });
    watchStartTimeRef.current = Date.now();

    if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);

    watchIntervalRef.current = setInterval(async () => {
      const currentPlayer = settingsRef.current?.player || "mpv";
      const stillOpen = await isPlayerStillOpen(currentPlayer);

      if (!stillOpen) {
        // Pequeño reintento de 300ms por seguridad (falsos negativos)
        await new Promise((r) => setTimeout(r, 300));
        const retryOpen = await isPlayerStillOpen(currentPlayer);

        if (!retryOpen) {
          clearInterval(watchIntervalRef.current);
          setPlayingEp(null);
          return;
        }
      }

      if (Date.now() - watchStartTimeRef.current >= WATCH_TIMER_MS) {
        clearInterval(watchIntervalRef.current);
        setPlayingEp(null);

        if (handleToggleWatchedRef.current) {
          await handleToggleWatchedRef.current(animeId, epNumber, false);
          if (showToastRef.current) showToastRef.current(`Episodio ${epNumber} marcado como visto`, "success");
        }
      }
    }, 5000);
  }, []);

  const cancelPlay = useCallback(() => {
    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
    setPlayingEp(null);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);

  return {
    playingEp,
    handlePlayEpisode,
    handleToggleWatched,
    cancelPlay,
  };
}
