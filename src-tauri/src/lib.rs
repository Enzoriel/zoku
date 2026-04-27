mod playback;
mod secure_fs;
mod torrent;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[derive(Default)]
struct AppRuntimeState {
    is_quitting: AtomicBool,
}

fn restore_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            restore_main_window(app);
        }))
        .manage(secure_fs::LibraryState::new())
        .manage(AppRuntimeState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let open_item = MenuItem::with_id(app, "tray_open", "Abrir Zoku", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "tray_quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .tooltip("Zoku")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
                    "tray_open" => restore_main_window(app),
                    "tray_quit" => {
                        app.state::<AppRuntimeState>()
                            .is_quitting
                            .store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event: TrayIconEvent| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => restore_main_window(tray.app_handle()),
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }

            tray.build(app)?;

            // Maximizar la ventana principal programáticamente para evitar bugs con los bordes
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                if !window.state::<AppRuntimeState>().is_quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            playback::check_player_status,
            playback::detect_locked_media_file,
            playback::detect_default_video_player,
            playback::detect_known_player,
            playback::is_process_running,
            playback::launch_configured_player,
            secure_fs::ensure_library_scope,
            secure_fs::scan_library_entries,
            secure_fs::secure_delete_path,
            torrent::fetch_nyaa,
            torrent::query_anilist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
