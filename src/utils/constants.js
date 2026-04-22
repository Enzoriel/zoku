export const SUPPORTED_RESOLUTIONS = ["2160p", "1080p", "720p", "480p"];

export const PRESET_FANSUBS = ["SubsPlease", "Erai-raws", "ASW", "Judas", "Ember", "LostYears", "Yameii", "DKB"];

/**
 * Detalle de cada preset: idioma default, categoría Nyaa, y si tiene subs en español.
 *
 * - nyaaCategory: "1_2" = english-translated, "1_3" = non-english
 * - hasSpanishSubs: true si el fansub sube en 1_2 pero incluye subs .es internos
 */
export const PRESET_FANSUBS_DETAIL = [
  { name: "SubsPlease", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false, useResolutionFilter: true },
  { name: "Erai-raws", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: true, useResolutionFilter: true },
  { name: "ASW", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false, useResolutionFilter: true },
  { name: "Judas", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false, useResolutionFilter: true },
  { name: "Ember", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false, useResolutionFilter: true },
  { name: "LostYears", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false, useResolutionFilter: true },
  { name: "Yameii", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: false, useResolutionFilter: true },
  { name: "DKB", defaultLang: "en", nyaaCategory: "1_2", hasSpanishSubs: true, useResolutionFilter: true },
];

export const DAY_NAMES = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
export const DAY_NAMES_SHORT = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
