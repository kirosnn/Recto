//! Probe phase 2 (étape B) : pipeline natif COMPLET de bout en bout.
//!
//!   capture DXGI → BGRA → [color_convert GPU] → NV12 → encodeur HW AMD (AMF via
//!   Media Foundation) → H264 Annex-B → fichier `native_capture.h264`
//!
//! Lancer (avec une vidéo en mouvement à l'écran) :
//!   cargo run --release --example encode_probe --manifest-path src-tauri/Cargo.toml
//!
//! Le fichier produit est lisible directement dans **VLC** (Annex-B brut). S'il
//! s'ouvre et montre ton écran net et fluide → tout le pipeline natif fonctionne,
//! on a dépassé getDisplayMedia/WebRTC-browser sur capture ET contrôle d'encodage.
//!
//! Inclut les modules via #[path] pour rester autonome (ne dépend pas de lib.rs).

#[path = "../src/capture.rs"]
mod capture;

#[path = "../src/hw_encoder.rs"]
mod hw_encoder;

#[path = "../src/encoder/mod.rs"]
mod encoder;

#[cfg(windows)]
fn main() {
    use capture::DesktopDuplicator;
    use encoder::{create_encoder, EncoderConfig, Vendor};
    use std::io::Write;
    use std::time::{Duration, Instant};

    // 1. Détecte le GPU et son vendeur.
    let caps = hw_encoder::detect();
    println!("[encode_probe] GPU : {} (vendeur={})", caps.gpu_name, caps.vendor);
    let vendor = Vendor::from_str(&caps.vendor);

    // 2. Capture (device D3D11 partagé avec l'encodeur).
    let mut dup = match DesktopDuplicator::new(0) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[encode_probe] capture init: {e}");
            std::process::exit(1);
        }
    };
    let (w, h) = dup.dimensions();
    println!("[encode_probe] bureau {w}x{h}");

    // 3. Encodeur matériel.
    let config = EncoderConfig {
        width: w,
        height: h,
        framerate: 60,
        bitrate_bps: 20_000_000,
        gop_length: 0,
        low_latency: true,
    };
    let mut enc = match create_encoder(vendor, dup.device(), config) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[encode_probe] encodeur init: {e}");
            std::process::exit(2);
        }
    };
    println!("[encode_probe] encodeur matériel prêt");

    // 4. Fichier de sortie.
    let out_path = "native_capture.h264";
    let mut file = std::fs::File::create(out_path).expect("création fichier .h264");

    // En-tête SPS/PPS : Media Foundation le range hors du flux des frames. Sans
    // lui en tête de fichier, aucun lecteur ne peut décoder (d'où "illisible").
    match enc.sequence_header() {
        Ok(hdr) if !hdr.is_empty() => {
            file.write_all(&hdr).expect("écriture en-tête");
            println!("[encode_probe] en-tête SPS/PPS écrit : {} octets", hdr.len());
        }
        Ok(_) => println!("[encode_probe] ⚠ en-tête SPS/PPS vide (inclus dans le flux ?)"),
        Err(e) => eprintln!("[encode_probe] en-tête err: {e}"),
    }

    println!("[encode_probe] départ dans 3 s — mets une vidéo en mouvement…");
    std::thread::sleep(Duration::from_secs(3));
    let _ = dup.acquire(0); // vide la frame de warmup

    // 5. Boucle capture→encode→fichier. On encode CHAQUE frame fraîche
    //    IMMÉDIATEMENT : la texture Desktop Duplication n'est valide que jusqu'au
    //    prochain acquire() (qui la libère). On ne peut donc PAS la stocker pour
    //    l'encoder à un tick ultérieur — ça donne E_INVALIDARG sur texture morte.
    //    (La cadence fixe 60 Hz avec ré-encodage sur écran figé nécessitera une
    //    COPIE de la texture dans une ressource qu'on possède — étape suivante.)
    let probe = Duration::from_secs(10);
    let start = Instant::now();
    let mut encoded_frames = 0u64;
    let mut encoded_packets = 0u64;
    let mut bytes_written = 0u64;
    let frame_interval = Duration::from_micros(1_000_000 / 60);
    let mut next_tick = Instant::now();

    while start.elapsed() < probe {
        // Bloque jusqu'à 16 ms pour la prochaine frame, puis encode tout de suite.
        match dup.acquire(16) {
            Ok(Some(frame)) => {
                let ts_100ns = start.elapsed().as_nanos() as i64 / 100;
                match enc.encode(&frame.texture, ts_100ns) {
                    Ok(()) => encoded_frames += 1,
                    Err(e) => eprintln!("[encode_probe] encode err: {e}"),
                }
            }
            Ok(None) => {} // écran figé : rien de neuf
            Err(e) => {
                eprintln!("[encode_probe] capture err: {e}");
                std::thread::sleep(Duration::from_millis(20));
            }
        }

        // Draine les NAL prêts.
        match enc.drain() {
            Ok(packets) => {
                for p in packets {
                    file.write_all(&p.data).expect("écriture .h264");
                    bytes_written += p.data.len() as u64;
                    encoded_packets += 1;
                }
            }
            Err(e) => eprintln!("[encode_probe] drain err: {e}"),
        }

        // Pacing léger pour ne pas spinner à vide quand l'écran est figé.
        next_tick += frame_interval;
        let now = Instant::now();
        if next_tick > now {
            std::thread::sleep(next_tick - now);
        } else {
            next_tick = now;
        }
    }

    file.flush().ok();
    let secs = start.elapsed().as_secs_f64();

    println!("\n[encode_probe] ===== RÉSULTAT =====");
    println!("  durée             : {secs:.1} s");
    println!("  frames encodées   : {encoded_frames} ({:.1} fps)", encoded_frames as f64 / secs);
    println!("  paquets H264      : {encoded_packets}");
    println!("  taille écrite     : {:.2} Mo", bytes_written as f64 / 1_000_000.0);
    println!("  bitrate effectif  : {:.1} Mbps", (bytes_written as f64 * 8.0 / secs) / 1_000_000.0);
    println!("\n  Fichier : {out_path}");
    println!("  → Ouvre-le dans VLC. S'il montre ton écran net et fluide,");
    println!("    le pipeline natif est validé bout en bout (capture+encode HW).");

    if encoded_packets == 0 {
        eprintln!("\n  ⚠ Aucun paquet encodé — voir les erreurs ci-dessus.");
        std::process::exit(3);
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("encode_probe : Windows uniquement.");
}
