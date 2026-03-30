import { useEffect, useRef } from "react";
import { useStore } from "./useStore";
import { useTorrent } from "../context/TorrentContext";
import { findTorrentMatches, extractAliasFromTitle } from "../utils/torrentMatch";

/**
 * Hook que observa los animes en emisión y los torrents recientes
 * para intentar "aprender" automáticamente el alias de Nyaa (fansub + título).
 * 
 * @param {Array} allAiringAnime - Lista de animes en emisión (con metadata de AniList)
 */
export function useTorrentAliasLearning(allAiringAnime) {
  const { data, setMyAnimes } = useStore();
  const { data: torrentData, isLoading: torrentLoading } = useTorrent();

  const dataRef = useRef(data.myAnimes);
  useEffect(() => { dataRef.current = data.myAnimes; }, [data.myAnimes]);

  useEffect(() => {
    if (torrentLoading || !allAiringAnime?.length || !torrentData?.length) return;

    // Solo procedemos si hay animes en la biblioteca sin alias
    const libraryAnimes = Object.values(dataRef.current);
    if (!libraryAnimes.some(a => !a.torrentAlias)) return;

    const itemsToUpdate = [];
    allAiringAnime.forEach((anime) => {
      const id = anime.malId || anime.id;
      const stored = dataRef.current[id];
      
      // Solo aprendemos si está en la biblioteca y no tiene alias configurado
      if (stored && !stored.torrentAlias) {
        const nextAiring = anime.nextAiringEpisode;
        const lastAiredEp = nextAiring ? nextAiring.episode - 1 : anime.episodes || 0;
        
        if (lastAiredEp > 0) {
          const titleRomaji = anime.title;
          const titleEnglish = anime.title_english || null;
          
          const matches = findTorrentMatches(titleRomaji, titleEnglish, lastAiredEp, torrentData);
          if (matches.length > 0) {
            const alias = extractAliasFromTitle(matches[0].title);
            if (alias) {
              itemsToUpdate.push({ id, alias });
            }
          }
        }
      }
    });

    if (itemsToUpdate.length > 0) {
      setMyAnimes((prev) => {
        const next = { ...prev };
        let changed = false;
        
        itemsToUpdate.forEach(({ id, alias }) => {
          if (next[id] && next[id].torrentAlias !== alias) {
            next[id] = { 
              ...next[id], 
              torrentAlias: alias, 
              lastUpdated: new Date().toISOString() 
            };
            changed = true;
          }
        });
        
        return changed ? next : prev;
      });
    }
  }, [torrentData, allAiringAnime, torrentLoading, setMyAnimes]);
}
