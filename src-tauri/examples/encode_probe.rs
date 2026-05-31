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

#[path = "../src/audio.rs"]
mod audio;

#[path = "../src/encoder/mod.rs"]
mod encoder;

#[cfg(windows)]
fn main() {
    use capture::DesktopDuplicator;
    use encoder::{create_encoder, EncoderConfig, Vendor};
    use std::io::Write;
    use std::time::{Duration, Instant};
    use windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext;

    // 1. Détecte le GPU et son vendeur.
    let caps = hw_encoder::detect();
    println!(
        "[encode_probe] GPU : {} (vendeur={})",
        caps.gpu_name, caps.vendor
    );
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
    let config = EncoderConfig::for_desktop(w, h);
    if !config.is_resolution_allowed(w, h) {
        eprintln!(
            "[encode_probe] résolution refusée: {}x{}",
            config.width, config.height
        );
        std::process::exit(2);
    }
    println!(
        "[encode_probe] cible {}x{} @ {} fps, {:.1} Mbps",
        config.width,
        config.height,
        config.framerate,
        config.bitrate_bps as f64 / 1_000_000.0
    );
    let mut enc = match create_encoder(vendor, dup.device(), config) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[encode_probe] encodeur init: {e}");
            std::process::exit(2);
        }
    };
    println!("[encode_probe] encodeur matériel prêt");

    // 4. Fichiers de sortie.
    let out_path = "native_capture.h264";
    let mut file = std::fs::File::create(out_path).expect("création fichier .h264");
    let audio_path = "native_audio.f32";
    let muxed_path = "native_capture.mkv";

    // En-tête SPS/PPS : Media Foundation le range hors du flux des frames. Sans
    // lui en tête de fichier, aucun lecteur ne peut décoder (d'où "illisible").
    match enc.sequence_header() {
        Ok(hdr) if !hdr.is_empty() => {
            file.write_all(&hdr).expect("écriture en-tête");
            println!(
                "[encode_probe] en-tête SPS/PPS écrit : {} octets",
                hdr.len()
            );
        }
        Ok(_) => println!("[encode_probe] ⚠ en-tête SPS/PPS vide (inclus dans le flux ?)"),
        Err(e) => eprintln!("[encode_probe] en-tête err: {e}"),
    }

    println!("[encode_probe] départ dans 3 s — mets une vidéo en mouvement…");
    std::thread::sleep(Duration::from_secs(3));
    let audio = start_audio_capture(audio_path);
    let context: ID3D11DeviceContext = unsafe { dup.device().GetImmediateContext().unwrap() };
    let cached_frame = match dup.acquire(1000) {
        Ok(Some(frame)) => {
            let texture =
                create_cached_texture(dup.device(), &frame.texture).expect("texture cache");
            unsafe {
                context.CopyResource(&texture, &frame.texture);
                context.Flush();
            }
            texture
        }
        Ok(None) => {
            eprintln!("[encode_probe] aucune frame initiale");
            std::process::exit(3);
        }
        Err(e) => {
            eprintln!("[encode_probe] frame initiale err: {e}");
            std::process::exit(3);
        }
    };

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
    let mut last_dropped = 0u64;
    let mut acquire_ms = 0.0f64;
    let mut encode_ms = 0.0f64;
    let mut drain_ms = 0.0f64;
    let mut write_ms = 0.0f64;
    let frame_interval = Duration::from_micros(1_000_000 / 60);
    let mut next_tick = Instant::now();

    while start.elapsed() < probe {
        let acquire_start = Instant::now();
        match dup.acquire(0) {
            Ok(Some(frame)) => unsafe {
                context.CopyResource(&cached_frame, &frame.texture);
            },
            Ok(None) => {}
            Err(e) => {
                eprintln!("[encode_probe] capture err: {e}");
            }
        }
        acquire_ms += acquire_start.elapsed().as_secs_f64() * 1000.0;

        let ts_100ns = start.elapsed().as_nanos() as i64 / 100;
        let encode_start = Instant::now();
        match enc.encode(&cached_frame, ts_100ns) {
            Ok(()) => encoded_frames += 1,
            Err(e) => eprintln!("[encode_probe] encode err: {e}"),
        }
        encode_ms += encode_start.elapsed().as_secs_f64() * 1000.0;
        last_dropped = enc.dropped_frames();

        // Draine les NAL prêts.
        let drain_start = Instant::now();
        let drained = enc.drain();
        drain_ms += drain_start.elapsed().as_secs_f64() * 1000.0;
        match drained {
            Ok(packets) => {
                let write_start = Instant::now();
                for p in packets {
                    file.write_all(&p.data).expect("écriture .h264");
                    bytes_written += p.data.len() as u64;
                    encoded_packets += 1;
                }
                write_ms += write_start.elapsed().as_secs_f64() * 1000.0;
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
    let audio_samples = stop_audio_capture(audio);
    let secs = start.elapsed().as_secs_f64();
    let muxed = mux_capture(out_path, audio_path, muxed_path);

    println!("\n[encode_probe] ===== RÉSULTAT =====");
    println!("  durée             : {secs:.1} s");
    println!(
        "  frames soumises   : {encoded_frames} ({:.1} fps)",
        encoded_frames as f64 / secs
    );
    println!("  frames droppées   : {last_dropped}");
    println!("  paquets H264      : {encoded_packets}");
    println!("  samples audio     : {audio_samples}");
    println!(
        "  taille écrite     : {:.2} Mo",
        bytes_written as f64 / 1_000_000.0
    );
    println!(
        "  bitrate effectif  : {:.1} Mbps",
        (bytes_written as f64 * 8.0 / secs) / 1_000_000.0
    );
    println!("  temps acquire     : {:.1} ms", acquire_ms);
    println!("  temps encode      : {:.1} ms", encode_ms);
    println!("  temps drain       : {:.1} ms", drain_ms);
    println!("  temps écriture    : {:.1} ms", write_ms);
    let diag = enc.diagnostics();
    println!("    convert BGRA→NV12: {:.1} ms", diag.convert_ms);
    println!("    ProcessInput     : {:.1} ms", diag.process_input_ms);
    println!("    events MFT       : {:.1} ms", diag.pump_ms);
    println!("\n  Vidéo brute : {out_path}");
    println!("  Audio brut  : {audio_path}");
    match muxed {
        Ok(()) => {
            println!("  AV muxé     : {muxed_path}");
            println!("  → Ouvre native_capture.mkv avec ffplay/VLC pour tester vidéo + son.");
        }
        Err(e) => {
            eprintln!("  mux ffmpeg err: {e}");
        }
    }

    if encoded_packets == 0 {
        eprintln!("\n  ⚠ Aucun paquet encodé — voir les erreurs ci-dessus.");
        std::process::exit(3);
    }
}

#[cfg(windows)]
fn start_audio_capture(
    path: &'static str,
) -> Option<(
    std::sync::Arc<std::sync::atomic::AtomicBool>,
    std::thread::JoinHandle<u64>,
)> {
    use std::io::Write;

    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let thread_stop = stop.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let handle = std::thread::spawn(move || {
        let mut capture = match audio::SystemAudioPcmCapture::new() {
            Ok(capture) => capture,
            Err(e) => {
                eprintln!("[encode_probe] audio init err: {e}");
                let _ = ready_tx.send(false);
                return 0;
            }
        };
        println!(
            "[encode_probe] audio prêt : {} Hz, {} canaux → {} Hz, {} canaux",
            capture.input_sample_rate(),
            capture.input_channels(),
            capture.output_sample_rate(),
            capture.output_channels()
        );
        let mut file = match std::fs::File::create(path) {
            Ok(file) => file,
            Err(e) => {
                eprintln!("[encode_probe] audio fichier err: {e}");
                let _ = ready_tx.send(false);
                return 0;
            }
        };
        let _ = ready_tx.send(true);
        let mut samples = 0u64;
        let start = std::time::Instant::now();
        while !thread_stop.load(std::sync::atomic::Ordering::Relaxed) {
            match capture.poll_samples() {
                Ok(batch) => {
                    if write_f32_samples(&mut file, &batch).is_ok() {
                        samples += batch.len() as u64;
                    }
                }
                Err(e) => eprintln!("[encode_probe] audio capture err: {e}"),
            }
            let expected_samples = (start.elapsed().as_secs_f64() * 48_000.0 * 2.0) as u64;
            if samples < expected_samples {
                let missing = expected_samples - samples;
                if write_silence_samples(&mut file, missing).is_ok() {
                    samples += missing;
                }
            }
            if samples % 2 != 0 {
                if write_silence_samples(&mut file, 1).is_ok() {
                    samples += 1;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        file.flush().ok();
        samples
    });

    match ready_rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(true) => Some((stop, handle)),
        _ => {
            stop.store(true, std::sync::atomic::Ordering::Relaxed);
            let _ = handle.join();
            None
        }
    }
}

#[cfg(windows)]
fn write_f32_samples(file: &mut std::fs::File, samples: &[f32]) -> std::io::Result<()> {
    use std::io::Write;

    let mut bytes = Vec::with_capacity(samples.len() * std::mem::size_of::<f32>());
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    file.write_all(&bytes)
}

#[cfg(windows)]
fn write_silence_samples(file: &mut std::fs::File, count: u64) -> std::io::Result<()> {
    use std::io::Write;

    let bytes = vec![0u8; count as usize * std::mem::size_of::<f32>()];
    file.write_all(&bytes)
}

#[cfg(windows)]
fn stop_audio_capture(
    audio: Option<(
        std::sync::Arc<std::sync::atomic::AtomicBool>,
        std::thread::JoinHandle<u64>,
    )>,
) -> u64 {
    let Some((stop, handle)) = audio else {
        return 0;
    };
    stop.store(true, std::sync::atomic::Ordering::Relaxed);
    handle.join().unwrap_or(0)
}

#[cfg(windows)]
fn mux_capture(video_path: &str, audio_path: &str, muxed_path: &str) -> anyhow::Result<()> {
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-r",
            "60",
            "-f",
            "h264",
            "-i",
            video_path,
            "-f",
            "f32le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-i",
            audio_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "libopus",
            "-b:a",
            "160k",
            muxed_path,
        ])
        .status()?;

    if status.success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("ffmpeg exit {status}"))
    }
}

#[cfg(windows)]
fn create_cached_texture(
    device: &windows::Win32::Graphics::Direct3D11::ID3D11Device,
    source: &windows::Win32::Graphics::Direct3D11::ID3D11Texture2D,
) -> anyhow::Result<windows::Win32::Graphics::Direct3D11::ID3D11Texture2D> {
    unsafe {
        let mut desc = windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE2D_DESC::default();
        source.GetDesc(&mut desc);
        desc.Usage = windows::Win32::Graphics::Direct3D11::D3D11_USAGE_DEFAULT;
        desc.MipLevels = 1;
        desc.ArraySize = 1;
        desc.SampleDesc.Count = 1;
        desc.SampleDesc.Quality = 0;
        desc.BindFlags = 0;
        desc.CPUAccessFlags = 0;
        desc.MiscFlags = 0;
        let mut texture = None;
        device.CreateTexture2D(&desc, None, Some(&mut texture))?;
        texture.ok_or_else(|| anyhow::anyhow!("texture cache nulle"))
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("encode_probe : Windows uniquement.");
}
