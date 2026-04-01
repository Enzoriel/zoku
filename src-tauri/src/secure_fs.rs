use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;

use notify::{
    event::{CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode},
    RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_opener::OpenerExt;

const WATCH_DEBOUNCE_MS: u64 = 800;
const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "webm", "mov"];
const TEMP_DOWNLOAD_EXTENSIONS: &[&str] = &["!qb", "part", "bc!"];

pub struct LibraryState {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<LibraryWatcherHandle>>,
}

impl LibraryState {
    pub fn new() -> Self {
        Self {
            root: Mutex::new(None),
            watcher: Mutex::new(None),
        }
    }
}

struct LibraryWatcherHandle {
    _watcher: RecommendedWatcher,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChangedEvent {
    root_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScopeResult {
    root_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScanResult {
    directories: Vec<LibraryDirectoryEntry>,
    root_files: Vec<LibraryFileEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDirectoryEntry {
    name: String,
    path: String,
    files: Vec<LibraryFileEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFileEntry {
    name: String,
    path: String,
    modified_at_ms: Option<u64>,
}

fn canonicalize_directory(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("La ruta de la biblioteca esta vacia.".into());
    }

    let canonical = fs::canonicalize(path)
        .map_err(|_| "No se pudo resolver la carpeta de biblioteca.".to_string())?;
    if !canonical.is_dir() {
        return Err("La ruta de biblioteca no es una carpeta valida.".into());
    }

    Ok(canonical)
}

fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("La ruta objetivo esta vacia.".into());
    }

    fs::canonicalize(path)
        .map_err(|_| "La ruta objetivo no existe o no se pudo resolver.".to_string())
}

fn ensure_within_root(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let canonical_root = canonicalize_directory(root)?;
    let canonical_target = canonicalize_existing_path(target)?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("La ruta objetivo esta fuera de la biblioteca autorizada.".into());
    }

    Ok(canonical_target)
}

fn current_root(state: &State<'_, LibraryState>) -> Result<PathBuf, String> {
    let guard = state
        .root
        .lock()
        .map_err(|_| "No se pudo acceder al estado de seguridad de la biblioteca.".to_string())?;

    guard
        .clone()
        .ok_or_else(|| "No hay una biblioteca autorizada configurada.".to_string())
}

fn is_relevant_extension(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some(value) => {
            VIDEO_EXTENSIONS.contains(&value) || TEMP_DOWNLOAD_EXTENSIONS.contains(&value)
        }
        None => true,
    }
}

fn is_relevant_event_kind(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any
            | EventKind::Create(CreateKind::Any)
            | EventKind::Create(CreateKind::File)
            | EventKind::Create(CreateKind::Folder)
            | EventKind::Remove(RemoveKind::Any)
            | EventKind::Remove(RemoveKind::File)
            | EventKind::Remove(RemoveKind::Folder)
            | EventKind::Modify(ModifyKind::Any)
            | EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Metadata(_))
            | EventKind::Modify(ModifyKind::Name(RenameMode::Any))
            | EventKind::Modify(ModifyKind::Name(RenameMode::Both))
            | EventKind::Modify(ModifyKind::Name(RenameMode::From))
            | EventKind::Modify(ModifyKind::Name(RenameMode::To))
    )
}

fn should_emit_for_event(event: &notify::Event) -> bool {
    if !is_relevant_event_kind(&event.kind) {
        return false;
    }

    if event.paths.is_empty() {
        return true;
    }

    event.paths.iter().any(|path| {
        if path.extension().is_none() {
            return true;
        }

        is_relevant_extension(path)
    })
}

fn stop_library_watcher(state: &LibraryState) -> Result<(), String> {
    let existing = {
        let mut guard = state
            .watcher
            .lock()
            .map_err(|_| "No se pudo acceder al watcher de la biblioteca.".to_string())?;
        guard.take()
    };

    if let Some(handle) = existing {
        handle.task.abort();
        drop(handle);
    }

    Ok(())
}

fn start_library_watcher<R: Runtime>(
    app: &AppHandle<R>,
    state: &LibraryState,
    root: &Path,
) -> Result<(), String> {
    stop_library_watcher(state)?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<()>();
    let root_path = root.to_path_buf();
    let root_path_for_event = root_path.to_string_lossy().to_string();

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result {
            if should_emit_for_event(&event) {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|error| format!("No se pudo iniciar el watcher de biblioteca: {error}"))?;

    watcher
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|error| format!("No se pudo observar la biblioteca seleccionada: {error}"))?;

    let app_handle = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        while rx.recv().await.is_some() {
            let debounce = tokio::time::sleep(Duration::from_millis(WATCH_DEBOUNCE_MS));
            tokio::pin!(debounce);

            loop {
                tokio::select! {
                    _ = &mut debounce => {
                        let _ = app_handle.emit(
                            "library-changed",
                            LibraryChangedEvent {
                                root_path: root_path_for_event.clone(),
                            },
                        );
                        break;
                    }
                    maybe_signal = rx.recv() => {
                        if maybe_signal.is_none() {
                            return;
                        }
                        debounce
                            .as_mut()
                            .reset(tokio::time::Instant::now() + Duration::from_millis(WATCH_DEBOUNCE_MS));
                    }
                }
            }
        }
    });

    let mut guard = state
        .watcher
        .lock()
        .map_err(|_| "No se pudo acceder al watcher de la biblioteca.".to_string())?;
    *guard = Some(LibraryWatcherHandle {
        _watcher: watcher,
        task,
    });

    Ok(())
}

