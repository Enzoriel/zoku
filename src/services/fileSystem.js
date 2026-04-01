import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import { extractEpisodeNumber, detectConstantNumbers } from "../utils/fileParsing";

const PLAYER_PROCESS_NAMES = {
  mpv: "mpv",
  vlc: "vlc",
  "mpc-hc": "mpc-hc64",
  "mpc-be": "mpc-be64",
  potplayer: "PotPlayerMini64",
};

const DOWNLOAD_ACTIVITY_GRACE_MS = 10 * 1000;
const DIRECT_DOWNLOAD_ACTIVITY_WINDOW_MS = 25 * 1000;

function normalizeComparablePath(path) {
  if (!path) return "";
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isPathWithinBase(targetPath, basePath) {
  const normalizedTarget = normalizeComparablePath(targetPath);
  const normalizedBase = normalizeComparablePath(basePath);

  if (!normalizedTarget || !normalizedBase) return false;
  return normalizedTarget.startsWith(`${normalizedBase}/`);
}

export async function isPlayerStillOpen(playerName) {
  const tryProcess = async (pName) => {
    try {
      const output = await Command.create("powershell", [
        "-Command",
        `Get-Process -Name "${pName}" -ErrorAction SilentlyContinue | Select-Object -First 1`,
      ]).execute();
      return output.stdout.trim().length > 0;
    } catch (err) {
      // console.error(`[FS] Error verificando proceso ${pName}:`, err);
      return false;
    }
  };

  // 1. Intentar el proceso específico configurado
  const specificName = PLAYER_PROCESS_NAMES[playerName] || playerName;
  if (await tryProcess(specificName)) return true;

  // 2. Si no se encuentra, hacer un barrido rápido por todos los conocidos (Broad check)
  // Esto ayuda si el sistema abrió un reproductor distinto al configurado
  for (const knownName of Object.values(PLAYER_PROCESS_NAMES)) {
    if (knownName === specificName) continue;
    if (await tryProcess(knownName)) return true;
  }

  return false;
}

export function normalizeForSearch(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[ \-_.]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function isFileInUseMessage(message) {
  const lowered = String(message || "").toLowerCase();
  return (
    lowered.includes("used by another process") ||
    lowered.includes("being used by another process") ||
    lowered.includes("file in use") ||
    lowered.includes("sharing violation") ||
    lowered.includes("resource busy") ||
    lowered.includes("ebusy") ||
    lowered.includes("siendo usado por otra aplicacion") ||
    lowered.includes("esta siendo usado por otra aplicacion") ||
    lowered.includes("os error 32") ||
    lowered.includes("os error 145") ||
    /acceso.*denegado/.test(lowered) ||
    /permiso.*denegado/.test(lowered) ||
    lowered.includes("directory is not empty")
  );
}

function isCompletedAnime(anime) {
  return anime?.userStatus === "COMPLETED";
}

function parseTimestamp(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isDirectDownloadActivity(file, intentAt, now = Date.now()) {
  const modifiedAtMs = Number(file?.modifiedAtMs || 0);
  if (!intentAt || !modifiedAtMs) return false;

  return modifiedAtMs >= intentAt - DOWNLOAD_ACTIVITY_GRACE_MS && now - modifiedAtMs <= DIRECT_DOWNLOAD_ACTIVITY_WINDOW_MS;
}

export function folderHasActiveDownload(folder, downloadIntentAt, now = Date.now()) {
  const intentAt = parseTimestamp(downloadIntentAt);
  if (!folder?.files?.length || !intentAt) return false;

  return folder.files.some((file) => file.isDownloading || isDirectDownloadActivity(file, intentAt, now));
}

export function folderHasTempDownloadFile(folder) {
  return Boolean(folder?.files?.some((file) => file.isDownloading));
}

function markFolderDownloadActivity(folder, anime, now = Date.now()) {
  const intentAt = parseTimestamp(anime?.downloadIntentAt);
  if (!folder?.files?.length || !intentAt) return;
  if (folderHasTempDownloadFile(folder)) return;
  if (anime?.downloadTrackingMode === "temp") return;

  const directCandidates = folder.files.filter((file) => isDirectDownloadActivity(file, intentAt, now));
  if (directCandidates.length === 0) return;

  const latestModifiedAt = Math.max(...directCandidates.map((file) => Number(file.modifiedAtMs || 0)));
  folder.files = folder.files.map((file) => ({
    ...file,
    isDownloading: file.isDownloading || Number(file.modifiedAtMs || 0) === latestModifiedAt,
  }));
}

function toUniqueSearchKeys(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => normalizeForSearch(value))
        .filter(Boolean),
    ),
  );
}

