import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs"; 
import { openPath } from "@tauri-apps/plugin-opener";

// Normalizar texto para comparación robusta
export function normalizeForSearch(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[ \-_.]+/g, " ") 
    .replace(/[^a-z0-9 ]/g, "") 
    .trim();
}

// Extracción de Título Base
export function extractBaseTitle(fileName) {
  if (!fileName) return "";
  let name = fileName.replace(/\.[^/.]+$/, ""); 

  // 1. Quitar tags de fansubs
  name = name.replace(/\[.*?\]/g, "");
  name = name.replace(/\(.*?\)/g, "");
  name = name.replace(/\{.*?\}/g, "");
  
  // 2. Quitar resoluciones y formatos
  const junk = [/1080p/gi, /720p/gi, /480p/gi, /bdrip/gi, /h264/gi, /x264/gi, /h265/gi, /x265/gi, /hevc/gi, /10bit/gi, /multi-subs/gi, /aac/gi, /dual-audio/gi, /bluray/gi, /web-dl/gi, /hd/gi, /remux/gi];
  junk.forEach(pattern => { name = name.replace(pattern, ""); });

  // 3. Quitar temporada
  name = name.replace(/S[0-9]{1,2}/gi, "");
  name = name.replace(/Season [0-9]{1,2}/gi, "");
  name = name.replace(/v[0-9]{1}/gi, "");

  // 4. Cortar en episodio
  const episodePattern = /[ \-_.]+(?:\d{1,4}|\b(?:ep|e)\d{1,4})\b/i; 
  const endingPattern = /\b(end|final|ova|special)\b/i; 

  let match = name.match(episodePattern);
  if (match) {
    name = name.substring(0, match.index);
  } else {
    match = name.match(endingPattern);
    if (match) {
      name = name.substring(0, match.index);
    }
  }
  
  // 5. Limpieza final
  name = name.replace(/^[ \-_.]+|[ \-_.]+$/g, ""); 
  name = name.replace(/\s+/g, " ");
  
  return name.trim() || fileName; 
}

// Abrir dialog para seleccionar carpeta
export async function selectFolder() {
  return await open({ directory: true, multiple: false, title: "Seleccionar carpeta de anime" });
}

// Abrir archivo con el reproductor nativo
export async function openFile(filePath) {
  if (!filePath) return false;
  try {
    // En Windows Tauri maneja bien las rutas si usamos openPath directamente
    // pero asegurémonos de que no haya dobles slashes problemáticos
    const normalizedPath = filePath.replace(/\/+/g, "/");
    console.log(`[Opener] Intentando abrir ruta: ${normalizedPath}`);
    await openPath(normalizedPath);
    return true;
  } catch (error) {
    console.error("[Opener] Error crítico al abrir archivo:", error);
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

// Escáner Maestro VIRTUAL
export async function scanLibrary(basePath, myAnimes) {
  if (!basePath) return {};

  const virtualLibrary = {};
  const animeList = Object.values(myAnimes || {});
  
  try {
    const rootEntries = await readDir(basePath);
    let allFiles = [];

    // 1. Recolectar archivos
    for (const entry of rootEntries) {
      const fullPath = `${basePath}/${entry.name}`.replace(/\/+/g, "/");
      
      if (entry.isFile) {
        const videoExts = [".mkv", ".mp4", ".avi", ".webm", ".mov"];
        if (videoExts.some(ext => entry.name.toLowerCase().endsWith(ext))) {
          allFiles.push({ name: entry.name, path: fullPath });
        }
      } else if (entry.isDirectory) {
        const subFiles = await getVideosInFolder(fullPath);
        allFiles.push(...subFiles);
      }
    }

    // 2. Agrupar VIRTUALMENTE
    for (const file of allFiles) {
      const baseTitle = extractBaseTitle(file.name);
      if (!baseTitle) continue; 

      const normalizedFileTitle = normalizeForSearch(baseTitle);

      const matchedAnime = animeList.find(a => {
        const normalizedListTitle = normalizeForSearch(a.title);
        return normalizedFileTitle.includes(normalizedListTitle) || normalizedListTitle.includes(normalizedFileTitle);
      });

      const key = matchedAnime ? matchedAnime.title : baseTitle; 

      if (!virtualLibrary[key]) {
        virtualLibrary[key] = {
          files: [],
          isLinked: !!matchedAnime,
          malId: matchedAnime?.malId || null,
          animeData: matchedAnime || null,
          folderName: key 
        };
      }
      virtualLibrary[key].files.push(file);
    }

    // 3. Incluir animes sin archivos
    animeList.forEach(anime => {
      if (!virtualLibrary[anime.title]) {
        virtualLibrary[anime.title] = {
          files: [],
          isLinked: true,
          malId: anime.malId,
          animeData: anime,
          folderName: anime.title 
        };
      }
    });

  } catch (error) {
    console.error("[FS] Fallo en el escáner virtual:", error);
  }

  return virtualLibrary;
}

export async function syncLibraryFolders() {
  console.log("[FS] Sincronización virtual.");
  return; 
}