fn read_relevant_files(directory: &Path) -> Result<Vec<LibraryFileEntry>, String> {
    let mut files = Vec::new();

    for entry in fs::read_dir(directory)
        .map_err(|error| format!("No se pudo leer la carpeta de biblioteca: {error}"))?
    {
        let entry = entry.map_err(|error| format!("No se pudo inspeccionar la biblioteca: {error}"))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| format!("No se pudo leer metadatos de biblioteca: {error}"))?;

        if !metadata.is_file() || !is_relevant_extension(&path) {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        files.push(LibraryFileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            modified_at_ms: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64),
        });
    }

    Ok(files)
}

#[cfg(windows)]
fn ensure_file_not_in_use(path: &Path) -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.read(true).share_mode(0);
    options
        .open(path)
        .map(|_| ())
        .map_err(|error| format!("El archivo esta siendo usado por otra aplicacion: {error}"))
}

#[cfg(not(windows))]
fn ensure_file_not_in_use(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn ensure_path_not_in_use(path: &Path) -> Result<(), String> {
    if path.is_file() {
        return ensure_file_not_in_use(path);
    }

    if path.is_dir() {
        for entry in fs::read_dir(path)
            .map_err(|error| format!("No se pudo inspeccionar la carpeta para borrar: {error}"))?
        {
            let entry =
                entry.map_err(|error| format!("No se pudo inspeccionar la carpeta para borrar: {error}"))?;
            ensure_path_not_in_use(&entry.path())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn ensure_library_scope<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    state: State<'_, LibraryState>,
) -> Result<LibraryScopeResult, String> {
    let next_root = if path.trim().is_empty() {
        None
    } else {
        Some(canonicalize_directory(Path::new(&path))?)
    };

    if let Some(root) = next_root.as_deref() {
        start_library_watcher(&app, &state, root)?;
    } else {
        stop_library_watcher(&state)?;
    }

    let mut guard = state
        .root
        .lock()
        .map_err(|_| "No se pudo acceder al estado de seguridad de la biblioteca.".to_string())?;
    *guard = next_root;

    Ok(LibraryScopeResult {
        root_path: guard
            .as_ref()
            .map(|root| root.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub fn scan_library_entries(state: State<'_, LibraryState>) -> Result<LibraryScanResult, String> {
    let root = current_root(&state)?;
    let mut directories = Vec::new();
    let mut root_files = Vec::new();

    for entry in fs::read_dir(&root)
        .map_err(|error| format!("No se pudo leer la carpeta de biblioteca: {error}"))?
    {
        let entry = entry.map_err(|error| format!("No se pudo inspeccionar la biblioteca: {error}"))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| format!("No se pudo leer metadatos de biblioteca: {error}"))?;
        let name = entry.file_name().to_string_lossy().to_string();

        if metadata.is_dir() {
            directories.push(LibraryDirectoryEntry {
                name,
                path: path.to_string_lossy().to_string(),
                files: read_relevant_files(&path)?,
            });
            continue;
        }

        if metadata.is_file() && is_relevant_extension(&path) {
            root_files.push(LibraryFileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                modified_at_ms: metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis() as u64),
            });
        }
    }

    Ok(LibraryScanResult {
        directories,
        root_files,
    })
}

#[tauri::command]
pub async fn secure_open_path<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    state: State<'_, LibraryState>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let target = ensure_within_root(&root, Path::new(&path))?;

    if !target.is_file() {
        return Err("Solo se pueden abrir archivos dentro de la biblioteca.".into());
    }

    app.opener()
        .open_path(target.to_string_lossy().to_string(), None::<String>)
        .map_err(|error| format!("No se pudo abrir el archivo: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn secure_delete_path(
    path: String,
    recursive: bool,
    state: State<'_, LibraryState>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let target = ensure_within_root(&root, Path::new(&path))?;

    tokio::task::spawn_blocking(move || {
        ensure_path_not_in_use(&target)?;

        if target.is_file() {
            fs::remove_file(&target)
                .map_err(|error| format!("No se pudo borrar el archivo: {error}"))?;
            return Ok(());
        }

        if target.is_dir() {
            if !recursive {
                return Err("Se requiere borrado recursivo para eliminar carpetas.".into());
            }

            fs::remove_dir_all(&target)
                .map_err(|error| format!("No se pudo borrar la carpeta: {error}"))?;
            return Ok(());
        }

        Err("La ruta objetivo no es un archivo ni una carpeta valida.".into())
    })
    .await
    .map_err(|error| format!("La operacion de borrado fallo: {error}"))?
}
