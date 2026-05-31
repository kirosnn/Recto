#![cfg(windows)]

use anyhow::{anyhow, Result};
use opus_head_sys as opus;
use std::ffi::CStr;
use windows::core::HRESULT;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
    WAVEFORMATEX, WAVEFORMATEXTENSIBLE, WAVE_FORMAT_PCM,
};
use windows::Win32::Media::KernelStreaming::{KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE};
use windows::Win32::Media::Multimedia::{KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);
const OPUS_SAMPLE_RATE: u32 = 48_000;
const OPUS_CHANNELS: u8 = 2;

pub struct AudioPacket {
    pub timestamp_100ns: i64,
    pub data: Vec<u8>,
}

pub struct AudioConfig {
    pub bitrate_bps: u32,
    pub frame_samples: usize,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            bitrate_bps: 160_000,
            frame_samples: 480,
        }
    }
}

pub struct SystemAudioEncoder {
    capture: SystemAudioPcmCapture,
    encoder: OpusEncoder,
    pcm: Vec<f32>,
    frame_samples: usize,
    timestamp_100ns: i64,
}

impl SystemAudioEncoder {
    pub fn new(config: AudioConfig) -> Result<Self> {
        let capture = SystemAudioPcmCapture::new()?;
        let encoder = OpusEncoder::new(config.bitrate_bps)?;
        let frame_samples = config.frame_samples;

        Ok(Self {
            capture,
            encoder,
            pcm: Vec::with_capacity(frame_samples * OPUS_CHANNELS as usize * 4),
            frame_samples,
            timestamp_100ns: 0,
        })
    }

    pub fn input_sample_rate(&self) -> u32 {
        self.capture.input_sample_rate()
    }

    pub fn input_channels(&self) -> u16 {
        self.capture.input_channels()
    }

    pub fn poll_packets(&mut self) -> Result<Vec<AudioPacket>> {
        self.pcm.extend(self.capture.poll_samples()?);

        let frame_len = self.frame_samples * OPUS_CHANNELS as usize;
        let mut packets = Vec::new();
        while self.pcm.len() >= frame_len {
            let encoded = self
                .encoder
                .encode_f32(&self.pcm[..frame_len], self.frame_samples)?;
            self.pcm.drain(..frame_len);
            packets.push(AudioPacket {
                timestamp_100ns: self.timestamp_100ns,
                data: encoded,
            });
            self.timestamp_100ns +=
                (self.frame_samples as i64 * 10_000_000) / OPUS_SAMPLE_RATE as i64;
        }

        Ok(packets)
    }
}

pub struct SystemAudioPcmCapture {
    capture: WasapiLoopbackCapture,
    resampler: LinearResampler,
}

impl SystemAudioPcmCapture {
    pub fn new() -> Result<Self> {
        let capture = WasapiLoopbackCapture::new()?;
        let resampler = LinearResampler::new(capture.sample_rate(), OPUS_SAMPLE_RATE);
        Ok(Self { capture, resampler })
    }

    pub fn input_sample_rate(&self) -> u32 {
        self.capture.sample_rate()
    }

    pub fn input_channels(&self) -> u16 {
        self.capture.channels()
    }

    pub fn output_sample_rate(&self) -> u32 {
        OPUS_SAMPLE_RATE
    }

    pub fn output_channels(&self) -> u16 {
        OPUS_CHANNELS as u16
    }

    pub fn poll_samples(&mut self) -> Result<Vec<f32>> {
        let mut captured = Vec::new();
        let mut output = Vec::new();
        self.capture.read_available(&mut captured)?;
        self.resampler.push(&captured, &mut output);
        Ok(output)
    }
}

struct OpusEncoder {
    inner: *mut opus::OpusEncoder,
    output: Vec<u8>,
}

