import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { extractEpisodeNumber, detectConstantNumbers } from "../utils/fileParsing";
import { extractBaseTitle, normalizeForSearch as normalizeTitleForSearch } from "../utils/titleIdentity";

const DOWNLOAD_ACTIVITY_GRACE_MS = 10 * 1000;
const DIRECT_DOWNLOAD_ACTIVITY_WINDOW_MS = 25 * 1000;

export function normalizeComparablePath(path) {
  if (!path) return "";
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isPathWithinBase(targetPath, basePath) {
  const normalizedTarget = normalizeComparablePath(targetPath);
  const normalizedBase = normalizeComparablePath(basePath);

  if (!normalizedTarget || !normalizedBase) return false;
  return normalizedTarget.startsWith(`${normalizedBase}/`);
}

function normalizeForSearch(text) {
  return normalizeTitleForSearch(text);
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

  return (
    modifiedAtMs >= intentAt - DOWNLOAD_ACTIVITY_GRACE_MS && now - modifiedAtMs <= DIRECT_DOWNLOAD_ACTIVITY_WINDOW_MS
  );
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
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeForSearch(value))
        .filter((val) => val && val.length >= 2),
    ),
  );
}

function extractSeasonNumber(text) {
  if (!text) return null;

  const normalized = String(text).toLowerCase();
  const patterns = [/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i, /\bseason\s+(\d{1,2})\b/i, /\bs(\d{1,2})\b/i];

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

  const folderSeasons = [extractSeasonNumber(folder?.folderName), extractSeasonNumber(folder?.files?.[0]?.name)].filter(
    Number.isFinite,
  );

  if (folderSeasons.length === 0) {
    return true;
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
    anime?.torrentSearchTerm,
    anime?.torrentSearchTerm ? extractBaseTitle(anime.torrentSearchTerm) : "",
    anime?.diskAlias,
    anime?.diskAlias ? extractBaseTitle(anime.diskAlias) : "",
    anime?.title,
    anime?.title_english,
    ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
    anime?.torrentTitle ? extractBaseTitle(anime.torrentTitle) : "",
    anime?.torrentAlias ? extractBaseTitle(anime.torrentAlias) : "",
  ]);
}

function getKeyMatchScore(folderKey, animeKey, lenient = false) {
  if (!folderKey || !animeKey) return 0;
  if (folderKey === animeKey) return 1;

  const shorterLength = Math.min(folderKey.length, animeKey.length);
  if (shorterLength >= 7 && (folderKey.includes(animeKey) || animeKey.includes(folderKey))) {
    return 0.96;
  }

  const folderTokens = tokenizeSearchKey(folderKey);
  const animeTokens = tokenizeSearchKey(animeKey);
  if (folderTokens.length === 0 || animeTokens.length === 0) return 0;

  const sharedTokens = animeTokens.filter((token) => folderTokens.includes(token)).length;
  const overlapRatio = sharedTokens / Math.max(folderTokens.length, animeTokens.length);

  const threshold = lenient ? 0.45 : 0.75;
  const minTokens = shorterLength >= 5 ? 1 : 2;
  return sharedTokens >= minTokens && overlapRatio >= threshold ? overlapRatio : 0;
}

export function findAnimeFolderCandidates(anime, localFiles, options = {}) {
  const folders = Object.entries(localFiles || {}).filter(([, folder]) => {
    if (folder?.isLinked) return false;
    if (folder?.isTracking) return false;
    if (options.onlyWithFiles && (!folder?.files || folder.files.length === 0)) return false;
    if (!isSeasonCompatible(folder, anime)) return false;
    return true;
  });

  const animeKeys = buildAnimeSearchKeys(anime);
  if (animeKeys.length === 0) return [];

  const intentAt = anime?.downloadIntentAt ? new Date(anime.downloadIntentAt).getTime() : 0;
  const isRecentToIntent = (folder) => {
    if (intentAt === 0) return false;
    return (folder?.files || []).some((file) => {
      const modifiedAtMs = Number(file.modifiedAtMs || 0);
      return modifiedAtMs > 0 && modifiedAtMs >= intentAt - 30000;
    });
  };

  return folders
    .map(([folderName, folder]) => {
      const folderKeys = buildFolderSearchKeys(folder);
      const isLenient = isRecentToIntent(folder);

      let score = Math.max(
        ...folderKeys.map((folderKey) =>
          Math.max(...animeKeys.map((animeKey) => getKeyMatchScore(folderKey, animeKey, isLenient))),
        ),
      );

      if (score > 0 && isLenient) {
        score = Math.min(1.0, score + 0.4);
      }

      return score > 0 ? [folderName, folder, score] : null;
    })
    .filter(Boolean)
    .sort((first, second) => {
      if (second[2] !== first[2]) return second[2] - first[2];
      return (second[1]?.files?.length || 0) - (first[1]?.files?.length || 0);
    });
}

