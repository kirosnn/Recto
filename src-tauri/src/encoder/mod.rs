//! Encodeur vidéo matériel — phase 2 du pipeline natif.
//!
//! Stratégie : un **trait `VideoEncoder`** abstrait, avec une implémentation
//! choisie selon le **vendeur GPU** (AMD / NVIDIA / Intel). Toutes les implés
//! partagent la même interface (`encode` d'une texture D3D11 → NAL H264), donc
//! le reste du pipeline (packetisation RTP, transport) est indépendant du GPU.
//!
//! Première impl : `MediaFoundationEncoder` (module `media_foundation`). Sur
//! Windows, Media Foundation route vers le **MFT matériel du vendeur** :
//!   - AMD  → "AMD H.264 Hardware MFT" (= AMF, le silicium d'encodage AMD)
//!   - NVIDIA → "NVIDIA H.264 Encoder MFT" (= NVENC)
//!   - Intel → "Intel Quick Sync H.264 MFT" (= QSV)
//! C'est donc le VRAI encodeur GPU, pilotable (bitrate/QP/GOP/low-latency), et le
//! même code couvre les trois vendeurs. On pourra plus tard ajouter une impl AMF
//! ou NVENC native derrière ce même trait pour des réglages plus fins (ex.
//! build-to-lossless), sans toucher au reste.

#![cfg(windows)]

use anyhow::Result;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};

pub mod amf_direct;
pub mod color_convert;
pub mod media_foundation;

/// Vendeur de l'encodeur matériel ciblé. Détecté via [`crate::hw_encoder`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Vendor {
    Amd,
    Nvidia,
    Intel,
    Unknown,
}

impl Vendor {
    pub fn from_str(s: &str) -> Self {
        match s {
            "amd" => Vendor::Amd,
            "nvidia" => Vendor::Nvidia,
            "intel" => Vendor::Intel,
            _ => Vendor::Unknown,
        }
    }
}

/// Réglages d'encodage. Exposent ce que l'API navigateur ne donnait PAS :
/// contrôle direct du bitrate, du mode (CBR/VBR/CQP), du GOP et de la latence.
#[derive(Debug, Clone)]
pub struct EncoderConfig {
    pub width: u32,
    pub height: u32,
    pub framerate: u32,
    pub bitrate_bps: u32,
    /// Intervalle entre keyframes (en frames). 0 = uniquement sur demande (IDR-on-
    /// PLI), idéal latence/contrôle distant car on évite les keyframes périodiques.
    pub gop_length: u32,
    /// Mode basse latence : pas de B-frames, sortie au fil de l'eau.
    pub low_latency: bool,
}

impl Default for EncoderConfig {
    fn default() -> Self {
        Self::for_desktop(1920, 1080)
    }
}

impl EncoderConfig {
    pub fn for_desktop(width: u32, height: u32) -> Self {
        let pixels = width as u64 * height as u64;
        let bitrate_bps = ((pixels * 60 * 36) / 100).clamp(35_000_000, 180_000_000) as u32;

        Self {
            width,
            height,
            framerate: 60,
            bitrate_bps,
            gop_length: 0,
            low_latency: true,
        }
    }

    pub fn is_resolution_allowed(&self, desktop_width: u32, desktop_height: u32) -> bool {
        desktop_width < 1920 || desktop_height < 1080 || (self.width >= 1920 && self.height >= 1080)
    }
}

/// Une unité H264 encodée (Annex-B), prête à être packetisée en RTP.
pub struct EncodedPacket {
    pub data: Vec<u8>,
    pub is_keyframe: bool,
    /// Timestamp de présentation, en unités de 100 ns (unité native MF).
    pub timestamp_100ns: i64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct EncoderDiagnostics {
    pub convert_ms: f64,
    pub process_input_ms: f64,
    pub pump_ms: f64,
}

/// Interface commune à tous les encodeurs matériels, quel que soit le vendeur.
pub trait VideoEncoder {
    /// Soumet une texture D3D11 (BGRA, issue de la capture) à l'encodeur.
    /// Peut ne rien renvoyer immédiatement (l'encodeur bufferise) — voir `drain`.
    fn encode(&mut self, texture: &ID3D11Texture2D, timestamp_100ns: i64) -> Result<()>;

    /// Récupère les paquets H264 prêts. À appeler après chaque `encode`.
    fn drain(&mut self) -> Result<Vec<EncodedPacket>>;

    /// Force la prochaine frame à être une keyframe (IDR). Appelé sur réception
    /// d'un PLI/FIR côté transport (le récepteur a perdu le fil).
    fn request_keyframe(&mut self);

    /// En-tête de séquence (SPS/PPS en Annex-B) à émettre avant la 1re frame.
    /// Vide par défaut ; les encodeurs qui le séparent du flux le surchargent.
    fn sequence_header(&self) -> Result<Vec<u8>> {
        Ok(Vec::new())
    }

    /// Frames jetées par l'encodeur faute de pouvoir suivre (backpressure).
    /// 0 par défaut ; diagnostic de cadence.
    fn dropped_frames(&self) -> u64 {
        0
    }

    fn diagnostics(&self) -> EncoderDiagnostics {
        EncoderDiagnostics::default()
    }
}

/// Crée l'encodeur adapté au vendeur. Le device D3D11 DOIT être celui de la
/// capture (partage de texture zéro-copie GPU→encodeur).
pub fn create_encoder(
    vendor: Vendor,
    device: &ID3D11Device,
    config: EncoderConfig,
) -> Result<Box<dyn VideoEncoder>> {
    match vendor {
        Vendor::Amd => match amf_direct::AmfDirectEncoder::new(device, config.clone()) {
            Ok(enc) => Ok(Box::new(enc)),
            Err(_) => {
                let enc = media_foundation::MediaFoundationEncoder::new(vendor, device, config)?;
                Ok(Box::new(enc))
            }
        },
        Vendor::Nvidia | Vendor::Intel | Vendor::Unknown => {
            let enc = media_foundation::MediaFoundationEncoder::new(vendor, device, config)?;
            Ok(Box::new(enc))
        }
    }
}
