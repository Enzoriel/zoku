/**
 * Helpers para leer la configuración de fansubs desde settings.
 */

import { PRESET_FANSUBS_DETAIL } from "./constants";

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
 * @returns {Array<{name: string, principal: boolean, language?: string}>}
 */
export function getAllFansubs(settings) {
  return settings?.torrent?.fansubs ?? [];
}

/**
 * Devuelve los fansubs filtrados por idioma.
 * Si un fansub no tiene campo language, se asume "en".
 * @param {object} settings
 * @param {"en"|"es"} lang
 * @returns {Array<{name: string, principal: boolean, language?: string}>}
 */
export function getFansubsByLanguage(settings, lang) {
  return (settings?.torrent?.fansubs ?? []).filter(
    (f) => (f.language || "en") === lang,
  );
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
 * Devuelve true si el idioma preferido del usuario es espanol.
 * @param {object} settings
 * @returns {boolean}
 */
export function isSpanishUser(settings) {
  return settings?.torrent?.language === "es";
}

/**
 * Devuelve true si el usuario ya configuró al menos un fansub.
 * @param {object} settings
 * @returns {boolean}
 */
export function hasConfiguredFansubs(settings) {
  return (settings?.torrent?.fansubs?.length ?? 0) > 0;
}

/**
 * Devuelve la categoría de Nyaa para un fansub específico.
 * Prioridad: campo del fansub > PRESET_FANSUBS_DETAIL > categoría default según langMode.
 * @param {object} settings
 * @param {string} fansubName
 * @param {"en"|"es"} langMode — usado como fallback si no hay categoría definida
 * @returns {"1_2"|"1_3"}
 */
export function getNyaaCategoryForFansub(settings, fansubName, langMode = "en") {
  const fansubs = settings?.torrent?.fansubs ?? [];
  const fansub = fansubs.find((f) => f.name.toLowerCase() === fansubName.toLowerCase());

  // 1. Si el fansub tiene nyaaCategory definido, usarlo
  if (fansub?.nyaaCategory) return fansub.nyaaCategory;

  // 2. Buscar en presets
  const preset = PRESET_FANSUBS_DETAIL.find(
    (p) => p.name.toLowerCase() === fansubName.toLowerCase(),
  );
  if (preset) return preset.nyaaCategory;

  // 3. Fallback: categoría según langMode
  return langMode === "es" ? "1_3" : "1_2";
}

/**
 * Devuelve true si un fansub tiene capacidad de subtítulos en español.
 * @param {object} settings
 * @param {string} fansubName
 * @returns {boolean}
 */
export function isSpanishCapableFansub(settings, fansubName) {
  const fansubs = settings?.torrent?.fansubs ?? [];
  const fansub = fansubs.find((f) => f.name.toLowerCase() === fansubName.toLowerCase());

  // Si el fansub está marcado como español directamente
  if (fansub?.language === "es") return true;

  // Si tiene nyaaCategory "1_3", sube en non-english (probablemente .es)
  if (fansub?.nyaaCategory === "1_3") return true;

  // Buscar en presets si tiene subs en español
  const preset = PRESET_FANSUBS_DETAIL.find(
    (p) => p.name.toLowerCase() === fansubName.toLowerCase(),
  );
  if (preset?.hasSpanishSubs) return true;

  return false;
}

/**
 * Devuelve los fansubs que suben en una categoría específica de Nyaa.
 * @param {object} settings
 * @param {"1_2"|"1_3"} category
 * @returns {Array}
 */
export function getFansubsForCategory(settings, category) {
  return (settings?.torrent?.fansubs ?? []).filter((f) => {
    const cat = getNyaaCategoryForFansub(settings, f.name);
    return cat === category;
  });
}

/**
 * Obtiene el detalle de un fansub desde presets o valores default.
 * Centralizado aquí para evitar duplicación en WelcomeSetupModal y FansubOnboardingModal.
 * @param {string} name
 * @returns {{ name: string, defaultLang: string, nyaaCategory: string, hasSpanishSubs: boolean }}
 */
export function getFansubDetail(name) {
  const preset = PRESET_FANSUBS_DETAIL.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (preset) return preset;
  return { name, defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false };
}

/**
 * Determina la categoría de Nyaa para un tab dado.
 * Extrae la lógica duplicada que existía en fetchTorrents y el useEffect de TorrentPage.
 * @param {object} settings
 * @param {string} tab
 * @param {string|null} principalFansub
 * @param {"en"|"es"} langMode
 * @returns {"1_2"|"1_3"}
 */
export function getCategoryForTab(settings, tab, principalFansub, langMode) {
  if (tab !== "general" && tab !== principalFansub) {
    return getNyaaCategoryForFansub(settings, tab, langMode);
  }
  return langMode === "es" ? "1_3" : "1_2";
}
