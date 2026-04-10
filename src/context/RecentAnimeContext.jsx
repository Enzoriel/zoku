import { createContext, useContext, useMemo } from "react";
import { useAnime } from "./AnimeContext";
import { useRecentAnime } from "../hooks/useRecentAnime";
import { useStore } from "../hooks/useStore";

const RecentAnimeContext = createContext(null);

export function RecentAnimeProvider({ children }) {
  const { data } = useStore();
  const { seasonalAnime } = useAnime();
  
  const { allAiringAnime, loadingExtra, errorExtra, retryExtra } = useRecentAnime(seasonalAnime, data.myAnimes);

  const value = useMemo(
    () => ({ allAiringAnime, loadingExtra, errorExtra, retryExtra }),
    [allAiringAnime, loadingExtra, errorExtra, retryExtra]
  );

  return <RecentAnimeContext.Provider value={value}>{children}</RecentAnimeContext.Provider>;
}

export function useRecentAnimeContext() {
  const ctx = useContext(RecentAnimeContext);
  if (!ctx) throw new Error("useRecentAnimeContext must be inside RecentAnimeProvider");
  return ctx;
}
