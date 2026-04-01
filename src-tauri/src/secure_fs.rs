use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_fs::FsExt;
use tauri_plugin_opener::OpenerExt;

pub struct LibraryRootState(pub Mutex<Option<PathBuf>>);

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

fn current_root(state: &State<'_, LibraryRootState>) -> Result<PathBuf, String> {
    let guard = state
        .0
        .lock()
        .map_err(|_| "No se pudo acceder al estado de seguridad de la biblioteca.".to_string())?;

    guard
        .clone()
        .ok_or_else(|| "No hay una biblioteca autorizada configurada.".to_string())
}

fn update_fs_scope<R: Runtime>(
    app: &AppHandle<R>,
    _previous: Option<&Path>,
    next: Option<&Path>,
) -> Result<(), String> {
    let scope = app.fs_scope();

    if let Some(next_path) = next {
        scope
            .allow_directory(next_path, true)
            .map_err(|error| format!("No se pudo autorizar la biblioteca seleccionada: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn ensure_library_scope<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    state: State<'_, LibraryRootState>,
) -> Result<(), String> {
    let next_root = if path.trim().is_empty() {
        None
    } else {
        Some(canonicalize_directory(Path::new(&path))?)
    };

    let previous_root = {
        let guard = state.0.lock().map_err(|_| {
            "No se pudo acceder al estado de seguridad de la biblioteca.".to_string()
        })?;
        guard.clone()
    };

    update_fs_scope(&app, previous_root.as_deref(), next_root.as_deref())?;

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "No se pudo acceder al estado de seguridad de la biblioteca.".to_string())?;
    *guard = next_root;

    Ok(())
}

#[tauri::command]
pub async fn secure_open_path<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    state: State<'_, LibraryRootState>,
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
    state: State<'_, LibraryRootState>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let target = ensure_within_root(&root, Path::new(&path))?;

    tokio::task::spawn_blocking(move || {
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
