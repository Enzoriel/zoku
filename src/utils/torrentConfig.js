/**
 * Helpers para leer la configuración de fansubs desde settings.
 */

/**
 * Devuelve el nombre del fansub principal, o null si no hay ninguno.
 * @param {object} settings
 * @returns {string|null}
 */
export function getPrincipalFansub(settings) {
  return settings?.torrent?.fansubs?.find((f) => f.principal)?.name ?? null;
}

/**
 * Devuelve el array completo de fansubs configurados.
 * @param {object} settings
 * @returns {Array<{name: string, principal: boolean}>}
 */
export function getAllFansubs(settings) {
  return settings?.torrent?.fansubs ?? [];
}

/**
 * Devuelve la resolución preferida (1080p, 720p, etc.)
 * @param {object} settings
 * @returns {string}
 */
export function getPreferredResolution(settings) {
  return settings?.torrent?.resolution ?? "1080p";
}

/**
 * Devuelve true si el usuario ya configuró al menos un fansub.
 * @param {object} settings
 * @returns {boolean}
 */
export function hasConfiguredFansubs(settings) {
  return (settings?.torrent?.fansubs?.length ?? 0) > 0;
}
