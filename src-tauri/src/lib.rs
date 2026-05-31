pub mod audio;
mod capture;
mod encoder;
mod gamepad;
mod hw_encoder;
mod input;
mod velocity;
mod velocity_transport;

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
async fn velocity_caps() -> velocity::VelocityCaps {
    velocity::caps()
}

#[tauri::command]
async fn velocity_selftest() -> Result<velocity::VelocitySelfTest, String> {
    velocity::selftest().map_err(|e| e.to_string())
}

#[tauri::command]
async fn velocity_start(
    settings: velocity_transport::VelocityStartSettings,
) -> Result<velocity_transport::VelocityStartResult, String> {
    velocity_transport::start(settings)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn velocity_accept_answer(
    answer: webrtc::peer_connection::sdp::session_description::RTCSessionDescription,
) -> Result<(), String> {
    velocity_transport::accept_answer(answer)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn velocity_stop() -> Result<(), String> {
    velocity_transport::stop().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_auth_deep_links(app: tauri::AppHandle) -> Vec<String> {
    auth_deep_links_from_args(
        std::env::args(),
        auth_schemes_for_identifier(&app.config().identifier),
    )
}

fn should_open_externally(url: &tauri::Url) -> bool {
    matches!(
        url.host_str(),
        Some(
            "discord.com"
                | "ptb.discord.com"
                | "canary.discord.com"
                | "fresxzlxizgvrtqlyunz.supabase.co"
        )
    )
}

fn auth_schemes_for_identifier(identifier: &str) -> &'static [&'static str] {
    match identifier {
        "com.recto.dev.recto" => &["recto-dev-recto"],
        "com.recto.dev.verso" => &["recto-dev-verso"],
        _ => &["recto"],
    }
}

fn is_auth_deep_link_for_schemes(value: &str, schemes: &[&str]) -> bool {
    value
        .split_once("://")
        .is_some_and(|(scheme, _)| schemes.contains(&scheme))
}

fn auth_deep_links_from_args<I, S>(args: I, schemes: &[&str]) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .filter_map(|arg| {
            let value = arg.as_ref();
            if is_auth_deep_link_for_schemes(value, schemes) {
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
                        let _ = webview
                            .app_handle()
                            .opener()
                            .open_url(url.as_str(), None::<&str>);
                        false
                    } else {
                        true
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for url in auth_deep_links_from_args(
                args,
                auth_schemes_for_identifier(&app.config().identifier),
            ) {
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
            velocity_caps,
            velocity_selftest,
            velocity_start,
            velocity_accept_answer,
            velocity_stop,
            set_window_title,
            minimize_window,
            maximize_window,
            close_window,
            get_auth_deep_links,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
