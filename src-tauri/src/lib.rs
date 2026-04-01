mod secure_fs;
mod torrent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(secure_fs::LibraryState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            secure_fs::ensure_library_scope,
            secure_fs::scan_library_entries,
            secure_fs::secure_open_path,
            secure_fs::secure_delete_path,
            torrent::fetch_nyaa,
            torrent::query_anilist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
