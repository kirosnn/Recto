#![cfg(windows)]

use anyhow::{anyhow, Context, Result};
use std::collections::VecDeque;
use std::time::Instant;

use amffi::{
    amf_init,
    components::video_encoder_vce::{
        AMFVideoEncoderProfile, AMFVideoEncoderQualityPreset, AMFVideoEncoderRateControlMethod,
        AMFVideoEncoderUsage, AMF_VIDEO_ENCODER_B_PIC_PATTERN, AMF_VIDEO_ENCODER_FRAMERATE,
        AMF_VIDEO_ENCODER_FRAMESIZE, AMF_VIDEO_ENCODER_INSERT_PPS, AMF_VIDEO_ENCODER_INSERT_SPS,
        AMF_VIDEO_ENCODER_HIGH_MOTION_QUALITY_BOOST_ENABLE, AMF_VIDEO_ENCODER_LOWLATENCY_MODE,
        AMF_VIDEO_ENCODER_MAX_CONSECUTIVE_BPICTURES, AMF_VIDEO_ENCODER_MAX_QP,
        AMF_VIDEO_ENCODER_PEAK_BITRATE, AMF_VIDEO_ENCODER_PROFILE, AMF_VIDEO_ENCODER_QUALITY_PRESET,
        AMF_VIDEO_ENCODER_RATE_CONTROL_METHOD, AMF_VIDEO_ENCODER_TARGET_BITRATE,
        AMF_VIDEO_ENCODER_USAGE, AMF_VIDEO_ENCODER_VBV_BUFFER_SIZE, AMF_VIDEO_ENCODER_VCE_AVC,
    },
    core::{
        buffer::AMFBuffer,
        context::AMFContext1,
        data::{AMFDXVersion, AMFMemoryType},
        interface::Interface,
        platform::{AMFRate, AMFSize},
        result::AMFError,
        surface::{AMFSurface, AMFSurfaceFormat},
    },
};
use windows::core::Interface as _;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D};

use super::color_convert::ColorConverter;
use super::{EncodedPacket, EncoderConfig, EncoderDiagnostics, VideoEncoder};

pub struct AmfDirectEncoder {
    context: AMFContext1,
    component: amffi::components::component::AMFComponent,
    converter: ColorConverter,
    d3d_context: ID3D11DeviceContext,
    pending_surfaces: VecDeque<AMFSurface>,
    output_packets: Vec<EncodedPacket>,
    dropped_frames: u64,
    diagnostics: EncoderDiagnostics,
    surface_index: usize,
}

impl AmfDirectEncoder {
    pub fn new(device: &ID3D11Device, config: EncoderConfig) -> Result<Self> {
        let library = amf_init().map_err(|e| anyhow!("AMF init: {e:?}"))?;
        let version = library
            .query_version()
            .map_err(|e| anyhow!("AMF query version: {e:?}"))?;
        let factory = library
            .init_factory(version)
            .map_err(|e| anyhow!("AMF factory: {e:?}"))?;
        let context = factory
            .create_context()
            .map_err(|e| anyhow!("AMF context: {e:?}"))?;
        let context = context
            .cast::<AMFContext1>()
            .map_err(|e| anyhow!("AMFContext1: {e:?}"))?;

        unsafe {
            context
                .init_dx11_raw(device.as_raw(), AMFDXVersion::DX11_0)
                .map_err(|e| anyhow!("AMF InitDX11: {e:?}"))?;
        }

        let component = factory
            .create_component(&context, AMF_VIDEO_ENCODER_VCE_AVC)
            .map_err(|e| anyhow!("AMF H264 component: {e:?}"))?;

        set_amf_properties(&component, &config)?;
        component
            .init(
                AMFSurfaceFormat::Nv12,
                config.width as i32,
                config.height as i32,
            )
            .map_err(|e| anyhow!("AMF encoder init: {e:?}"))?;

        let converter = ColorConverter::new(device, config.width, config.height)?;
        let d3d_context = unsafe { device.GetImmediateContext()? };

        Ok(Self {
            context,
            component,
            converter,
            d3d_context,
            pending_surfaces: VecDeque::new(),
            output_packets: Vec::new(),
            dropped_frames: 0,
            diagnostics: EncoderDiagnostics::default(),
            surface_index: 0,
        })
    }

    fn collect_output(&mut self) -> Result<()> {
        loop {
            match self.component.query_output() {
                Ok(data) => {
                    let buffer: AMFBuffer = data
                        .cast()
                        .map_err(|e| anyhow!("AMF output buffer: {e:?}"))?;
                    let size = buffer.get_size() as usize;
                    let data = unsafe {
                        std::slice::from_raw_parts(buffer.get_native() as *const u8, size).to_vec()
                    };
                    self.output_packets.push(EncodedPacket {
                        is_keyframe: contains_idr(&data),
                        timestamp_100ns: 0,
                        data,
                    });
                    let _ = self.pending_surfaces.pop_front();
                }
                Err(AMFError::Repeat) | Err(AMFError::InputFull) => break,
                Err(AMFError::Eof) => break,
                Err(e) => return Err(anyhow!("AMF query output: {e:?}")),
            }
        }
        Ok(())
    }
}

