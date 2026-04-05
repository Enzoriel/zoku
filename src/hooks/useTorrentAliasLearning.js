import { useEffect, useRef } from "react";
import { useStore } from "./useStore";
import { useTorrent } from "../context/TorrentContext";
import { findTorrentMatches } from "../utils/torrentMatch";
import { getReleasedEpisodeCount } from "../utils/airingStatus";
import { deriveTorrentLinkFields, applyTorrentLinkFields } from "../utils/torrentLinking";

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
    if (!libraryAnimes.some(a => !a.torrentAlias || !a.torrentSearchTerm)) return;

    const itemsToUpdate = [];
    allAiringAnime.forEach((anime) => {
      const id = anime.malId || anime.id;
      const stored = dataRef.current[id];
      
      // Solo aprendemos si está en la biblioteca y no tiene alias configurado
      if (stored && (!stored.torrentAlias || !stored.torrentSearchTerm)) {
        const lastAiredEp = getReleasedEpisodeCount(anime);
        
        if (lastAiredEp > 0) {
          const matches = findTorrentMatches(
            anime.title,
            anime.title_english || null,
            lastAiredEp,
            torrentData,
          );

          if (matches.length > 0) {
            const linkFields = deriveTorrentLinkFields(matches[0].title);
            if (linkFields) {
              itemsToUpdate.push({ id, linkFields });
            }
          }
        }
      }
    });

    if (itemsToUpdate.length > 0) {
      setMyAnimes((prev) => {
        const next = { ...prev };
        let changed = false;
        
        itemsToUpdate.forEach(({ id, linkFields }) => {
          if (!next[id]) return;

          const updated = applyTorrentLinkFields(next[id], linkFields);
          if (updated) {
            next[id] = updated;
            changed = true;
          }
        });
        
        return changed ? next : prev;
      });
    }
  }, [torrentData, allAiringAnime, torrentLoading, setMyAnimes]);
}
