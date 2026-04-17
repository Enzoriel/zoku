use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::Serialize;
use tauri::State;

use crate::secure_fs::{current_root, ensure_within_root, LibraryState};

const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "webm", "mov"];
const DEFAULT_VIDEO_ASSOC_EXTENSIONS: &[&str] = &[".mkv", ".mp4", ".avi", ".webm", ".mov"];

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_MORE_DATA, S_FALSE};
#[cfg(windows)]
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
#[cfg(windows)]
use windows_sys::Win32::System::RestartManager::{
    CCH_RM_MAX_APP_NAME, CCH_RM_MAX_SVC_NAME, CCH_RM_SESSION_KEY, RM_PROCESS_INFO, RmEndSession,
    RmGetList, RmRegisterResources, RmStartSession,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
#[cfg(windows)]
use windows_sys::Win32::UI::Shell::{
    AssocQueryStringW, ASSOCSTR_EXECUTABLE, ASSOCSTR_FRIENDLYAPPNAME,
};
#[cfg(windows)]
use winreg::{enums::*, RegKey};

#[cfg(windows)]
const INVALID_HANDLE_VALUE: windows_sys::Win32::Foundation::HANDLE = !0 as *mut _;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedMediaFileResult {
    path: String,
    process_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatus {
    is_running: bool,
    active_file: Option<LockedMediaFileResult>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerExecutableInfo {
    key: String,
    executable_path: String,
    process_name: String,
    display_name: String,
}

fn normalize_process_name(name: &str) -> String {
    name.trim().to_lowercase().trim_end_matches(".exe").to_string()
}

fn normalize_player_key(key: &str) -> String {
    match normalize_process_name(key).as_str() {
        "mpv" => "mpv".into(),
        "vlc" => "vlc".into(),
        "mpc" | "mpc-hc" | "mpc-be" => "mpc".into(),
        "potplayer" => "potplayer".into(),
        _ => "other".into(),
    }
}

fn player_key_from_process_name(process_name: &str) -> String {
    let normalized = normalize_process_name(process_name);
    match normalized.as_str() {
        "mpv" => "mpv".into(),
        "vlc" => "vlc".into(),
        "mpc-hc64" | "mpc-hc" | "mpc-be64" | "mpc-be" => "mpc".into(),
        "potplayermini64" | "potplayermini" | "potplayer" => "potplayer".into(),
        _ => "other".into(),
    }
}

fn display_name_for_key(key: &str) -> String {
    match normalize_player_key(key).as_str() {
        "mpv" => "MPV".into(),
        "vlc" => "VLC".into(),
        "mpc" => "MPC".into(),
        "potplayer" => "PotPlayer".into(),
        _ => "Otro".into(),
    }
}

fn build_player_info(executable_path: PathBuf, fallback_key: Option<&str>) -> Option<PlayerExecutableInfo> {
    if !executable_path.is_file() {
        return None;
    }

    let normalized_path = fs::canonicalize(&executable_path).ok()?;
    let process_name = normalize_process_name(
        normalized_path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default()
            .as_str(),
    );

    if process_name.is_empty() {
        return None;
    }

    let inferred_key = fallback_key
        .map(normalize_player_key)
        .filter(|key| key != "other")
        .unwrap_or_else(|| player_key_from_process_name(&process_name));
    let key = if inferred_key == "other" {
        player_key_from_process_name(&process_name)
    } else {
        inferred_key
    };

    Some(PlayerExecutableInfo {
        key: key.clone(),
        executable_path: normalized_path.to_string_lossy().to_string(),
        process_name,
        display_name: display_name_for_key(&key),
    })
}

#[cfg(windows)]
fn process_names_for_player_key(player_key: &str) -> &'static [&'static str] {
    match normalize_player_key(player_key).as_str() {
        "mpv" => &["mpv.exe"],
        "vlc" => &["vlc.exe"],
        "mpc" => &["mpc-hc64.exe", "mpc-hc.exe", "mpc-be64.exe", "mpc-be.exe"],
        "potplayer" => &["PotPlayerMini64.exe", "PotPlayerMini.exe", "PotPlayer.exe"],
        _ => &[],
    }
}

#[cfg(windows)]
fn common_install_candidates(player_key: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let env_roots = [
        std::env::var_os("PROGRAMFILES"),
        std::env::var_os("PROGRAMFILES(X86)"),
        std::env::var_os("LOCALAPPDATA"),
    ];

    let relative_paths: &[&str] = match normalize_player_key(player_key).as_str() {
        "mpv" => &["mpv\\mpv.exe"],
        "vlc" => &["VideoLAN\\VLC\\vlc.exe", "VLC\\vlc.exe"],
        "mpc" => &[
            "MPC-HC\\mpc-hc64.exe",
            "MPC-HC\\mpc-hc.exe",
            "MPC-BE x64\\mpc-be64.exe",
            "MPC-BE\\mpc-be.exe",
            "MPC-BE\\mpc-be64.exe",
        ],
        "potplayer" => &[
            "DAUM\\PotPlayer\\PotPlayerMini64.exe",
            "DAUM\\PotPlayer\\PotPlayerMini.exe",
            "PotPlayer\\PotPlayerMini64.exe",
            "PotPlayer\\PotPlayerMini.exe",
            "PotPlayer\\PotPlayer.exe",
        ],
        _ => &[],
    };

    for root in env_roots.into_iter().flatten() {
        let root_path = PathBuf::from(root);
        for relative in relative_paths {
            candidates.push(root_path.join(relative));
        }
    }

    candidates
}

#[cfg(windows)]
fn find_executable_in_app_paths(exe_name: &str) -> Option<PathBuf> {
    let hive_candidates = [
        RegKey::predef(HKEY_CURRENT_USER),
        RegKey::predef(HKEY_LOCAL_MACHINE),
    ];

    for hive in hive_candidates {
        let subkey_path = format!(r"Software\Microsoft\Windows\CurrentVersion\App Paths\{exe_name}");
        if let Ok(subkey) = hive.open_subkey(subkey_path) {
            if let Ok(value) = subkey.get_value::<String, _>("") {
                let candidate = PathBuf::from(value.trim_matches('"'));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

#[cfg(windows)]
fn find_executable_using_where(exe_name: &str) -> Option<PathBuf> {
    let output = Command::new("where").arg(exe_name).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8(output.stdout).ok()?;
    stdout
        .lines()
        .map(|line| PathBuf::from(line.trim_matches('"').trim()))
        .find(|path| path.is_file())
}

#[cfg(windows)]
fn find_known_player_installation(player_key: &str) -> Option<PlayerExecutableInfo> {
    let normalized_key = normalize_player_key(player_key);
    if normalized_key == "other" {
        return None;
    }

    for exe_name in process_names_for_player_key(&normalized_key) {
        if let Some(path) = find_executable_in_app_paths(exe_name).or_else(|| find_executable_using_where(exe_name)) {
            if let Some(info) = build_player_info(path, Some(&normalized_key)) {
                return Some(info);
            }
        }
    }

    for path in common_install_candidates(&normalized_key) {
        if let Some(info) = build_player_info(path, Some(&normalized_key)) {
            return Some(info);
        }
    }

    None
}

#[cfg(windows)]
fn to_wide_null(value: &str) -> Vec<u16> {
    Path::new(value)
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn assoc_query_string(association: &str, query: i32) -> Option<String> {
    let association_wide = to_wide_null(association);
    let mut len = 0u32;

    let first = unsafe {
        AssocQueryStringW(
            0,
            query,
            association_wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            &mut len,
        )
    };

    if !(first == S_FALSE || (first != 0 && len > 0) || len > 0) {
        return None;
    }

    let mut buffer = vec![0u16; len as usize];
    let result = unsafe {
        AssocQueryStringW(
            0,
            query,
            association_wide.as_ptr(),
            std::ptr::null(),
            buffer.as_mut_ptr(),
            &mut len,
        )
    };

    if result != 0 || len == 0 {
        return None;
    }

    let end = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    let value = String::from_utf16_lossy(&buffer[..end])
        .trim()
        .trim_matches('"')
        .to_string();

    (!value.is_empty()).then_some(value)
}

#[cfg(windows)]
fn detect_default_player_from_associations() -> Option<PlayerExecutableInfo> {
    for extension in DEFAULT_VIDEO_ASSOC_EXTENSIONS {
        let Some(executable) = assoc_query_string(extension, ASSOCSTR_EXECUTABLE) else {
            continue;
        };
        let executable_path = PathBuf::from(executable);
        if !executable_path.is_file() {
            continue;
        }

        let friendly_name = assoc_query_string(extension, ASSOCSTR_FRIENDLYAPPNAME);
        let fallback_key = player_key_from_process_name(
            executable_path
                .file_stem()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default()
                .as_str(),
        );
        let mut info = build_player_info(executable_path, Some(&fallback_key))?;
        if let Some(name) = friendly_name.filter(|value| !value.trim().is_empty()) {
            info.display_name = name.trim().to_string();
        }
        return Some(info);
    }

    None
}

#[cfg(not(windows))]
fn detect_default_player_from_associations() -> Option<PlayerExecutableInfo> {
    None
}

#[cfg(windows)]
#[tauri::command]
pub fn is_process_running(process_names: Vec<String>) -> bool {
    let normalized_targets: HashSet<String> = process_names
        .into_iter()
        .map(|name| normalize_process_name(&name))
        .filter(|name| !name.is_empty())
        .collect();

    if normalized_targets.is_empty() {
        return false;
    }

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot.is_null() || snapshot == INVALID_HANDLE_VALUE {
        return false;
    }

    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            let name = String::from_utf16_lossy(&entry.szExeFile)
                .trim_matches(char::from(0))
                .to_string();

            if normalized_targets.contains(&normalize_process_name(&name)) {
                unsafe { CloseHandle(snapshot) };
                return true;
            }

            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }

    unsafe { CloseHandle(snapshot) };
    false
}

#[cfg(not(windows))]
#[tauri::command]
pub fn is_process_running(_process_names: Vec<String>) -> bool {
    false
}

fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .map(|value| VIDEO_EXTENSIONS.iter().any(|extension| extension == &value))
        .unwrap_or(false)
}

fn pick_preferred_process_name(
    locking_process_names: &[String],
    preferred_process_names: &[String],
) -> Option<String> {
    let locking_names = locking_process_names
        .iter()
        .map(|name| normalize_process_name(name))
        .collect::<HashSet<_>>();

    preferred_process_names
        .iter()
        .map(|name| normalize_process_name(name))
        .find(|name| locking_names.contains(name))
}

#[cfg(windows)]
fn get_locking_process_ids(path: &Path) -> Result<Vec<u32>, String> {
    let mut session_handle = 0u32;
    let mut session_key = [0u16; (CCH_RM_SESSION_KEY as usize) + 1];

    let start_result = unsafe { RmStartSession(&mut session_handle, 0, session_key.as_mut_ptr()) };
    if start_result != 0 {
        return Err(format!("Sesion RM fallo: {start_result}"));
    }

    let encoded_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let resources = [encoded_path.as_ptr()];

    let register_result = unsafe {
        RmRegisterResources(
            session_handle,
            resources.len() as u32,
            resources.as_ptr(),
            0,
            std::ptr::null(),
            0,
            std::ptr::null(),
        )
    };

    if register_result != 0 {
        unsafe { RmEndSession(session_handle) };
        return Err(format!("Registro RM fallo: {register_result}"));
    }

    let mut needed = 0u32;
    let mut count = 0u32;
    let mut reboot_reasons = 0u32;
    let first_result = unsafe {
        RmGetList(
            session_handle,
            &mut needed,
            &mut count,
            std::ptr::null_mut(),
            &mut reboot_reasons,
        )
    };

    let pids = if first_result == ERROR_MORE_DATA || (first_result == 0 && needed > 0) {
        let mut process_info = vec![
            RM_PROCESS_INFO {
                Process: unsafe { std::mem::zeroed() },
                strAppName: [0; (CCH_RM_MAX_APP_NAME as usize) + 1],
                strServiceShortName: [0; (CCH_RM_MAX_SVC_NAME as usize) + 1],
                ApplicationType: 0,
                AppStatus: 0,
                TSSessionId: 0,
                bRestartable: 0,
            };
            needed as usize
        ];
        count = needed;

        let second_result = unsafe {
            RmGetList(
                session_handle,
                &mut needed,
                &mut count,
                process_info.as_mut_ptr(),
                &mut reboot_reasons,
            )
        };

        if second_result != 0 {
            unsafe { RmEndSession(session_handle) };
            return Ok(Vec::new());
        }

        process_info
            .into_iter()
            .take(count as usize)
            .map(|info| info.Process.dwProcessId)
            .filter(|pid| *pid > 0)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    unsafe { RmEndSession(session_handle) };
    Ok(pids)
}

#[cfg(not(windows))]
fn get_locking_process_ids(_path: &Path) -> Result<Vec<u32>, String> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn get_process_basename(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }

    let mut buffer = vec![0u16; 32768];
    let mut buffer_len = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut buffer_len) };
    unsafe { CloseHandle(handle) };

    if ok == 0 || buffer_len == 0 {
        return None;
    }

    let full_path = String::from_utf16_lossy(&buffer[..buffer_len as usize]);
    let basename = PathBuf::from(full_path)
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())?;

    Some(normalize_process_name(&basename))
}

#[cfg(not(windows))]
fn get_process_basename(_pid: u32) -> Option<String> {
    None
}

fn get_locking_process_names(path: &Path) -> Vec<String> {
    match get_locking_process_ids(path) {
        Ok(pids) => pids.into_iter().filter_map(get_process_basename).collect(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn check_player_status(
    candidate_paths: Vec<String>,
    preferred_process_names: Vec<String>,
    state: State<'_, LibraryState>,
) -> Result<PlayerStatus, String> {
    let root = current_root(&state)?;
    let preferred_names = preferred_process_names
        .into_iter()
        .map(|name| normalize_process_name(&name))
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();

    let is_running = is_process_running(preferred_names.clone());
    if !is_running {
        return Ok(PlayerStatus {
            is_running: false,
            active_file: None,
        });
    }

    for candidate_path in candidate_paths {
        let canonical_path = match ensure_within_root(&root, Path::new(&candidate_path)) {
            Ok(path) => path,
            Err(_) => continue,
        };

        if !canonical_path.is_file() || !is_video_file(&canonical_path) {
            continue;
        }

        let locking_names = get_locking_process_names(&canonical_path);
        if let Some(process_name) = pick_preferred_process_name(&locking_names, &preferred_names) {
            return Ok(PlayerStatus {
                is_running: true,
                active_file: Some(LockedMediaFileResult {
                    path: canonical_path.to_string_lossy().to_string(),
                    process_name,
                }),
            });
        }
    }

    Ok(PlayerStatus {
        is_running: true,
        active_file: None,
    })
}

#[tauri::command]
pub fn detect_locked_media_file(
    candidate_paths: Vec<String>,
    preferred_process_names: Vec<String>,
    state: State<'_, LibraryState>,
) -> Result<Option<LockedMediaFileResult>, String> {
    let status = check_player_status(candidate_paths, preferred_process_names, state)?;
    Ok(status.active_file)
}

#[cfg(windows)]
#[tauri::command]
pub fn detect_default_video_player() -> Result<Option<PlayerExecutableInfo>, String> {
    Ok(detect_default_player_from_associations())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn detect_default_video_player() -> Result<Option<PlayerExecutableInfo>, String> {
    Ok(None)
}

#[cfg(windows)]
#[tauri::command]
pub fn detect_known_player(player_key: String) -> Result<Option<PlayerExecutableInfo>, String> {
    Ok(find_known_player_installation(&player_key))
}

#[cfg(not(windows))]
#[tauri::command]
pub fn detect_known_player(_player_key: String) -> Result<Option<PlayerExecutableInfo>, String> {
    Ok(None)
}

#[tauri::command]
pub fn launch_configured_player(
    executable_path: String,
    media_path: String,
    state: State<'_, LibraryState>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let media_target = ensure_within_root(&root, Path::new(&media_path))?;
    if !media_target.is_file() || !is_video_file(&media_target) {
        return Err("Solo se pueden reproducir archivos de video dentro de la biblioteca.".into());
    }

    let executable_target = fs::canonicalize(Path::new(&executable_path))
        .map_err(|_| "No se pudo resolver el ejecutable configurado.".to_string())?;

    if !executable_target.is_file() {
        return Err("La ruta configurada del reproductor no apunta a un archivo valido.".into());
    }

    if executable_target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("exe"))
        != Some(true)
    {
        return Err("El reproductor configurado debe ser un ejecutable .exe.".into());
    }

    Command::new(&executable_target)
        .arg(&media_target)
        .spawn()
        .map_err(|error| format!("No se pudo iniciar el reproductor configurado: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        is_video_file, normalize_player_key, normalize_process_name, pick_preferred_process_name,
        player_key_from_process_name,
    };
    use std::path::Path;

    #[test]
    fn normalize_process_name_strips_extension_and_case() {
        assert_eq!(normalize_process_name("VLC.EXE"), "vlc");
        assert_eq!(normalize_process_name(" mpv "), "mpv");
    }

    #[test]
    fn pick_preferred_process_name_respects_preference_order() {
        let locking = vec!["potplayermini64".to_string(), "vlc".to_string()];
        let preferred = vec!["vlc".to_string(), "potplayermini64".to_string()];

        assert_eq!(
            pick_preferred_process_name(&locking, &preferred),
            Some("vlc".to_string())
        );
    }

    #[test]
    fn is_video_file_accepts_supported_extensions() {
        assert!(is_video_file(Path::new("episode.mkv")));
        assert!(!is_video_file(Path::new("episode.part")));
    }

    #[test]
    fn mpc_family_maps_to_single_player_key() {
        assert_eq!(player_key_from_process_name("mpc-hc64"), "mpc");
        assert_eq!(player_key_from_process_name("mpc-be"), "mpc");
        assert_eq!(normalize_player_key("mpc-hc"), "mpc");
    }
}
