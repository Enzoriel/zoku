import { useStore } from "../../hooks/useStore";
import { useAnime } from "../../context/AnimeContext";
import { useRecentAnime } from "../../hooks/useRecentAnime";
import { useTorrentAliasLearning } from "../../hooks/useTorrentAliasLearning";

/**
 * Componente funcional que no renderiza nada, pero orquestra la sincronización
 * global de la aplicación (como el aprendizaje de alias de torrents en segundo plano).
 */
export function GlobalSync() {
  const { data: storeData } = useStore();
  const { seasonalAnime } = useAnime();
  
  // Obtenemos los animes en emisión (incluyendo los de la biblioteca que no son de temporada)
  const { allAiringAnime } = useRecentAnime(
    seasonalAnime,
    storeData.myAnimes
  );

  // Activamos el aprendizaje automático de alias de Nyaa
  useTorrentAliasLearning(allAiringAnime);

  return null;
}