function tokenizeSearchKey(value) {
  return String(value || "")
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
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
          ? `No se pudo borrar "${file.name}" porque esta siendo usado por otra aplicacion.`
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

export async function selectPlayerExecutable() {
  const result = await open({
    directory: false,
    multiple: false,
    title: "Seleccionar reproductor de video (.exe)",
    filters: [{ name: "Ejecutable de Windows", extensions: ["exe"] }],
  });

  return Array.isArray(result) ? result[0] || null : result;
}

export async function launchConfiguredPlayer(executablePath, mediaPath) {
  if (!executablePath || !mediaPath) return { ok: false, error: "Configuracion de reproductor invalida." };

  try {
    await invoke("launch_configured_player", {
      executablePath,
      mediaPath,
    });
    return { ok: true };
  } catch (error) {
    console.error("[Playback] Fallo launchConfiguredPlayer:", error);
    return {
      ok: false,
      error: String(error || "No se pudo abrir el episodio con el reproductor configurado."),
    };
  }
}

function normalizeDetectedPlayer(result) {
  if (!result?.executablePath) return null;

  return {
    key: result.key || "other",
    executablePath: result.executablePath,
    processName: result.processName || "",
    displayName: result.displayName || "",
  };
}

export async function detectDefaultVideoPlayer() {
  try {
    const result = await invoke("detect_default_video_player");
    return normalizeDetectedPlayer(result);
  } catch (error) {
    console.error("[PlayerConfig] Error detectando reproductor predeterminado:", error);
    return null;
  }
}

export async function detectKnownPlayer(playerKey) {
  if (!playerKey) return null;

  try {
    const result = await invoke("detect_known_player", { playerKey });
    return normalizeDetectedPlayer(result);
  } catch (error) {
    console.error("[PlayerConfig] Error detectando reproductor conocido:", error);
    return null;
  }
}

export async function checkPlayerStatus(candidatePaths, preferredProcessNames) {
  if (!preferredProcessNames?.length) return { isRunning: false, activeFile: null };

  try {
    const result = await invoke("check_player_status", {
      candidatePaths: candidatePaths || [],
      preferredProcessNames,
    });

    return {
      isRunning: Boolean(result?.isRunning),
      activeFile: result?.activeFile
        ? {
            path: normalizeComparablePath(result.activeFile.path),
            processName: result.activeFile.processName || "",
          }
        : null,
    };
  } catch (error) {
    console.error("[Playback] Error en checkPlayerStatus:", error);
    return { isRunning: false, activeFile: null };
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

export async function scanLibrary(basePath, myAnimes) {
  if (!basePath) return {};

  const virtualLibrary = {};
  const animeList = Object.values(myAnimes || {});

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

    const unlinkedAnimes = animeList
      .filter((a) => !a.folderName)
      .sort((first, second) => {
        const firstIntent = first?.downloadIntentAt ? new Date(first.downloadIntentAt).getTime() : 0;
        const secondIntent = second?.downloadIntentAt ? new Date(second.downloadIntentAt).getTime() : 0;
        return secondIntent - firstIntent;
      });
    const uniqueSuggestions = new Map();

    unlinkedAnimes.forEach((anime) => {
      const candidates = findAnimeFolderCandidates(anime, virtualLibrary, { onlyWithFiles: true }).filter(
        ([folderName]) =>
          String(anime?.rejectedSuggestion?.folderName || "").toLowerCase() !== folderName.toLowerCase(),
      );

      if (candidates.length === 1) {
        uniqueSuggestions.set(String(anime.malId), candidates[0][0]);
      }
    });

    Object.values(virtualLibrary).forEach((folder) => {
      if (folder.isLinked || !folder.folderName) return;

      const match = unlinkedAnimes.find((anime) => uniqueSuggestions.get(String(anime.malId)) === folder.folderName);
      if (!match) return;

      folder.isSuggested = true;
      folder.suggestedMalId = match.malId;
      folder.suggestedAnimeData = match;
      folder.resolvedMalId = match.malId;
      folder.resolvedAnimeData = match;
    });

    animeList.forEach((anime) => {
      if (anime.folderName) {
        const exists = Object.keys(virtualLibrary).includes(anime.folderName);
        if (!exists) {
          virtualLibrary[anime.folderName] = {
            files: [],
            isLinked: true,
            isSuggested: false,
            malId: anime.malId,
            animeData: anime,
            resolvedMalId: anime.malId,
            resolvedAnimeData: anime,
            folderName: anime.folderName,
            isMissing: true,
          };
        }
        return;
      }

      const inVirtual = Object.values(virtualLibrary).some((f) => String(f.resolvedMalId) === String(anime.malId));
      if (!inVirtual && !isCompletedAnime(anime)) {
        virtualLibrary[`__tracking__${anime.malId}`] = {
          files: [],
          isLinked: false,
          isSuggested: false,
          isTracking: true,
          malId: anime.malId,
          animeData: anime,
          resolvedMalId: anime.malId,
          resolvedAnimeData: anime,
          folderName: null,
        };
      }
    });
  } catch (error) {
    console.error("[FS] Fallo en el escaner virtual:", error);
    return { __scanError: true, __errorMessage: error.message || "Error desconocido" };
  }

  return virtualLibrary;
}