impl OpusEncoder {
    fn new(bitrate_bps: u32) -> Result<Self> {
        unsafe {
            let mut error = 0;
            let inner = opus::opus_encoder_create(
                OPUS_SAMPLE_RATE as i32,
                OPUS_CHANNELS as i32,
                opus::OPUS_APPLICATION_AUDIO as i32,
                &mut error,
            );
            if inner.is_null() || error < 0 {
                return Err(anyhow!("Opus encoder create: {}", opus_error(error)));
            }

            opus_ctl(inner, opus::OPUS_SET_BITRATE_REQUEST, bitrate_bps as i32)?;
            opus_ctl(inner, opus::OPUS_SET_COMPLEXITY_REQUEST, 8)?;
            opus_ctl(inner, opus::OPUS_SET_VBR_REQUEST, 1)?;
            opus_ctl(inner, opus::OPUS_SET_VBR_CONSTRAINT_REQUEST, 1)?;
            opus_ctl(
                inner,
                opus::OPUS_SET_SIGNAL_REQUEST,
                opus::OPUS_SIGNAL_MUSIC as i32,
            )?;

            Ok(Self {
                inner,
                output: vec![0; 4096],
            })
        }
    }

    fn encode_f32(&mut self, pcm: &[f32], frame_samples: usize) -> Result<Vec<u8>> {
        unsafe {
            let size = opus::opus_encode_float(
                self.inner,
                pcm.as_ptr(),
                frame_samples as i32,
                self.output.as_mut_ptr(),
                self.output.len() as i32,
            );
            if size < 0 {
                return Err(anyhow!("Opus encode: {}", opus_error(size as i32)));
            }
            Ok(self.output[..size as usize].to_vec())
        }
    }
}

impl Drop for OpusEncoder {
    fn drop(&mut self) {
        unsafe {
            opus::opus_encoder_destroy(self.inner);
        }
    }
}

unsafe fn opus_ctl(inner: *mut opus::OpusEncoder, request: u32, value: i32) -> Result<()> {
    let code = opus::opus_encoder_ctl(inner, request as i32, value);
    if code < 0 {
        Err(anyhow!("Opus ctl {request}: {}", opus_error(code)))
    } else {
        Ok(())
    }
}

fn opus_error(code: i32) -> String {
    unsafe {
        let ptr = opus::opus_strerror(code);
        if ptr.is_null() {
            return format!("code {code}");
        }
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }
}

struct WasapiLoopbackCapture {
    _com: ComApartment,
    client: IAudioClient,
    capture: IAudioCaptureClient,
    format: WasapiFormat,
}

impl WasapiLoopbackCapture {
    fn new() -> Result<Self> {
        let com = ComApartment::new()?;
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
            let mix_format_ptr = client.GetMixFormat()?;
            let format = WasapiFormat::from_ptr(mix_format_ptr)?;
            client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                100_000,
                0,
                mix_format_ptr,
                None,
            )?;
            CoTaskMemFree(Some(mix_format_ptr.cast()));
            let capture: IAudioCaptureClient = client.GetService()?;
            client.Start()?;

            Ok(Self {
                _com: com,
                client,
                capture,
                format,
            })
        }
    }

    fn sample_rate(&self) -> u32 {
        self.format.sample_rate
    }

    fn channels(&self) -> u16 {
        self.format.channels
    }

    fn read_available(&self, output: &mut Vec<f32>) -> Result<()> {
        unsafe {
            loop {
                let packet_frames = self.capture.GetNextPacketSize()?;
                if packet_frames == 0 {
                    break;
                }

                let mut data = std::ptr::null_mut();
                let mut frames = 0u32;
                let mut flags = 0u32;
                self.capture
                    .GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;

                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                    output.resize(output.len() + frames as usize * 2, 0.0);
                } else {
                    self.format.decode(data, frames, output)?;
                }

                self.capture.ReleaseBuffer(frames)?;
            }
        }
        Ok(())
    }
}

impl Drop for WasapiLoopbackCapture {
    fn drop(&mut self) {
        unsafe {
            let _ = self.client.Stop();
        }
    }
}

struct ComApartment {
    owns: bool,
}

