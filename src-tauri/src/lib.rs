mod input;
mod gamepad;
mod hw_encoder;

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

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

#[tauri::command]
async fn gamepad_disconnect() {
    gamepad::disconnect();
}

#[tauri::command]
async fn get_hw_encoder_caps() -> hw_encoder::HwEncoderCaps {
    hw_encoder::detect()
}

#[tauri::command]
async fn get_auth_deep_links() -> Vec<String> {
    auth_deep_links_from_args(std::env::args())
}

fn should_open_externally(url: &tauri::Url) -> bool {
    matches!(
        url.host_str(),
        Some("discord.com" | "ptb.discord.com" | "canary.discord.com" | "fresxzlxizgvrtqlyunz.supabase.co")
    )
}

fn auth_deep_links_from_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .filter_map(|arg| {
            let value = arg.as_ref();
            if value.starts_with("recto://") {
                Some(value.to_string())
            } else {
                None
            }
        })
        .collect()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("external-auth-navigation")
                .on_navigation(|webview, url| {
                    if should_open_externally(url) {
                        let _ = webview.app_handle().opener().open_url(url.as_str(), None::<&str>);
                        false
                    } else {
                        true
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for url in auth_deep_links_from_args(args) {
                let _ = app.emit("auth-deep-link", url);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let _ = app.deep_link().register_all();
            let window = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            window.open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            inject_input,
            get_displays,
            gamepad_disconnect,
            get_hw_encoder_caps,
            set_window_title,
            minimize_window,
            maximize_window,
            close_window,
            get_auth_deep_links,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
