//! Probe phase 1 du pipeline natif : mesure le FPS RÉEL de la capture DXGI
//! Desktop Duplication, à comparer aux ~20 fps de `getDisplayMedia`/WebView2.
//!
//! Lancer (mettre une vidéo en mouvement sur l'écran pendant la mesure) :
//!   cargo run --release --example capture_probe --manifest-path src-tauri/Cargo.toml
//!
//! Inclut directement le module de capture via #[path] pour NE PAS dépendre de
//! lib.rs (qui contient du WIP non lié). C'est un binaire autonome.

#[path = "../src/capture.rs"]
mod capture;

#[cfg(windows)]
fn main() {
    use capture::DesktopDuplicator;
    use std::time::{Duration, Instant};

    let mut dup = match DesktopDuplicator::new(0) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[capture_probe] init échouée: {e}");
            std::process::exit(1);
        }
    };

    let (w, h) = dup.dimensions();
    println!("[capture_probe] sortie 0 : {w}x{h}, format={:?}", dup.format());
    println!("[capture_probe] mesure sur 5 s — bouge une vidéo plein écran maintenant…\n");

    let probe_duration = Duration::from_secs(5);
    let start = Instant::now();
    let mut acquired = 0u64;     // frames réellement nouvelles (contenu changé)
    let mut timeouts = 0u64;     // écran figé (aucune nouvelle frame)
    let mut errors = 0u64;

    // Fenêtres glissantes d'1 s pour afficher le FPS instantané.
    let mut window_start = Instant::now();
    let mut window_frames = 0u64;

    while start.elapsed() < probe_duration {
        match dup.acquire(15) {
            Ok(Some(frame)) => {
                if frame.dirty {
                    acquired += 1;
                    window_frames += 1;
                } else {
                    // Frame "curseur seulement" — on l'ignore dans le compte contenu.
                }
            }
            Ok(None) => timeouts += 1,
            Err(e) => {
                errors += 1;
                if errors <= 3 {
                    eprintln!("[capture_probe] acquire err: {e}");
                }
                // ACCESS_LOST nécessiterait de recréer le duplicator ; pour la
                // probe on tente juste de continuer.
                std::thread::sleep(Duration::from_millis(50));
            }
        }

        if window_start.elapsed() >= Duration::from_secs(1) {
            println!("  fps instantané (contenu changé) : {window_frames}");
            window_frames = 0;
            window_start = Instant::now();
        }
    }

    let secs = start.elapsed().as_secs_f64();
    let fps = acquired as f64 / secs;
    println!("\n[capture_probe] ===== RÉSULTAT =====");
    println!("  durée            : {secs:.1} s");
    println!("  frames contenu   : {acquired}  ({fps:.1} fps moyen)");
    println!("  timeouts (figé)  : {timeouts}");
    println!("  erreurs          : {errors}");
    println!("\n  Verdict : si fps moyen >> 20 sur vidéo en mouvement, la capture");
    println!("  native lève le plafond de getDisplayMedia → pipeline natif validé.");
}

#[cfg(not(windows))]
fn main() {
    eprintln!("capture_probe : Windows uniquement.");
}
