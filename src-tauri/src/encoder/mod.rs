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
        Self {
            width: 1920,
            height: 1080,
            framerate: 60,
            bitrate_bps: 20_000_000,
            gop_length: 0,
            low_latency: true,
        }
    }
}

/// Une unité H264 encodée (Annex-B), prête à être packetisée en RTP.
pub struct EncodedPacket {
    pub data: Vec<u8>,
    pub is_keyframe: bool,
    /// Timestamp de présentation, en unités de 100 ns (unité native MF).
    pub timestamp_100ns: i64,
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
}

/// Crée l'encodeur adapté au vendeur. Le device D3D11 DOIT être celui de la
/// capture (partage de texture zéro-copie GPU→encodeur).
pub fn create_encoder(
    vendor: Vendor,
    device: &ID3D11Device,
    config: EncoderConfig,
) -> Result<Box<dyn VideoEncoder>> {
    // Toutes les branches passent aujourd'hui par Media Foundation, mais on garde
    // le dispatch par vendeur explicite : c'est le point d'extension pour brancher
    // une impl AMF (AMD) ou NVENC (NVIDIA) native plus tard, sans rien changer
    // ailleurs.
    match vendor {
        Vendor::Amd | Vendor::Nvidia | Vendor::Intel | Vendor::Unknown => {
            let enc = media_foundation::MediaFoundationEncoder::new(vendor, device, config)?;
            Ok(Box::new(enc))
        }
    }
}
