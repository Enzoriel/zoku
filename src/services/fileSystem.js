import { open, confirm } from "@tauri-apps/plugin-dialog";
import { readDir, remove } from "@tauri-apps/plugin-fs"; 
import { openPath } from "@tauri-apps/plugin-opener";
import { Command } from "@tauri-apps/plugin-shell";

const PLAYER_PROCESS_NAMES = {
  mpv: 'mpv',
  vlc: 'vlc',
  'mpc-hc': 'mpc-hc64',
  'mpc-be': 'mpc-be64',
  potplayer: 'PotPlayerMini64',
};

// Verifica si el proceso del reproductor sigue activo en Windows
export async function isPlayerStillOpen(playerName) {
  const processName = PLAYER_PROCESS_NAMES[playerName] || playerName;
  try {
    const output = await Command.create('powershell', [
      '-Command',
      `Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | Select-Object -First 1`
    ]).execute();
    return output.stdout.trim().length > 0;
  } catch (err) {
    console.error(`[FS] Error verificando proceso ${processName}:`, err);
    return false;
  }
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

  // Limpieza agresiva de metadatos para quedarnos solo con el título nominal de la serie
  name = name.replace(/\[.*?\]/g, "");
  name = name.replace(/\(.*?\)/g, "");
  name = name.replace(/\{.*?\}/g, "");
  
  const junk = [/1080p/gi, /720p/gi, /480p/gi, /bdrip/gi, /h264/gi, /x264/gi, /h265/gi, /x265/gi, /hevc/gi, /10bit/gi, /multi-subs/gi, /aac/gi, /dual-audio/gi, /bluray/gi, /web-dl/gi, /hd/gi, /remux/gi];
  junk.forEach(pattern => { name = name.replace(pattern, ""); });

  name = name.replace(/S[0-9]{1,2}/gi, "");
  name = name.replace(/Season [0-9]{1,2}/gi, "");
  name = name.replace(/v[0-9]{1}/gi, "");

  const episodePattern = /[ \-_.]+(?:\d{1,4}|\b(?:ep|e)\d{1,4})\b/i; 
  const endingPattern = /\b(end|final|ova|special|movie|film)\b/i; 

  let match = name.match(episodePattern);
  if (match) {
    name = name.substring(0, match.index);
  } else {
    match = name.match(endingPattern);
    if (match) {
      name = name.substring(0, match.index);
    }
  }
  
  name = name.replace(/^[ \-_.]+|[ \-_.]+$/g, ""); 
  name = name.replace(/\s+/g, " ");
  
  return name.trim() || fileName; 
}


// Borrar carpeta del disco
export async function deleteFolderFromDisk(folderPath) {
  if (!folderPath) return false;
  
  try {
    const isConfirmed = await confirm(
      `¿Estás seguro de que quieres borrar permanentemente esta carpeta y todos sus archivos?\n\n${folderPath}`,
      { title: "Confirmar Borrado Físico", kind: "warning" }
    );

    if (isConfirmed) {
      await remove(folderPath, { recursive: true });
      return true;
    }
    return false;
  } catch (error) {
    console.error("[FS] Error al borrar carpeta:", error);
    return false;
  }
}

// Abrir dialog para seleccionar carpeta
export async function selectFolder() {
  return await open({ directory: true, multiple: false, title: "Seleccionar carpeta de anime" });
}

// Abrir archivo con el reproductor nativo
export async function openFile(filePath) {
  if (!filePath) return false;
  try {
    const winPath = filePath.replace(/\//g, "\\");
    console.log(`[Opener] Intentando abrir: ${winPath}`);
    await openPath(winPath);
    return true;
  } catch (error) {
    console.error("[Opener] Falló openPath:", error);
    return false;
  }
}

// Leer videos de una carpeta
async function getVideosInFolder(folderPath) {
  try {
    const entries = await readDir(folderPath);
    const videoExtensions = [".mkv", ".mp4", ".avi", ".webm", ".mov"];
    return entries
      .filter(e => !e.isDirectory && videoExtensions.some(ext => e.name.toLowerCase().endsWith(ext)))
      .map(e => ({
        name: e.name,
        path: `${folderPath}/${e.name}`.replace(/\/+/g, "/")
      }));
  } catch (error) {
    console.error(`[FS] Error leyendo carpeta ${folderPath}:`, error);
    return [];
  }
}

// Escáner Maestro VIRTUAL mejorado
export async function scanLibrary(basePath, myAnimes) {
  if (!basePath) return {};

  const virtualLibrary = {};
  const animeList = Object.values(myAnimes || {});
  
  try {
    const rootEntries = await readDir(basePath);

    // 1. Recolectar archivos por carpeta física y archivos en raíz
    for (const entry of rootEntries) {
      const fullPath = `${basePath}/${entry.name}`.replace(/\/+/g, "/");
      
      if (entry.isFile) {
        const videoExts = [".mkv", ".mp4", ".avi", ".webm", ".mov"];
        if (videoExts.some(ext => entry.name.toLowerCase().endsWith(ext))) {
          const baseTitle = extractBaseTitle(entry.name);
          if (!virtualLibrary[baseTitle]) virtualLibrary[baseTitle] = { files: [], folderName: baseTitle, isRootFile: true };
          virtualLibrary[baseTitle].files.push({ name: entry.name, path: fullPath });
        }
      } else if (entry.isDirectory) {
        const subFiles = await getVideosInFolder(fullPath);
        if (subFiles.length >= 0) { 
          virtualLibrary[entry.name] = { 
            files: subFiles, 
            folderName: entry.name, 
            physicalPath: fullPath,
            isRootFile: false 
          };
        }
      }
    }


    // 2. Vincular con MyAnimes (Priorizando folderName explícito)
    Object.keys(virtualLibrary).forEach(key => {
      const folder = virtualLibrary[key];
      const normalizedKey = normalizeForSearch(key);
      
      const matchedAnime = animeList.find(a => {
        const storedFolder = a.folderName ? normalizeForSearch(a.folderName) : null;
        const normalizedTitle = normalizeForSearch(a.title);

        return (
          (storedFolder && (storedFolder === normalizedKey || normalizedKey.includes(storedFolder))) || 
          normalizedTitle === normalizedKey ||
          normalizedKey.includes(normalizedTitle)
        );
      });

      if (matchedAnime) {
        folder.isLinked = true;
        folder.malId = matchedAnime.malId;
        folder.animeData = matchedAnime;
        // Importante: Actualizar el folderName en el store si ha cambiado ligeramente 
        // pero se ha detectado como el mismo para mantener consistencia
        if (matchedAnime.folderName !== key) {
           matchedAnime.tempDetectedFolder = key; 
        }
      } else {
        folder.isLinked = false;
        folder.malId = null;
        folder.animeData = null;
      }
    });


    // 3. Incluir animes de la biblioteca que no tienen archivos
    animeList.forEach(anime => {
      const alreadyInListByMalId = Object.values(virtualLibrary).some(f => f.malId === anime.malId);
      if (!alreadyInListByMalId) {
        const key = anime.title;
        virtualLibrary[key] = {
          files: [],
          isLinked: true,
          malId: anime.malId,
          animeData: anime,
          folderName: anime.title,
          isMissing: true
        };
      }
    });

  } catch (error) {
    console.error("[FS] Fallo en el escáner virtual:", error);
  }

  return virtualLibrary;
}

export async function syncLibraryFolders() {
  return; 
}
