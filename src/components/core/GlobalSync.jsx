import { useRecentAnimeContext } from "../../context/RecentAnimeContext";
import { useTorrentAliasLearning } from "../../hooks/useTorrentAliasLearning";

/**
 * Componente funcional que no renderiza nada, pero orquestra la sincronización
 * global de la aplicación (como el aprendizaje de alias de torrents en segundo plano).
 */
export function GlobalSync() {
  const { allAiringAnime } = useRecentAnimeContext();

  // Activamos el aprendizaje automático de alias de Nyaa
  useTorrentAliasLearning(allAiringAnime);

  return null;
}
