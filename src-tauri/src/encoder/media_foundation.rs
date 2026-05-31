//! Encodeur H264 via **Media Foundation**, routé vers le MFT matériel du vendeur.
//!
//! Pipeline complet (étape B) :
//!   texture BGRA (capture) → [color_convert] → texture NV12 → IMFSample
//!     → ProcessInput → MFT matériel (AMDh264Encoder/NVENC/QSV) → ProcessOutput
//!     → NAL H264 (Annex-B)
//!
//! Le MFT matériel est typiquement **asynchrone** (MF_TRANSFORM_ASYNC). On le met
//! en mode "unlock async" et on pilote le flux d'événements
//! (METransformNeedInput / METransformHaveOutput) via son IMFMediaEventGenerator.

#![cfg(windows)]

use anyhow::{anyhow, Result};
use windows::core::{Interface, PWSTR};
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};
use windows::Win32::Media::MediaFoundation::{
    IMFActivate, IMFDXGIDeviceManager, IMFMediaEventGenerator, IMFMediaType, IMFSample,
    IMFTransform, MFCreateDXGISurfaceBuffer, MFCreateDXGIDeviceManager, MFCreateMediaType,
    MFCreateSample, MFMediaType_Video, MFStartup, MFTEnumEx, MFShutdown,
    MFT_CATEGORY_VIDEO_ENCODER, MFT_ENUM_FLAG_HARDWARE, MFT_ENUM_FLAG_SORTANDFILTER,
    MFT_FRIENDLY_NAME_Attribute, MFT_MESSAGE_COMMAND_FLUSH, MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,
    MFT_MESSAGE_NOTIFY_END_OF_STREAM, MFT_MESSAGE_NOTIFY_END_STREAMING,
    MFT_MESSAGE_NOTIFY_START_OF_STREAM, MFT_MESSAGE_SET_D3D_MANAGER,
    MFT_OUTPUT_DATA_BUFFER, MFT_REGISTER_TYPE_INFO,
    MFVideoFormat_H264, MFVideoFormat_NV12, MF_EVENT_TYPE, MF_E_TRANSFORM_NEED_MORE_INPUT,
    MF_E_TRANSFORM_STREAM_CHANGE, MF_LOW_LATENCY, MF_MT_AVG_BITRATE, MF_MT_FRAME_RATE,
    MF_MT_FRAME_SIZE, MF_MT_INTERLACE_MODE, MF_MT_MAJOR_TYPE, MF_MT_MPEG2_PROFILE,
    MF_MT_PIXEL_ASPECT_RATIO, MF_MT_SUBTYPE, MF_TRANSFORM_ASYNC_UNLOCK,
    MFSTARTUP_FULL, MFVideoInterlace_Progressive, METransformHaveOutput,
    METransformNeedInput, eAVEncH264VProfile_High,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::color_convert::ColorConverter;
use super::{EncodedPacket, EncoderConfig, Vendor, VideoEncoder};

/// Encodeur H264 matériel piloté via Media Foundation.
pub struct MediaFoundationEncoder {
    vendor: Vendor,
    config: EncoderConfig,
    encoder_name: String,
    transform: IMFTransform,
    event_gen: IMFMediaEventGenerator,
    converter: ColorConverter,
    /// Garde le device manager en vie (le MFT le référence pour l'accès D3D).
    _device_manager: IMFDXGIDeviceManager,
    force_keyframe: bool,
    streaming: bool,
}

impl MediaFoundationEncoder {
    pub fn new(vendor: Vendor, device: &ID3D11Device, config: EncoderConfig) -> Result<Self> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            MFStartup(mf_version(), MFSTARTUP_FULL).map_err(|e| anyhow!("MFStartup: {e}"))?;

            let (transform, encoder_name) = find_hardware_h264_encoder(vendor)?;

            // 1. Device manager DXGI : partage le device D3D11 (capture) avec le MFT
            //    pour que l'encodeur lise nos textures GPU sans copie CPU.
            let mut reset_token = 0u32;
            let mut device_manager: Option<IMFDXGIDeviceManager> = None;
            MFCreateDXGIDeviceManager(&mut reset_token, &mut device_manager)?;
            let device_manager =
                device_manager.ok_or_else(|| anyhow!("DXGIDeviceManager nul"))?;
            device_manager.ResetDevice(device, reset_token)?;

            // 2. Débloque le mode asynchrone (obligatoire pour les MFT HW).
            let attrs = transform.GetAttributes()?;
            attrs.SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)?;
            attrs.SetUINT32(&MF_LOW_LATENCY, config.low_latency as u32)?;

            // 3. Lie le device manager au MFT.
            transform.ProcessMessage(
                MFT_MESSAGE_SET_D3D_MANAGER,
                std::mem::transmute::<_, usize>(device_manager.as_raw()),
            )?;

            // 4. Types de média : sortie H264 d'abord (requis avant l'entrée), puis
            //    entrée NV12.
            set_output_type(&transform, &config)?;
            set_input_type(&transform, &config)?;

            // 5. Récupère le générateur d'événements (flux async).
            let event_gen: IMFMediaEventGenerator = transform.cast()?;

            // 6. Convertisseur couleur BGRA→NV12 (même device).
            let converter = ColorConverter::new(device, config.width, config.height)?;

            Ok(Self {
                vendor,
                config,
                encoder_name,
                transform,
                event_gen,
                converter,
                _device_manager: device_manager,
                force_keyframe: false,
                streaming: false,
            })
        }
    }

    pub fn encoder_name(&self) -> &str {
        &self.encoder_name
    }
    pub fn vendor(&self) -> Vendor {
        self.vendor
    }
    pub fn config(&self) -> &EncoderConfig {
        &self.config
    }

    /// Démarre le streaming la première fois.
    unsafe fn ensure_streaming(&mut self) -> Result<()> {
        if !self.streaming {
            self.transform
                .ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            self.transform
                .ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
            self.streaming = true;
        }
        Ok(())
    }
}

