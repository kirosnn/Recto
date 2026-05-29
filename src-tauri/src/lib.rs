mod input;

use tauri::Manager;

#[tauri::command]
async fn inject_input(event: input::InputEvent) -> Result<(), String> {
    input::inject(event).map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
async fn get_displays() -> Vec<input::DisplayInfo> {
    input::get_displays()
}

#[tauri::command]
async fn set_window_title(window: tauri::Window, title: String) {
    let _ = window.set_title(&title);
}

#[tauri::command]
async fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
async fn maximize_window(window: tauri::Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
async fn close_window(window: tauri::Window) {
    let _ = window.close();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            window.open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            inject_input,
            get_displays,
            set_window_title,
            minimize_window,
            maximize_window,
            close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
