//! Encodeur H264 via **Media Foundation**, routé vers le MFT matériel du vendeur.
//!
//! Étape A (ce fichier en l'état) : initialiser MF, **énumérer les encodeurs H264
//! matériels** et activer celui du vendeur détecté. C'est le point dur et risqué
//! (FFI COM) ; le valider isolément prouve qu'on tient bien l'encodeur GPU AMD.
//! La boucle d'encodage (soumettre la texture, drainer les NAL) vient en étape B.

#![cfg(windows)]

use anyhow::{anyhow, Result};
use windows::core::PWSTR;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};
use windows::Win32::Media::MediaFoundation::{
    IMFActivate, IMFTransform, MFMediaType_Video, MFStartup, MFT_CATEGORY_VIDEO_ENCODER,
    MFT_ENUM_FLAG_HARDWARE, MFT_ENUM_FLAG_SORTANDFILTER, MFT_FRIENDLY_NAME_Attribute,
    MFT_REGISTER_TYPE_INFO, MFVideoFormat_H264, MFSTARTUP_FULL, MFTEnumEx,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::{EncodedPacket, EncoderConfig, Vendor, VideoEncoder};

/// Encodeur H264 matériel piloté via Media Foundation.
pub struct MediaFoundationEncoder {
    vendor: Vendor,
    config: EncoderConfig,
    /// Nom humain du MFT sélectionné (ex. "AMD H.264 Hardware MFT"). Sert de
    /// preuve, en étape A, que c'est bien l'encodeur matériel du vendeur.
    encoder_name: String,
    /// Le transform matériel activé. Présent dès l'étape A ; la boucle d'encodage
    /// l'utilisera en étape B.
    _transform: IMFTransform,
    force_keyframe: bool,
}

impl MediaFoundationEncoder {
    pub fn new(vendor: Vendor, _device: &ID3D11Device, config: EncoderConfig) -> Result<Self> {
        unsafe {
            // COM + Media Foundation. CoInitializeEx peut renvoyer S_FALSE si déjà
            // initialisé sur ce thread : ce n'est pas une erreur.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            MFStartup(mf_version(), MFSTARTUP_FULL).map_err(|e| anyhow!("MFStartup: {e}"))?;

            let (transform, name) = find_hardware_h264_encoder(vendor)?;

            Ok(Self {
                vendor,
                config,
                encoder_name: name,
                _transform: transform,
                force_keyframe: false,
            })
        }
    }

    /// Nom du MFT matériel sélectionné (diagnostic / preuve étape A).
    pub fn encoder_name(&self) -> &str {
        &self.encoder_name
    }

    /// Vendeur ciblé (diagnostic).
    pub fn vendor(&self) -> Vendor {
        self.vendor
    }

    /// Config courante (diagnostic).
    pub fn config(&self) -> &EncoderConfig {
        &self.config
    }
}

impl VideoEncoder for MediaFoundationEncoder {
    fn encode(&mut self, _texture: &ID3D11Texture2D, _timestamp_100ns: i64) -> Result<()> {
        // Étape B : créer un sample DXGI à partir de la texture, le pousser dans
        // le transform (ProcessInput). Non encore implémenté.
        Err(anyhow!("encode(): boucle d'encodage en étape B"))
    }

    fn drain(&mut self) -> Result<Vec<EncodedPacket>> {
        // Étape B : ProcessOutput → récupérer les NAL H264.
        Ok(Vec::new())
    }

    fn request_keyframe(&mut self) {
        self.force_keyframe = true;
    }
}

/// Numéro de version attendu par MFStartup (MF_VERSION).
fn mf_version() -> u32 {
    // MF_SDK_VERSION (0x0002) << 16 | MF_API_VERSION (0x0070).
    (0x0002 << 16) | 0x0070
}

/// Énumère les encodeurs H264 **matériels** et renvoie le transform + nom du
/// premier qui correspond au vendeur (ou le premier dispo si vendeur inconnu).
fn find_hardware_h264_encoder(vendor: Vendor) -> Result<(IMFTransform, String)> {
    unsafe {
        let output_type = MFT_REGISTER_TYPE_INFO {
            guidMajorType: MFMediaType_Video,
            guidSubtype: MFVideoFormat_H264,
        };

        // On veut : catégorie encodeur vidéo, matériel uniquement, trié/filtré.
        let mut activates: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count: u32 = 0;
        MFTEnumEx(
            MFT_CATEGORY_VIDEO_ENCODER,
            MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
            None,                 // pas de contrainte sur le type d'entrée
            Some(&output_type),   // sortie H264
            &mut activates,
            &mut count,
        )
        .map_err(|e| anyhow!("MFTEnumEx: {e}"))?;

        if count == 0 || activates.is_null() {
            return Err(anyhow!(
                "aucun encodeur H264 matériel trouvé (vendeur {vendor:?})"
            ));
        }

        // Le tableau renvoyé par MFTEnumEx doit être libéré par CoTaskMemFree, mais
        // chaque IMFActivate est compté par COM ; on collecte d'abord noms+activates.
        let slice = std::slice::from_raw_parts(activates, count as usize);

        let vendor_needle = match vendor {
            Vendor::Amd => Some("amd"),
            Vendor::Nvidia => Some("nvidia"),
            Vendor::Intel => Some("intel"),
            Vendor::Unknown => None,
        };

        let mut chosen: Option<(IMFTransform, String)> = None;
        let mut first: Option<(IMFTransform, String)> = None;

        for activate_opt in slice {
            let Some(activate) = activate_opt else { continue };

            let name = read_friendly_name(activate).unwrap_or_else(|| "MFT inconnu".to_string());

            // Active le MFT en IMFTransform.
            let transform: Result<IMFTransform, _> = activate.ActivateObject();
            let Ok(transform) = transform else { continue };

            let name_lc = name.to_lowercase();
            let matches_vendor = vendor_needle
                .map(|needle| name_lc.contains(needle))
                .unwrap_or(false);

            if matches_vendor && chosen.is_none() {
                chosen = Some((transform.clone(), name.clone()));
            }
            if first.is_none() {
                first = Some((transform, name));
            }
        }

        // Libère le tableau alloué par MFTEnumEx.
        windows::Win32::System::Com::CoTaskMemFree(Some(activates as *const _));

        chosen
            .or(first)
            .ok_or_else(|| anyhow!("encodeur H264 matériel inactivable (vendeur {vendor:?})"))
    }
}

/// Lit l'attribut "FriendlyName" d'un IMFActivate (nom humain du MFT).
unsafe fn read_friendly_name(activate: &IMFActivate) -> Option<String> {
    let mut pw: PWSTR = PWSTR::null();
    let mut len: u32 = 0;
    activate
        .GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut pw, &mut len)
        .ok()?;
    if pw.is_null() {
        return None;
    }
    let s = pw.to_string().ok();
    windows::Win32::System::Com::CoTaskMemFree(Some(pw.0 as *const _));
    s
}
