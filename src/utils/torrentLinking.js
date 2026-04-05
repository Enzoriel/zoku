import { extractBaseTitle, deriveTorrentAliasFromTitle } from "./titleIdentity";

/**
 * Deriva los campos de vinculación de torrent a partir del título completo
 * de un item de Nyaa. Esta es la fuente canónica de la lógica de extracción.
 *
 * @param {string} nyaaTitle - Título completo del torrent (ej: "[SubsPlease] Ao no Exorcist - 25 [1080p].mkv")
 * @returns {{ torrentAlias: string, torrentSearchTerm: string, torrentTitle: string, diskAlias: string } | null}
 */
export function deriveTorrentLinkFields(nyaaTitle) {
  if (!nyaaTitle) return null;

  const torrentAlias = deriveTorrentAliasFromTitle(nyaaTitle);
  const diskAlias = extractBaseTitle(nyaaTitle);
  const torrentSearchTerm = torrentAlias || diskAlias;

  if (!torrentAlias && !diskAlias && !torrentSearchTerm) return null;

  return {
    torrentAlias,
    torrentSearchTerm,
    torrentTitle: nyaaTitle,
    diskAlias,
  };
}

/**
 * Aplica los campos de vinculación de torrent a un objeto de anime almacenado.
 * Retorna `null` si no hay cambios (para evitar escrituras innecesarias).
 *
 * @param {object} storedAnime - Entrada actual del anime en myAnimes
 * @param {object} linkFields - Campos derivados de `deriveTorrentLinkFields()`
 * @returns {object | null} - Nuevo objeto actualizado, o null si no hay cambios
 */
export function applyTorrentLinkFields(storedAnime, linkFields) {
  if (!storedAnime || !linkFields) return null;

  const isUnchanged =
    storedAnime.torrentAlias === linkFields.torrentAlias &&
    storedAnime.torrentSearchTerm === linkFields.torrentSearchTerm &&
    storedAnime.torrentTitle === linkFields.torrentTitle &&
    storedAnime.diskAlias === linkFields.diskAlias;

  if (isUnchanged) return null;

  return {
    ...storedAnime,
    torrentAlias: linkFields.torrentAlias,
    torrentSearchTerm: linkFields.torrentSearchTerm,
    torrentTitle: linkFields.torrentTitle,
    diskAlias: linkFields.diskAlias,
    lastUpdated: new Date().toISOString(),
  };
}