impl VideoEncoder for AmfDirectEncoder {
    fn encode(&mut self, texture: &ID3D11Texture2D, _timestamp_100ns: i64) -> Result<()> {
        self.collect_output()?;

        let convert_start = Instant::now();
        let surface_count = self.converter.surface_count();
        let (width, height) = self.converter.dimensions();
        let nv12 = self
            .converter
            .convert_into(texture, self.surface_index)
            .context("AMF BGRA to NV12 conversion")?;
        self.surface_index = (self.surface_index + 1) % surface_count;
        self.diagnostics.convert_ms += convert_start.elapsed().as_secs_f64() * 1000.0;

        let surface = self
            .context
            .alloc_surface(
                AMFMemoryType::DX11,
                AMFSurfaceFormat::Nv12,
                width as i32,
                height as i32,
            )
            .map_err(|e| anyhow!("AMF surface: {e:?}"))?;

        let plane = surface.get_plane_at(0);
        let native = plane.get_native();
        let dst = unsafe { ID3D11Texture2D::from_raw_borrowed(&native) }
            .ok_or_else(|| anyhow!("AMF DX11 surface native pointer is null"))?;

        unsafe {
            self.d3d_context.CopyResource(dst, nv12);
            self.d3d_context.Flush();
        }

        let input_start = Instant::now();
        match self.component.submit_input(&surface) {
            Ok(()) => {
                self.pending_surfaces.push_back(surface);
                self.diagnostics.process_input_ms += input_start.elapsed().as_secs_f64() * 1000.0;
                Ok(())
            }
            Err(AMFError::InputFull) => {
                self.dropped_frames += 1;
                Ok(())
            }
            Err(e) => Err(anyhow!("AMF submit input: {e:?}")),
        }
    }

    fn drain(&mut self) -> Result<Vec<EncodedPacket>> {
        let pump_start = Instant::now();
        self.collect_output()?;
        self.diagnostics.pump_ms += pump_start.elapsed().as_secs_f64() * 1000.0;
        Ok(std::mem::take(&mut self.output_packets))
    }

    fn request_keyframe(&mut self) {}

    fn dropped_frames(&self) -> u64 {
        self.dropped_frames
    }

    fn diagnostics(&self) -> EncoderDiagnostics {
        self.diagnostics
    }
}

impl Drop for AmfDirectEncoder {
    fn drop(&mut self) {
        let _ = self.component.drain();
        let _ = self.component.terminate();
        let _ = self.context.terminate();
    }
}

fn set_amf_properties(
    component: &amffi::components::component::AMFComponent,
    config: &EncoderConfig,
) -> Result<()> {
    component
        .set_property(
            AMF_VIDEO_ENCODER_USAGE,
            AMFVideoEncoderUsage::UltraLowLatency as i64,
        )
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_TARGET_BITRATE, config.bitrate_bps as i64)
        .map_err(|e| anyhow!("AMF bitrate: {e:?}"))?;
    component
        .set_property(
            AMF_VIDEO_ENCODER_PEAK_BITRATE,
            peak_bitrate(config.bitrate_bps) as i64,
        )
        .ok();
    component
        .set_property(
            AMF_VIDEO_ENCODER_VBV_BUFFER_SIZE,
            vbv_buffer_size(config.bitrate_bps) as i64,
        )
        .ok();
    component
        .set_property(
            AMF_VIDEO_ENCODER_FRAMESIZE,
            AMFSize::new(config.width as i32, config.height as i32),
        )
        .map_err(|e| anyhow!("AMF frame size: {e:?}"))?;
    component
        .set_property(
            AMF_VIDEO_ENCODER_FRAMERATE,
            AMFRate::new(config.framerate, 1),
        )
        .map_err(|e| anyhow!("AMF framerate: {e:?}"))?;
    component
        .set_property(
            AMF_VIDEO_ENCODER_PROFILE,
            AMFVideoEncoderProfile::High as i64,
        )
        .ok();
    component
        .set_property(
            AMF_VIDEO_ENCODER_RATE_CONTROL_METHOD,
            AMFVideoEncoderRateControlMethod::Cbr as i64,
        )
        .ok();
    component
        .set_property(
            AMF_VIDEO_ENCODER_QUALITY_PRESET,
            AMFVideoEncoderQualityPreset::Quality as i64,
        )
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_LOWLATENCY_MODE, true)
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_HIGH_MOTION_QUALITY_BOOST_ENABLE, true)
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_MAX_QP, 34i64)
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_B_PIC_PATTERN, 0i64)
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_MAX_CONSECUTIVE_BPICTURES, 0i64)
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_INSERT_SPS, true)
        .ok();
    component
        .set_property(AMF_VIDEO_ENCODER_INSERT_PPS, true)
        .ok();
    Ok(())
}

fn peak_bitrate(target_bitrate: u32) -> u32 {
    target_bitrate.saturating_mul(3) / 2
}

fn vbv_buffer_size(target_bitrate: u32) -> u32 {
    target_bitrate / 2
}

fn contains_idr(data: &[u8]) -> bool {
    let mut i = 0;
    while i + 4 < data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            if data[i + 3] & 0x1f == 5 {
                return true;
            }
            i += 3;
        } else if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1 {
            if data[i + 4] & 0x1f == 5 {
                return true;
            }
            i += 4;
        } else {
            i += 1;
        }
    }
    false
}
