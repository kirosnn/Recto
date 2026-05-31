#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebView2 (Chromium) throttle le rendu ET la capture getDisplayMedia dès que
    // la fenêtre est occluse / en arrière-plan — ce qui arrive en permanence côté
    // Recto (on regarde forcément autre chose pendant qu'on partage). Résultat :
    // la capture tombe à ~20 fps même GPU au repos. On désactive ces mécanismes
    // d'économie d'énergie pour garder une capture pleine cadence en continu.
    //
    // Doit être défini AVANT la création de l'environnement WebView2 (donc ici,
    // tout début du process), sinon les flags sont ignorés.
    #[cfg(windows)]
    {
        const WEBVIEW2_FLAGS: &str = concat!(
            "--disable-features=",
            "CalculateNativeWinOcclusion,",   // ne pas marquer la fenêtre "cachée"
            "IntensiveWakeUpThrottling",
            " --disable-backgrounding-occluded-windows",
            " --disable-background-timer-throttling",
            " --disable-renderer-backgrounding",
        );
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", WEBVIEW2_FLAGS);
    }

    recto_lib::run();
}
