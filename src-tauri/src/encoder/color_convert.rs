//! Conversion couleur **BGRA → NV12** sur GPU via le Video Processor D3D11.
//!
//! La capture (Desktop Duplication) livre des textures **BGRA**. Les encodeurs
//! H264 matériels (AMD/NVIDIA/Intel) attendent du **NV12**. On fait la conversion
//! directement sur le GPU (ID3D11VideoProcessor) pour rester zéro-copie : aucun
//! aller-retour par le CPU. Le résultat est une texture NV12 que Media Foundation
//! enveloppera dans un IMFSample.

#![cfg(windows)]

use anyhow::{anyhow, Result};
use windows::core::Interface;
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, ID3D11VideoContext, ID3D11VideoContext1,
    ID3D11VideoDevice, ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator,
    ID3D11VideoProcessorInputView, ID3D11VideoProcessorOutputView, D3D11_BIND_RENDER_TARGET,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC, D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC,
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_STREAM,
    D3D11_VIDEO_USAGE_PLAYBACK_NORMAL, D3D11_VPIV_DIMENSION_TEXTURE2D,
    D3D11_VPOV_DIMENSION_TEXTURE2D,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_NV12, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};

/// Convertisseur BGRA→NV12 réutilisable (alloue la texture de sortie une fois).
pub struct ColorConverter {
    video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    /// Texture NV12 de destination, réutilisée à chaque frame.
    nv12: ID3D11Texture2D,
    width: u32,
    height: u32,
}

impl ColorConverter {
    pub fn new(device: &ID3D11Device, width: u32, height: u32) -> Result<Self> {
        unsafe {
            let video_device: ID3D11VideoDevice = device.cast()?;
            let context: ID3D11DeviceContext = device.GetImmediateContext()?;
            let video_context: ID3D11VideoContext = context.cast()?;

            // Description du flux : entrée et sortie à la même résolution/cadence.
            let content_desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
                InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
                InputFrameRate: DXGI_RATIONAL { Numerator: 60, Denominator: 1 },
                InputWidth: width,
                InputHeight: height,
                OutputFrameRate: DXGI_RATIONAL { Numerator: 60, Denominator: 1 },
                OutputWidth: width,
                OutputHeight: height,
                Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
            };

            let enumerator = video_device.CreateVideoProcessorEnumerator(&content_desc)?;
            let processor = video_device.CreateVideoProcessor(&enumerator, 0)?;

            // Espaces colorimétriques EXPLICITES. Sans ça, le VideoProcessor devine
            // et se trompe : le bureau est RGB **full-range** (0-255) tandis que le
            // H264 attend du YUV **studio-range** BT.709 (16-235). Le mismatch
            // donnait des couleurs délavées/assombries. On déclare donc :
            //   - entrée  : RGB full-range, primaires BT.709
            //   - sortie  : YCbCr studio-range, BT.709
            let video_context1: ID3D11VideoContext1 = video_context.cast()?;
            video_context1.VideoProcessorSetStreamColorSpace1(
                &processor,
                0,
                DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
            );
            video_context1.VideoProcessorSetOutputColorSpace1(
                &processor,
                DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
            );

            // Texture NV12 de sortie (BIND_RENDER_TARGET requis pour le VP).
            let nv12_desc = D3D11_TEXTURE2D_DESC {
                Width: width,
                Height: height,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_NV12,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut nv12: Option<ID3D11Texture2D> = None;
            device.CreateTexture2D(&nv12_desc, None, Some(&mut nv12))?;
            let nv12 = nv12.ok_or_else(|| anyhow!("création texture NV12 échouée"))?;

            Ok(Self {
                video_device,
                video_context,
                enumerator,
                processor,
                nv12,
                width,
                height,
            })
        }
    }

    /// Convertit une texture BGRA source vers la texture NV12 interne, et renvoie
    /// une référence à cette dernière (valide jusqu'au prochain appel).
    pub fn convert(&mut self, bgra: &ID3D11Texture2D) -> Result<&ID3D11Texture2D> {
        unsafe {
            // Vue d'entrée sur la texture BGRA.
            let in_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                FourCC: 0,
                ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                Anonymous: Default::default(), // Texture2D { MipSlice: 0, ArraySlice: 0 }
            };
            let mut input_view: Option<ID3D11VideoProcessorInputView> = None;
            self.video_device.CreateVideoProcessorInputView(
                bgra,
                &self.enumerator,
                &in_desc,
                Some(&mut input_view),
            )?;
            let input_view = input_view.ok_or_else(|| anyhow!("input view nulle"))?;

            // Vue de sortie sur la texture NV12.
            let out_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
                ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
                Anonymous: Default::default(),
            };
            let mut output_view: Option<ID3D11VideoProcessorOutputView> = None;
            self.video_device.CreateVideoProcessorOutputView(
                &self.nv12,
                &self.enumerator,
                &out_desc,
                Some(&mut output_view),
            )?;
            let output_view = output_view.ok_or_else(|| anyhow!("output view nulle"))?;

            // Blit/conversion : 1 stream, frame source = notre vue d'entrée.
            let stream = D3D11_VIDEO_PROCESSOR_STREAM {
                Enable: true.into(),
                OutputIndex: 0,
                InputFrameOrField: 0,
                PastFrames: 0,
                FutureFrames: 0,
                ppPastSurfaces: std::ptr::null_mut(),
                pInputSurface: std::mem::ManuallyDrop::new(Some(input_view.clone())),
                ppFutureSurfaces: std::ptr::null_mut(),
                ppPastSurfacesRight: std::ptr::null_mut(),
                pInputSurfaceRight: std::mem::ManuallyDrop::new(None),
                ppFutureSurfacesRight: std::ptr::null_mut(),
            };

            self.video_context.VideoProcessorBlt(
                &self.processor,
                &output_view,
                0,
                &[stream],
            )?;

            Ok(&self.nv12)
        }
    }

    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }
}

/// Format attendu en entrée du convertisseur (pour vérif/diagnostic).
pub const SOURCE_FORMAT: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT =
    DXGI_FORMAT_B8G8R8A8_UNORM;
