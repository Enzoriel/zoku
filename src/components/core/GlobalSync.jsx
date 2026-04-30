import { useRecentAnimeContext } from "../../context/RecentAnimeContext";
import { useAnimeMetadataSync } from "../../hooks/useAnimeMetadataSync";
import { useTorrentAliasLearning } from "../../hooks/useTorrentAliasLearning";

export function GlobalSync() {
  const { allAiringAnime } = useRecentAnimeContext();

  useAnimeMetadataSync();
  useTorrentAliasLearning(allAiringAnime);

  return null;
}