impl ComApartment {
    fn new() -> Result<Self> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            if hr == RPC_E_CHANGED_MODE {
                Ok(Self { owns: false })
            } else {
                hr.ok()?;
                Ok(Self { owns: true })
            }
        }
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.owns {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[derive(Clone, Copy)]
enum SampleKind {
    F32,
    I16,
    I24,
    I32,
}

#[derive(Clone, Copy)]
struct WasapiFormat {
    sample_rate: u32,
    channels: u16,
    block_align: usize,
    kind: SampleKind,
}

impl WasapiFormat {
    unsafe fn from_ptr(ptr: *mut WAVEFORMATEX) -> Result<Self> {
        if ptr.is_null() {
            return Err(anyhow!("WASAPI mix format is null"));
        }

        let base = *ptr;
        let mut tag = base.wFormatTag as u32;
        let mut bits = base.wBitsPerSample;
        if tag == WAVE_FORMAT_EXTENSIBLE {
            let ext = *(ptr as *const WAVEFORMATEXTENSIBLE);
            let sub_format = ext.SubFormat;
            bits = ext.Samples.wValidBitsPerSample;
            tag = if sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
                WAVE_FORMAT_IEEE_FLOAT
            } else if sub_format == KSDATAFORMAT_SUBTYPE_PCM {
                WAVE_FORMAT_PCM
            } else {
                tag
            };
        }

        let kind = match (tag, bits) {
            (WAVE_FORMAT_IEEE_FLOAT, 32) => SampleKind::F32,
            (WAVE_FORMAT_PCM, 16) => SampleKind::I16,
            (WAVE_FORMAT_PCM, 24) => SampleKind::I24,
            (WAVE_FORMAT_PCM, 32) => SampleKind::I32,
            _ => return Err(anyhow!("unsupported WASAPI format tag={tag} bits={bits}")),
        };

        Ok(Self {
            sample_rate: base.nSamplesPerSec,
            channels: base.nChannels,
            block_align: base.nBlockAlign as usize,
            kind,
        })
    }

    unsafe fn decode(&self, data: *const u8, frames: u32, output: &mut Vec<f32>) -> Result<()> {
        if data.is_null() {
            return Err(anyhow!("WASAPI buffer is null"));
        }

        for frame in 0..frames as usize {
            let base = data.add(frame * self.block_align);
            let left = self.read_channel(base, 0);
            let right = if self.channels > 1 {
                self.read_channel(base, 1)
            } else {
                left
            };
            output.push(left);
            output.push(right);
        }

        Ok(())
    }

    unsafe fn read_channel(&self, frame: *const u8, channel: usize) -> f32 {
        match self.kind {
            SampleKind::F32 => {
                let ptr = frame.cast::<f32>().add(channel);
                std::ptr::read_unaligned(ptr)
            }
            SampleKind::I16 => {
                let ptr = frame.cast::<i16>().add(channel);
                i16::from_le(std::ptr::read_unaligned(ptr)) as f32 / i16::MAX as f32
            }
            SampleKind::I24 => {
                let ptr = frame.add(channel * 3);
                let b0 = *ptr as i32;
                let b1 = *ptr.add(1) as i32;
                let b2 = *ptr.add(2) as i32;
                let value = (b0 | (b1 << 8) | (b2 << 16) << 8) >> 8;
                value as f32 / 8_388_607.0
            }
            SampleKind::I32 => {
                let ptr = frame.cast::<i32>().add(channel);
                i32::from_le(std::ptr::read_unaligned(ptr)) as f32 / i32::MAX as f32
            }
        }
    }
}

struct LinearResampler {
    input_rate: u32,
    output_rate: u32,
    position: f64,
    pending: Vec<[f32; 2]>,
}

impl LinearResampler {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            input_rate,
            output_rate,
            position: 0.0,
            pending: Vec::new(),
        }
    }

    fn push(&mut self, input: &[f32], output: &mut Vec<f32>) {
        if self.input_rate == self.output_rate {
            output.extend_from_slice(input);
            return;
        }

        for frame in input.chunks_exact(2) {
            self.pending.push([frame[0], frame[1]]);
        }

        let step = self.input_rate as f64 / self.output_rate as f64;
        while self.position + 1.0 < self.pending.len() as f64 {
            let index = self.position.floor() as usize;
            let frac = (self.position - index as f64) as f32;
            let a = self.pending[index];
            let b = self.pending[index + 1];
            output.push(a[0] + (b[0] - a[0]) * frac);
            output.push(a[1] + (b[1] - a[1]) * frac);
            self.position += step;
        }

        let consumed = self.position.floor() as usize;
        if consumed > 0 {
            self.pending.drain(..consumed);
            self.position -= consumed as f64;
        }
    }
}