function extractSeasonNumber(text) {
  if (!text) return null;

  const normalized = String(text).toLowerCase();
  const patterns = [
    /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i,
    /\bseason\s+(\d{1,2})\b/i,
    /\bs(\d{1,2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value)) return value;
    }
  }

  return null;
}

function isSeasonCompatible(folder, anime) {
  const animeSeason = extractSeasonNumber(anime?.title) ?? extractSeasonNumber(anime?.title_english);
  if (!animeSeason) {
    return true;
  }

  const folderSeasons = [
    extractSeasonNumber(folder?.folderName),
    extractSeasonNumber(folder?.files?.[0]?.name),
  ].filter(Number.isFinite);

  if (folderSeasons.length === 0) {
    return false;
  }

  return folderSeasons.includes(animeSeason);
}

function buildFolderSearchKeys(folder) {
  return toUniqueSearchKeys([
    folder?.folderName,
    extractBaseTitle(folder?.folderName),
    folder?.files?.[0]?.name ? extractBaseTitle(folder.files[0].name) : "",
  ]);
}

function buildAnimeSearchKeys(anime) {
  return toUniqueSearchKeys([
    anime?.title,
    anime?.title_english,
    anime?.torrentAlias ? extractBaseTitle(anime.torrentAlias) : "",
  ]);
}

export function findBestAnimeFolderMatch(anime, localFiles, options = {}) {
  const folders = Object.entries(localFiles || {}).filter(([, folder]) => {
    if (folder?.isLinked) return false;
    if (folder?.isTracking) return false;
    if (options.onlyWithFiles && (!folder?.files || folder.files.length === 0)) return false;
    if (!isSeasonCompatible(folder, anime)) return false;
    return true;
  });

  const animeKeys = buildAnimeSearchKeys(anime);
  if (animeKeys.length === 0) return null;

  return (
    folders.find(([, folder]) => {
      const folderKeys = buildFolderSearchKeys(folder);
      return folderKeys.some((folderKey) => animeKeys.some((animeKey) => keysMatch(folderKey, animeKey)));
    }) || null
  );
}

function tokenizeSearchKey(value) {
  return String(value || "")
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function keysMatch(folderKey, animeKey) {
  if (!folderKey || !animeKey) return false;
  if (folderKey === animeKey) return true;

  const shorterLength = Math.min(folderKey.length, animeKey.length);
  if (shorterLength >= 10 && (folderKey.includes(animeKey) || animeKey.includes(folderKey))) {
    return true;
  }

  const folderTokens = tokenizeSearchKey(folderKey);
  const animeTokens = tokenizeSearchKey(animeKey);
  if (folderTokens.length === 0 || animeTokens.length === 0) return false;

  const sharedTokens = animeTokens.filter((token) => folderTokens.includes(token)).length;
  const overlapRatio = sharedTokens / Math.max(folderTokens.length, animeTokens.length);

  return sharedTokens >= 2 && overlapRatio >= 0.75;
}

export function extractBaseTitle(fileName) {
  if (!fileName) return "";
  let name = fileName.replace(/\.[^/.]+$/, "");

  name = name.replace(/\[.*?\]/g, "");
  name = name.replace(/\(.*?\)/g, "");
  name = name.replace(/\{.*?\}/g, "");

  const junk = [
    /1080p/gi,
    /720p/gi,
    /480p/gi,
    /bdrip/gi,
    /h264/gi,
    /x264/gi,
    /h265/gi,
    /x265/gi,
    /hevc/gi,
    /10bit/gi,
    /multi-subs/gi,
    /aac/gi,
    /dual-audio/gi,
    /bluray/gi,
    /web-dl/gi,
    /hd/gi,
    /remux/gi,
  ];
  junk.forEach((pattern) => {
    name = name.replace(pattern, "");
  });

  name = name.replace(/S[0-9]{1,2}/gi, "");
  name = name.replace(/Season [0-9]{1,2}/gi, "");
  name = name.replace(/v[0-9]{1}/gi, "");

  const episodePattern = /[ \-_.]+(?:\d{1,4}|\b(?:ep|e)\d{1,4})\b/gi;
  const endingPattern = /\b(end|final|ova|special|movie|film)\b/i;

  const matches = [...name.matchAll(episodePattern)];
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    name = name.substring(0, lastMatch.index);
  } else {
    const match = name.match(endingPattern);
    if (match) name = name.substring(0, match.index);
  }

  name = name.replace(/^[ \-_.]+|[ \-_.]+$/g, "");
  name = name.replace(/\s+/g, " ");

  return name.trim() || fileName;
}

