#[path = "../src/audio.rs"]
mod audio;

#[cfg(windows)]
fn main() {
    use audio::{AudioConfig, SystemAudioEncoder};
    use std::io::Write;
    use std::time::{Duration, Instant};

    let mut encoder = match SystemAudioEncoder::new(AudioConfig::default()) {
        Ok(encoder) => encoder,
        Err(e) => {
            eprintln!("[audio_probe] init err: {e}");
            std::process::exit(1);
        }
    };

    println!(
        "[audio_probe] entrée WASAPI : {} Hz, {} canaux",
        encoder.input_sample_rate(),
        encoder.input_channels()
    );
    println!("[audio_probe] sortie Opus : 48000 Hz, stereo, 160 kbps cible");
    println!("[audio_probe] départ dans 2 s — lance un son système ou une vidéo");
    std::thread::sleep(Duration::from_secs(2));

    let mut file = std::fs::File::create("native_audio.opuspackets").expect("fichier audio");
    let start = Instant::now();
    let duration = Duration::from_secs(10);
    let mut packets = 0u64;
    let mut bytes = 0u64;
    let mut last_ts = 0i64;

    while start.elapsed() < duration {
        match encoder.poll_packets() {
            Ok(batch) => {
                for packet in batch {
                    let len = packet.data.len() as u32;
                    file.write_all(&packet.timestamp_100ns.to_le_bytes())
                        .expect("écriture timestamp");
                    file.write_all(&len.to_le_bytes()).expect("écriture taille");
                    file.write_all(&packet.data).expect("écriture opus");
                    last_ts = packet.timestamp_100ns;
                    bytes += packet.data.len() as u64;
                    packets += 1;
                }
            }
            Err(e) => {
                eprintln!("[audio_probe] capture err: {e}");
            }
        }
        std::thread::sleep(Duration::from_millis(2));
    }

    file.flush().ok();
    let secs = start.elapsed().as_secs_f64();
    println!("\n[audio_probe] ===== RÉSULTAT =====");
    println!("  durée             : {secs:.1} s");
    println!("  paquets Opus      : {packets}");
    println!("  taille écrite     : {:.2} Mo", bytes as f64 / 1_000_000.0);
    println!(
        "  bitrate effectif  : {:.1} kbps",
        (bytes as f64 * 8.0 / secs) / 1_000.0
    );
    println!("  dernier timestamp : {last_ts}");
    println!("  fichier           : native_audio.opuspackets");

    if packets == 0 {
        eprintln!("\n  Aucun paquet audio encodé.");
        std::process::exit(2);
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("audio_probe : Windows uniquement.");
}
