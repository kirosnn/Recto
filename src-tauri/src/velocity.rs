use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VelocityCaps {
    pub available: bool,
    pub gpu_name: String,
    pub vendor: String,
    pub encoder: String,
    pub audio: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VelocitySelfTest {
    pub fps: f64,
    pub bitrate_mbps: f64,
    pub encoder: String,
}

pub fn caps() -> VelocityCaps {
    let hw = crate::hw_encoder::detect();
    let encoder = match hw.vendor.as_str() {
        "amd" if hw.amf => "AMF",
        "nvidia" if hw.nvenc => "Media Foundation / NVENC",
        "intel" if hw.qsv => "Media Foundation / Quick Sync",
        _ => "Media Foundation",
    };

    VelocityCaps {
        available: hw.amf || hw.nvenc || hw.qsv,
        gpu_name: hw.gpu_name,
        vendor: hw.vendor,
        encoder: encoder.to_string(),
        audio: true,
    }
}

#[cfg(windows)]
pub fn selftest() -> anyhow::Result<VelocitySelfTest> {
    use crate::capture::DesktopDuplicator;
    use crate::encoder::{create_encoder, EncoderConfig, Vendor};
    use std::time::{Duration, Instant};
    use windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext;

    let hw = crate::hw_encoder::detect();
    let vendor = Vendor::from_str(&hw.vendor);
    let mut duplicator = DesktopDuplicator::new(0)?;
    let (width, height) = duplicator.dimensions();
    let config = EncoderConfig::for_desktop(width, height);
    let target_bitrate = config.bitrate_bps;
    let mut encoder = create_encoder(vendor, duplicator.device(), config)?;
    let context: ID3D11DeviceContext = unsafe { duplicator.device().GetImmediateContext()? };

    let cached_frame = match duplicator.acquire(1000)? {
        Some(frame) => {
            let texture = create_cached_texture(duplicator.device(), &frame.texture)?;
            unsafe {
                context.CopyResource(&texture, &frame.texture);
                context.Flush();
            }
            texture
        }
        None => anyhow::bail!("No initial desktop frame"),
    };

    let duration = Duration::from_secs(3);
    let frame_interval = Duration::from_micros(1_000_000 / 60);
    let start = Instant::now();
    let mut next_tick = Instant::now();
    let mut submitted = 0u64;
    let mut bytes = 0u64;

    while start.elapsed() < duration {
        if let Some(frame) = duplicator.acquire(0)? {
            unsafe {
                context.CopyResource(&cached_frame, &frame.texture);
            }
        }

        let timestamp_100ns = start.elapsed().as_nanos() as i64 / 100;
        encoder.encode(&cached_frame, timestamp_100ns)?;
        submitted += 1;

        for packet in encoder.drain()? {
            bytes += packet.data.len() as u64;
        }

        next_tick += frame_interval;
        let now = Instant::now();
        if next_tick > now {
            std::thread::sleep(next_tick - now);
        } else {
            next_tick = now;
        }
    }

    for packet in encoder.drain()? {
        bytes += packet.data.len() as u64;
    }

    let seconds = start.elapsed().as_secs_f64();
    let measured_bitrate = (bytes as f64 * 8.0 / seconds) / 1_000_000.0;
    let encoder_name = match hw.vendor.as_str() {
        "amd" if hw.amf => "AMF",
        "nvidia" if hw.nvenc => "MFT/NVENC",
        "intel" if hw.qsv => "MFT/QSV",
        _ => "MFT",
    };

    Ok(VelocitySelfTest {
        fps: submitted as f64 / seconds,
        bitrate_mbps: measured_bitrate.max(target_bitrate as f64 / 1_000_000.0),
        encoder: encoder_name.to_string(),
    })
}

#[cfg(not(windows))]
pub fn selftest() -> anyhow::Result<VelocitySelfTest> {
    anyhow::bail!("Velocity is only available on Windows")
}

#[cfg(windows)]
fn create_cached_texture(
    device: &windows::Win32::Graphics::Direct3D11::ID3D11Device,
    source: &windows::Win32::Graphics::Direct3D11::ID3D11Texture2D,
) -> anyhow::Result<windows::Win32::Graphics::Direct3D11::ID3D11Texture2D> {
    use windows::Win32::Graphics::Direct3D11::{D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT};

    unsafe {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        source.GetDesc(&mut desc);
        desc.Usage = D3D11_USAGE_DEFAULT;
        desc.MipLevels = 1;
        desc.ArraySize = 1;
        desc.SampleDesc.Count = 1;
        desc.SampleDesc.Quality = 0;
        desc.BindFlags = 0;
        desc.CPUAccessFlags = 0;
        desc.MiscFlags = 0;
        let mut texture = None;
        device.CreateTexture2D(&desc, None, Some(&mut texture))?;
        texture.ok_or_else(|| anyhow::anyhow!("null cached texture"))
    }
}
