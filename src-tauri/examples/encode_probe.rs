//! Probe phase 2 (étape A) : prouve qu'on accède au **MFT encodeur H264 matériel**
//! du vendeur GPU (AMD chez l'utilisateur) via Media Foundation.
//!
//! Lancer :
//!   cargo run --release --example encode_probe --manifest-path src-tauri/Cargo.toml
//!
//! Inclut les modules via #[path] pour rester autonome (ne dépend pas de lib.rs).
//! Étape A = énumération/activation. L'encodage réel (texture→H264) vient en
//! étape B une fois ceci validé.

#[path = "../src/capture.rs"]
mod capture;

#[path = "../src/hw_encoder.rs"]
mod hw_encoder;

// Le module encoder référence `crate::encoder::...` et `crate::hw_encoder` ; on le
// monte sous un chemin compatible en le re-déclarant ici comme `encoder`.
#[path = "../src/encoder/mod.rs"]
mod encoder;

#[cfg(windows)]
fn main() {
    use capture::DesktopDuplicator;
    use encoder::{create_encoder, EncoderConfig, Vendor};

    // 1. Détecte le vendeur GPU réel.
    let caps = hw_encoder::detect();
    println!("[encode_probe] GPU : {} (vendeur={})", caps.gpu_name, caps.vendor);
    let vendor = Vendor::from_str(&caps.vendor);

    // 2. Device D3D11 via la capture (même device = futur zéro-copie texture→encode).
    let dup = match DesktopDuplicator::new(0) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[encode_probe] capture init échouée: {e}");
            std::process::exit(1);
        }
    };
    let (w, h) = dup.dimensions();
    println!("[encode_probe] device D3D11 OK, bureau {w}x{h}");

    // 3. Crée l'encodeur → doit trouver+activer le MFT matériel du vendeur.
    let config = EncoderConfig {
        width: w,
        height: h,
        ..Default::default()
    };
    match create_encoder(vendor, dup.device(), config) {
        Ok(enc) => {
            // On récupère le nom via le type concret (downcast non nécessaire :
            // create_encoder renvoie un Box<dyn>, mais on logge depuis l'impl).
            // Pour l'étape A on relit le nom via une 2e construction directe :
            drop(enc);
            report_encoder_name(vendor, dup.device(), w, h);
        }
        Err(e) => {
            eprintln!("\n[encode_probe] ÉCHEC activation encodeur : {e}");
            eprintln!("  → soit pas de MFT H264 matériel exposé, soit vendeur non reconnu.");
            std::process::exit(2);
        }
    }
}

#[cfg(windows)]
fn report_encoder_name(
    vendor: encoder::Vendor,
    device: &windows::Win32::Graphics::Direct3D11::ID3D11Device,
    w: u32,
    h: u32,
) {
    use encoder::media_foundation::MediaFoundationEncoder;
    use encoder::EncoderConfig;

    let config = EncoderConfig { width: w, height: h, ..Default::default() };
    match MediaFoundationEncoder::new(vendor, device, config) {
        Ok(enc) => {
            println!("\n[encode_probe] ===== RÉSULTAT =====");
            println!("  MFT matériel activé : \"{}\"", enc.encoder_name());
            println!("  vendeur ciblé       : {:?}", enc.vendor());
            println!(
                "  config              : {}x{} @ {} fps, {} kbps",
                enc.config().width,
                enc.config().height,
                enc.config().framerate,
                enc.config().bitrate_bps / 1000,
            );
            println!("\n  ✅ Accès à l'encodeur GPU confirmé. Prochaine étape : boucle d'encodage.");
        }
        Err(e) => eprintln!("[encode_probe] échec: {e}"),
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("encode_probe : Windows uniquement.");
}