export async function deleteFolderFromDisk(folderPath, basePath) {
  if (!folderPath) return false;

  if (!isPathWithinBase(folderPath, basePath)) {
    console.error(`[FS] Intento de borrado fuera del basePath: ${folderPath}`);
    return {
      ok: false,
      code: "OUTSIDE_LIBRARY",
      error: "La carpeta seleccionada esta fuera de la biblioteca autorizada.",
    };
  }

  try {
    await invoke("secure_delete_path", { path: folderPath, recursive: true });
    return { ok: true };
  } catch (error) {
    console.error("[FS] Error al borrar carpeta:", error);
    const message = String(error);
    const isLocked = isFileInUseMessage(message);

    return {
      ok: false,
      code: isLocked ? "FILE_IN_USE" : "DELETE_FAILED",
      error: isLocked
        ? "No se pudo borrar porque uno o mas archivos estan siendo usados por otra aplicacion."
        : "No se pudo borrar la carpeta seleccionada.",
      details: message,
    };
  }
}

export async function deleteVirtualFolderFiles(files, basePath) {
  if (!files?.length || !basePath) return { deleted: 0, failed: 0, errors: [] };
  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (const file of files) {
    const filePath = file.path;
    if (!filePath) {
      failed++;
      errors.push({
        code: "INVALID_PATH",
        error: `No se pudo resolver la ruta del archivo "${file?.name || "desconocido"}".`,
      });
      continue;
    }

    if (!isPathWithinBase(filePath, basePath)) {
      console.error(`[FS] Intento de borrado fuera del basePath: ${filePath}`);
      failed++;
      errors.push({
        code: "OUTSIDE_LIBRARY",
        error: `El archivo "${file.name}" esta fuera de la biblioteca autorizada.`,
      });
      continue;
    }

    try {
      await invoke("secure_delete_path", { path: filePath, recursive: false });
      deleted++;
    } catch (error) {
      console.error(`[FS] Error al borrar archivo: ${filePath}`, error);
      failed++;
      const message = String(error);
      const isLocked = isFileInUseMessage(message);

      errors.push({
        code: isLocked ? "FILE_IN_USE" : "DELETE_FAILED",
        error: isLocked
          ? `No se pudo borrar "${file.name}" porque esta siendo usado por otra aplicación.`
          : `No se pudo borrar "${file.name}".`,
        details: message,
      });
    }
  }

  return { deleted, failed, errors };
}

export async function selectFolder() {
  return await open({ directory: true, multiple: false, title: "Seleccionar carpeta de anime" });
}

export async function openFile(filePath) {
  if (!filePath) return false;
  try {
    await invoke("secure_open_path", { path: filePath });
    return true;
  } catch (error) {
    console.error("[Opener] Falló openPath:", error);
    return false;
  }
}

function getVideosInFolder(directory) {
  const dlExtensions = [".!qb", ".part", ".bc!"];
  const constantNumbers = detectConstantNumbers(directory.files.map((entry) => entry.name));

  return directory.files.map((entry) => {
    const nameL = entry.name.toLowerCase();
    const isDownloading = dlExtensions.some((ext) => nameL.endsWith(ext));
    return {
      name: entry.name,
      path: entry.path.replace(/\\/g, "/"),
      episodeNumber: extractEpisodeNumber(entry.name, constantNumbers.map(String)),
      isDownloading,
      modifiedAtMs: entry.modifiedAtMs || null,
    };
  });
}

