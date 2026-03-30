import { open } from "@tauri-apps/plugin-dialog";
import { readDir, remove } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { Command } from "@tauri-apps/plugin-shell";
import { extractEpisodeNumber, detectConstantNumbers } from "../utils/fileParsing";

const PLAYER_PROCESS_NAMES = {
  mpv: "mpv",
  vlc: "vlc",
  "mpc-hc": "mpc-hc64",
  "mpc-be": "mpc-be64",
  potplayer: "PotPlayerMini64",
};

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

  const episodePattern = /[ \-_.]+(?:\d{1,4}|\b(?:ep|e)\d{1,4})\b/ig;
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
    return false;
  }

  try {
    await remove(folderPath, { recursive: true });
    return true;
  } catch (error) {
    console.error("[FS] Error al borrar carpeta:", error);
    return false;
  }
}

export async function deleteVirtualFolderFiles(files, basePath) {
  if (!files?.length || !basePath) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = file.path;
    if (!filePath) {
      failed++;
      continue;
    }

    if (!isPathWithinBase(filePath, basePath)) {
      console.error(`[FS] Intento de borrado fuera del basePath: ${filePath}`);
      failed++;
      continue;
    }

    try {
      await remove(filePath);
      deleted++;
    } catch (error) {
      console.error(`[FS] Error al borrar archivo: ${filePath}`, error);
      failed++;
    }
  }

  return { deleted, failed };
}

export async function selectFolder() {
  return await open({ directory: true, multiple: false, title: "Seleccionar carpeta de anime" });
}

export async function openFile(filePath) {
  if (!filePath) return false;
  try {
    const winPath = filePath.replace(/\//g, "\\");
    await openPath(winPath);
    return true;
  } catch (error) {
    console.error("[Opener] Falló openPath:", error);
    return false;
  }
}

async function getVideosInFolder(folderPath) {
  try {
    const entries = await readDir(folderPath);
    const videoExtensions = [".mkv", ".mp4", ".avi", ".webm", ".mov"];
    const dlExtensions = [".!qb", ".part", ".bc!"];

    const fileEntries = entries.filter((e) => !e.isDirectory);
    
    const videoFiles = fileEntries.filter((e) => {
      const nameL = e.name.toLowerCase();
      return videoExtensions.some((ext) => nameL.endsWith(ext)) || dlExtensions.some((ext) => nameL.endsWith(ext));
    });

    const constantNumbers = detectConstantNumbers(videoFiles.map((e) => e.name));

    return videoFiles.map((e) => {
      const nameL = e.name.toLowerCase();
      const isDownloading = dlExtensions.some((ext) => nameL.endsWith(ext));
      return {
        name: e.name,
        path: `${folderPath}/${e.name}`.replace(/\/+/g, "/"),
        episodeNumber: extractEpisodeNumber(e.name, constantNumbers.map(String)),
        isDownloading,
      };
    });
  } catch (error) {
    console.error(`[FS] Error leyendo carpeta ${folderPath}:`, error);
    return [];
  }
}

export async function scanLibrary(basePath, myAnimes, settings = {}) {
  if (!basePath) return {};

  const virtualLibrary = {};
  const animeList = Object.values(myAnimes || {});
  const ignoredSuggestions = new Set((settings?.library?.ignoredSuggestions || []).map((name) => name.toLowerCase()));

  try {
    const rootEntries = await readDir(basePath);
    const dirEntries = rootEntries.filter((e) => e.isDirectory);
    const fileEntries = rootEntries.filter((e) => e.isFile);

    // Leer todas las subcarpetas en paralelo
    const subFilesResults = await Promise.all(
      dirEntries.map(async (entry) => {
        const fullPath = `${basePath}/${entry.name}`.replace(/\/+/g, "/");
        const files = await getVideosInFolder(fullPath);
        return { entry, fullPath, files };
      }),
    );

    subFilesResults.forEach(({ entry, fullPath, files }) => {
      virtualLibrary[entry.name] = {
        files,
        folderName: entry.name,
        physicalPath: fullPath,
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
    fileEntries.forEach((entry) => {
      const fullPath = `${basePath}/${entry.name}`.replace(/\/+/g, "/");
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
      }
    });

    // Auto-Linker heurístico: solo sugiere coincidencias en memoria.
    const unlinkedAnimes = animeList.filter((a) => !a.folderName);
    Object.values(virtualLibrary).forEach((folder) => {
      if (!folder.isLinked && folder.folderName && !ignoredSuggestions.has(folder.folderName.toLowerCase())) {
        const cleanKey = normalizeForSearch(folder.folderName);
        const match = unlinkedAnimes.find((a) => {
          const tr = normalizeForSearch(a.title);
          const te = normalizeForSearch(a.title_english) || "";
          // Coincidencia amplia bidireccional
          const isMatch = cleanKey === tr || cleanKey === te || 
                          (cleanKey.length > 3 && tr.includes(cleanKey)) || 
                          (tr.length > 3 && cleanKey.includes(tr)) ||
                          (te && cleanKey.length > 3 && te.includes(cleanKey)) ||
                          (te && te.length > 3 && cleanKey.includes(te));
          return isMatch;
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

      // Sin folderName: anime en seguimiento puro, aparece en Library sin carpeta
      const alreadyInList = Object.values(virtualLibrary).some((f) => f.malId === anime.malId);
      if (!alreadyInList) {
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