impl VideoEncoder for MediaFoundationEncoder {
    fn encode(&mut self, texture: &ID3D11Texture2D, timestamp_100ns: i64) -> Result<()> {
        unsafe {
            self.ensure_streaming()?;

            // Convertit BGRA → NV12 sur GPU.
            let nv12 = self.converter.convert(texture)?;

            // Enveloppe la texture NV12 dans un IMFSample (zéro-copie, surface DXGI).
            let buffer = MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, nv12, 0, false)?;
            let sample: IMFSample = MFCreateSample()?;
            sample.AddBuffer(&buffer)?;
            sample.SetSampleTime(timestamp_100ns)?;
            let frame_duration = 10_000_000i64 / self.config.framerate.max(1) as i64;
            sample.SetSampleDuration(frame_duration)?;

            // MFT async : attend l'event METransformNeedInput avant ProcessInput.
            let evt = self.event_gen.GetEvent(Default::default())?;
            let evt_type = MF_EVENT_TYPE(evt.GetType()? as i32);
            if evt_type == METransformNeedInput {
                self.transform.ProcessInput(0, &sample, 0)?;
            } else if evt_type == METransformHaveOutput {
                // L'encodeur a déjà une sortie en attente : on la laissera à drain().
                // On repousse quand même l'entrée pour ne pas la perdre.
                self.transform.ProcessInput(0, &sample, 0)?;
            }

            Ok(())
        }
    }

    fn drain(&mut self) -> Result<Vec<EncodedPacket>> {
        unsafe {
            let mut packets = Vec::new();

            // Récupère toutes les sorties disponibles sans bloquer. ProcessOutput
            // renvoie NEED_MORE_INPUT quand il n'y a plus rien à drainer.
            loop {
                let sample: IMFSample = MFCreateSample()?;
                // Pour un MFT HW H264, le MFT alloue souvent lui-même le buffer de
                // sortie (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES). On fournit un sample
                // vide ; s'il fournit le sien, le nôtre est ignoré.
                let mut out_buffers = [MFT_OUTPUT_DATA_BUFFER {
                    dwStreamID: 0,
                    pSample: std::mem::ManuallyDrop::new(Some(sample)),
                    dwStatus: 0,
                    pEvents: std::mem::ManuallyDrop::new(None),
                }];
                let mut status = 0u32;

                match self
                    .transform
                    .ProcessOutput(0, &mut out_buffers, &mut status)
                {
                    Ok(()) => {
                        let out_sample =
                            std::mem::ManuallyDrop::take(&mut out_buffers[0].pSample);
                        if let Some(out_sample) = out_sample {
                            if let Some(pkt) = read_sample(&out_sample)? {
                                packets.push(pkt);
                            }
                        }
                    }
                    Err(e) if e.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => break,
                    Err(e) if e.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                        // Renégociation du type de sortie ; on le re-set et on continue.
                        set_output_type(&self.transform, &self.config)?;
                    }
                    Err(e) => return Err(anyhow!("ProcessOutput: {e}")),
                }
            }

            Ok(packets)
        }
    }

    fn request_keyframe(&mut self) {
        self.force_keyframe = true;
    }
}

impl Drop for MediaFoundationEncoder {
    fn drop(&mut self) {
        unsafe {
            if self.streaming {
                let _ = self
                    .transform
                    .ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
                let _ = self
                    .transform
                    .ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
                let _ = self.transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0);
            }
            let _ = MFShutdown();
        }
    }
}