export async function scanLibrary(basePath, myAnimes, settings = {}) {
  if (!basePath) return {};

  const virtualLibrary = {};
  const animeList = Object.values(myAnimes || {});
  const ignoredSuggestions = new Set((settings?.library?.ignoredSuggestions || []).map((name) => name.toLowerCase()));

  try {
    const scanResult = await invoke("scan_library_entries");

    scanResult.directories.forEach((directory) => {
      virtualLibrary[directory.name] = {
        files: getVideosInFolder(directory),
        folderName: directory.name,
        physicalPath: directory.path.replace(/\\/g, "/"),
        isRootFile: false,
        isLinked: false,
        isSuggested: false,
        malId: null,
        animeData: null,
        suggestedMalId: null,
        suggestedAnimeData: null,
        resolvedMalId: null,
        resolvedAnimeData: null,
      };
    });

    // Archivos en raíz
    const videoExts = [".mkv", ".mp4", ".avi", ".webm", ".mov"];
    const dlExts = [".!qb", ".part", ".bc!"];
    scanResult.rootFiles.forEach((entry) => {
      const fullPath = entry.path.replace(/\\/g, "/");
      const nameL = entry.name.toLowerCase();
      const isVideo = videoExts.some((ext) => nameL.endsWith(ext));
      const isDl = dlExts.some((ext) => nameL.endsWith(ext));

      if (isVideo || isDl) {
        const baseTitle = extractBaseTitle(entry.name);
        if (!virtualLibrary[baseTitle]) {
          virtualLibrary[baseTitle] = {
            files: [],
            folderName: baseTitle,
            isRootFile: true,
            isLinked: false,
            isSuggested: false,
            malId: null,
            animeData: null,
            suggestedMalId: null,
            suggestedAnimeData: null,
            resolvedMalId: null,
            resolvedAnimeData: null,
          };
        }
        virtualLibrary[baseTitle].files.push({
          name: entry.name,
          path: fullPath,
          episodeNumber: extractEpisodeNumber(entry.name, []),
          isDownloading: isDl,
          modifiedAtMs: entry.modifiedAtMs || null,
        });
      }
    });

    // Regla única: una carpeta está vinculada SOLO si hay un anime
    // con folderName === nombreCarpeta (coincidencia exacta, sin auto-matching)
    Object.keys(virtualLibrary).forEach((key) => {
      const folder = virtualLibrary[key];
      const matchedAnime = animeList.find((a) => a.folderName === key);

      if (matchedAnime) {
        folder.isLinked = true;
        folder.malId = matchedAnime.malId;
        folder.animeData = matchedAnime;
        folder.resolvedMalId = matchedAnime.malId;
        folder.resolvedAnimeData = matchedAnime;
        markFolderDownloadActivity(folder, matchedAnime);
      }
    });

    // Auto-Linker heurístico: solo sugiere coincidencias en memoria.
    const unlinkedAnimes = animeList
      .filter((a) => !a.folderName)
      .sort((first, second) => {
        const firstIntent = first?.downloadIntentAt ? new Date(first.downloadIntentAt).getTime() : 0;
        const secondIntent = second?.downloadIntentAt ? new Date(second.downloadIntentAt).getTime() : 0;
        return secondIntent - firstIntent;
      });
    Object.values(virtualLibrary).forEach((folder) => {
      if (!folder.isLinked && folder.folderName && !ignoredSuggestions.has(folder.folderName.toLowerCase())) {
        const match = unlinkedAnimes.find((anime) => {
          const bestMatch = findBestAnimeFolderMatch(anime, { [folder.folderName]: folder }, { onlyWithFiles: true });
          return bestMatch && bestMatch[0] === folder.folderName;
        });

        if (match) {
          folder.isSuggested = true;
          folder.suggestedMalId = match.malId;
          folder.suggestedAnimeData = match;
          folder.resolvedMalId = match.malId;
          folder.resolvedAnimeData = match;
        }
      }
    });

    // Animes en la biblioteca sin carpeta física
    animeList.forEach((anime) => {
      // Si tiene folderName, verificar si la carpeta existe físicamente
      if (anime.folderName) {
        const alreadyInList = Object.keys(virtualLibrary).includes(anime.folderName);
        if (!alreadyInList) {
          // La carpeta vinculada ya no existe en disco
          virtualLibrary[anime.folderName] = {
            files: [],
            isLinked: true,
            isSuggested: false,
            malId: anime.malId,
            animeData: anime,
            suggestedMalId: null,
            suggestedAnimeData: null,
            resolvedMalId: anime.malId,
            resolvedAnimeData: anime,
            folderName: anime.folderName,
            isMissing: true,
          };
        }
        return;
      }

      // Sin folderName: anime en seguimiento puro, solo si no esta completado
      const alreadyInList = Object.values(virtualLibrary).some(
        (f) =>
          String(f.malId) === String(anime.malId) ||
          String(f.resolvedMalId) === String(anime.malId) ||
          String(f.suggestedMalId) === String(anime.malId),
      );
      if (!alreadyInList && !isCompletedAnime(anime)) {
        virtualLibrary[`__tracking__${anime.malId}`] = {
          files: [],
          isLinked: false,
          isSuggested: false,
          isTracking: true, // sin carpeta, solo seguimiento
          malId: anime.malId,
          animeData: anime,
          suggestedMalId: null,
          suggestedAnimeData: null,
          resolvedMalId: anime.malId,
          resolvedAnimeData: anime,
          folderName: null,
        };
      }
    });
  } catch (error) {
    console.error("[FS] Fallo en el escáner virtual:", error);
  }

  return virtualLibrary;
}