/// Copie les octets H264 d'un IMFSample vers un EncodedPacket.
unsafe fn read_sample(sample: &IMFSample) -> Result<Option<EncodedPacket>> {
    let buffer = sample.ConvertToContiguousBuffer()?;
    let mut ptr: *mut u8 = std::ptr::null_mut();
    let mut max_len = 0u32;
    let mut cur_len = 0u32;
    buffer.Lock(&mut ptr, Some(&mut max_len), Some(&mut cur_len))?;
    let data = std::slice::from_raw_parts(ptr, cur_len as usize).to_vec();
    buffer.Unlock()?;

    let timestamp_100ns = sample.GetSampleTime().unwrap_or(0);
    // Keyframe : un NAL de type 5 (IDR) présent dans le flux Annex-B.
    let is_keyframe = contains_idr(&data);

    if data.is_empty() {
        Ok(None)
    } else {
        Ok(Some(EncodedPacket {
            data,
            is_keyframe,
            timestamp_100ns,
        }))
    }
}

/// Détecte un NAL IDR (type 5) dans un flux Annex-B (start codes 00 00 01).
fn contains_idr(data: &[u8]) -> bool {
    let mut i = 0;
    while i + 4 < data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            let nal_type = data[i + 3] & 0x1f;
            if nal_type == 5 {
                return true;
            }
            i += 3;
        } else if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1 {
            let nal_type = data[i + 4] & 0x1f;
            if nal_type == 5 {
                return true;
            }
            i += 4;
        } else {
            i += 1;
        }
    }
    false
}

/// Type de sortie H264 : résolution, framerate, bitrate, profil High.
unsafe fn set_output_type(transform: &IMFTransform, config: &EncoderConfig) -> Result<()> {
    let mt: IMFMediaType = MFCreateMediaType()?;
    mt.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
    mt.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
    mt.SetUINT32(&MF_MT_AVG_BITRATE, config.bitrate_bps)?;
    mt.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
    mt.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)?;
    set_ratio(&mt, &MF_MT_FRAME_SIZE, config.width, config.height)?;
    set_ratio(&mt, &MF_MT_FRAME_RATE, config.framerate, 1)?;
    set_ratio(&mt, &MF_MT_PIXEL_ASPECT_RATIO, 1, 1)?;
    transform.SetOutputType(0, &mt, 0)?;
    Ok(())
}

/// Type d'entrée NV12.
unsafe fn set_input_type(transform: &IMFTransform, config: &EncoderConfig) -> Result<()> {
    let mt: IMFMediaType = MFCreateMediaType()?;
    mt.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
    mt.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12)?;
    mt.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
    set_ratio(&mt, &MF_MT_FRAME_SIZE, config.width, config.height)?;
    set_ratio(&mt, &MF_MT_FRAME_RATE, config.framerate, 1)?;
    set_ratio(&mt, &MF_MT_PIXEL_ASPECT_RATIO, 1, 1)?;
    transform.SetInputType(0, &mt, 0)?;
    Ok(())
}

/// Encode deux u32 (haut/bas) dans un attribut UINT64 (helper MF FRAME_SIZE/RATE).
unsafe fn set_ratio(
    mt: &IMFMediaType,
    key: &windows::core::GUID,
    high: u32,
    low: u32,
) -> Result<()> {
    let packed = ((high as u64) << 32) | (low as u64);
    mt.SetUINT64(key, packed)?;
    Ok(())
}

fn mf_version() -> u32 {
    (0x0002 << 16) | 0x0070
}

/// Énumère les encodeurs H264 matériels et active celui du vendeur.
fn find_hardware_h264_encoder(vendor: Vendor) -> Result<(IMFTransform, String)> {
    unsafe {
        let output_type = MFT_REGISTER_TYPE_INFO {
            guidMajorType: MFMediaType_Video,
            guidSubtype: MFVideoFormat_H264,
        };

        let mut activates: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count: u32 = 0;
        MFTEnumEx(
            MFT_CATEGORY_VIDEO_ENCODER,
            MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
            None,
            Some(&output_type),
            &mut activates,
            &mut count,
        )
        .map_err(|e| anyhow!("MFTEnumEx: {e}"))?;

        if count == 0 || activates.is_null() {
            return Err(anyhow!("aucun encodeur H264 matériel (vendeur {vendor:?})"));
        }

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

        windows::Win32::System::Com::CoTaskMemFree(Some(activates as *const _));

        chosen
            .or(first)
            .ok_or_else(|| anyhow!("encodeur H264 matériel inactivable (vendeur {vendor:?})"))
    }
}

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
