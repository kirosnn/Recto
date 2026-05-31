use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime};

use anyhow::{anyhow, Result};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_H264, MIME_TYPE_OPUS};
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::media::Sample;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_sample::TrackLocalStaticSample;
use webrtc::track::track_local::TrackLocal;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VelocityStartSettings {
    pub target_fps: u32,
    pub audio_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VelocityStartResult {
    pub offer: RTCSessionDescription,
}

struct VelocitySession {
    pc: Arc<RTCPeerConnection>,
    stop: Arc<AtomicBool>,
    settings: VelocityStartSettings,
    video_track: Arc<TrackLocalStaticSample>,
    audio_track: Option<Arc<TrackLocalStaticSample>>,
    input_channel: Arc<RTCDataChannel>,
    video_thread: Option<JoinHandle<()>>,
    audio_thread: Option<JoinHandle<()>>,
}

static SESSION: OnceLock<Mutex<Option<VelocitySession>>> = OnceLock::new();

pub async fn start(settings: VelocityStartSettings) -> Result<VelocityStartResult> {
    stop().await?;

    let mut media_engine = MediaEngine::default();
    media_engine.register_default_codecs()?;
    let registry = register_default_interceptors(
        webrtc::interceptor::registry::Registry::new(),
        &mut media_engine,
    )?;
    let api = APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build();

    let pc = Arc::new(
        api.new_peer_connection(RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_string()],
                ..Default::default()
            }],
            ..Default::default()
        })
        .await?,
    );

    let video_track = Arc::new(TrackLocalStaticSample::new(
        RTCRtpCodecCapability {
            mime_type: MIME_TYPE_H264.to_string(),
            clock_rate: 90_000,
            sdp_fmtp_line:
                "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64002a"
                    .to_string(),
            ..Default::default()
        },
        "video".to_string(),
        "velocity".to_string(),
    ));
    pc.add_track(Arc::clone(&video_track) as Arc<dyn TrackLocal + Send + Sync>)
        .await?;

    let audio_track = if settings.audio_enabled {
        let track = Arc::new(TrackLocalStaticSample::new(
            RTCRtpCodecCapability {
                mime_type: MIME_TYPE_OPUS.to_string(),
                clock_rate: 48_000,
                channels: 2,
                ..Default::default()
            },
            "audio".to_string(),
            "velocity".to_string(),
        ));
        pc.add_track(Arc::clone(&track) as Arc<dyn TrackLocal + Send + Sync>)
            .await?;
        Some(track)
    } else {
        None
    };

    let input_channel = pc.create_data_channel("input", None).await?;
    input_channel.on_message(Box::new(move |msg: DataChannelMessage| {
        Box::pin(async move {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&msg.data) {
                if matches!(
                    value.get("type").and_then(|v| v.as_str()),
                    Some("identity" | "displayInfo" | "hwCaps" | "clientSettings")
                ) {
                    return;
                }
                if let Ok(event) = serde_json::from_value(value) {
                    let _ = crate::input::inject(event);
                }
            }
        })
    }));

    let channel_for_open = Arc::clone(&input_channel);
    input_channel.on_open(Box::new(move || {
        Box::pin(async move {
            if let Some(primary) = crate::input::get_displays()
                .into_iter()
                .find(|display| display.primary)
            {
                let _ = channel_for_open
                    .send_text(
                        serde_json::json!({
                            "type": "displayInfo",
                            "width": primary.width,
                            "height": primary.height,
                        })
                        .to_string(),
                    )
                    .await;
            }
            let caps = crate::hw_encoder::detect();
            let _ = channel_for_open
                .send_text(
                    serde_json::json!({
                        "type": "hwCaps",
                        "gpuName": caps.gpu_name,
                        "vendor": caps.vendor,
                        "nvenc": caps.nvenc,
                        "amf": caps.amf,
                        "qsv": caps.qsv,
                    })
                    .to_string(),
                )
                .await;
        })
    }));

    let mut gather_complete = pc.gathering_complete_promise().await;
    let offer = pc.create_offer(None).await?;
    pc.set_local_description(offer).await?;
    let _ = gather_complete.recv().await;
    let offer = pc
        .local_description()
        .await
        .ok_or_else(|| anyhow!("Velocity offer was not generated"))?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let mut guard = state().lock().await;
    *guard = Some(VelocitySession {
        pc,
        stop: stop_flag,
        settings,
        video_track,
        audio_track,
        input_channel,
        video_thread: None,
        audio_thread: None,
    });

    Ok(VelocityStartResult { offer })
}

pub async fn accept_answer(answer: RTCSessionDescription) -> Result<()> {
    let mut guard = state().lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| anyhow!("Velocity session is not active"))?;
    session.pc.set_remote_description(answer).await?;
    if session.video_thread.is_none() {
        session.video_thread = Some(spawn_video_thread(
            Arc::clone(&session.video_track),
            Arc::clone(&session.stop),
            session.settings.target_fps,
            Arc::clone(&session.input_channel),
        ));
    }
    if session.settings.audio_enabled && session.audio_thread.is_none() {
        if let Some(track) = &session.audio_track {
            session.audio_thread = Some(spawn_audio_thread(
                Arc::clone(track),
                Arc::clone(&session.stop),
            ));
        }
    }
    Ok(())
}

pub async fn stop() -> Result<()> {
    let session = {
        let mut guard = state().lock().await;
        guard.take()
    };

    if let Some(mut session) = session {
        session.stop.store(true, Ordering::SeqCst);
        let _ = session.pc.close().await;
        if let Some(handle) = session.video_thread.take() {
            let _ = tokio::task::spawn_blocking(move || handle.join()).await;
        }
        if let Some(handle) = session.audio_thread.take() {
            let _ = tokio::task::spawn_blocking(move || handle.join()).await;
        }
    }

    Ok(())
}

fn state() -> &'static Mutex<Option<VelocitySession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

fn send_velocity_diag(
    handle: &tokio::runtime::Handle,
    channel: &Arc<RTCDataChannel>,
    event: &str,
    payload: serde_json::Value,
) {
    let _ = handle.block_on(channel.send_text(
        serde_json::json!({
            "type": "velocityDiag",
            "event": event,
            "payload": payload,
        })
        .to_string(),
    ));
}

fn spawn_video_thread(
    track: Arc<TrackLocalStaticSample>,
    stop: Arc<AtomicBool>,
    target_fps: u32,
    channel: Arc<RTCDataChannel>,
) -> JoinHandle<()> {
    let fps = target_fps.clamp(30, 60);
    let handle = tokio::runtime::Handle::current();
    std::thread::spawn(move || {
        let send_handle = handle.clone();
        if let Err(err) = run_video_loop(track, stop, fps, handle, Arc::clone(&channel)) {
            send_velocity_diag(
                &send_handle,
                &channel,
                "videoError",
                serde_json::json!({ "message": err.to_string() }),
            );
        }
    })
}

fn spawn_audio_thread(track: Arc<TrackLocalStaticSample>, stop: Arc<AtomicBool>) -> JoinHandle<()> {
    let handle = tokio::runtime::Handle::current();
    std::thread::spawn(move || {
        let _ = run_audio_loop(track, stop, handle);
    })
}

#[cfg(windows)]
fn run_video_loop(
    track: Arc<TrackLocalStaticSample>,
    stop: Arc<AtomicBool>,
    target_fps: u32,
    handle: tokio::runtime::Handle,
    channel: Arc<RTCDataChannel>,
) -> Result<()> {
    use crate::capture::DesktopDuplicator;
    use crate::encoder::{create_encoder, EncoderConfig, Vendor};

    let hw = crate::hw_encoder::detect();
    let vendor = Vendor::from_str(&hw.vendor);
    let output_index = crate::input::get_displays()
        .into_iter()
        .find(|display| display.primary)
        .map(|display| display.id)
        .unwrap_or(0);
    let mut capture = DesktopDuplicator::new(output_index)?;
    let (width, height) = capture.dimensions();
    let mut config = EncoderConfig::for_desktop(width, height);
    config.framerate = target_fps;
    let device = capture.device().clone();
    let context: ID3D11DeviceContext = unsafe { device.GetImmediateContext()? };
    let mut encoder = create_encoder(vendor, &device, config)?;
    let sequence_header = encoder.sequence_header().unwrap_or_default();
    let mut sequence_header_sent = sequence_header.is_empty();
    let mut cached_texture: Option<ID3D11Texture2D> = None;
    let frame_duration = Duration::from_secs_f64(1.0 / target_fps as f64);
    let mut next_frame = Instant::now();
    let started = Instant::now();
    let mut last_diag = Instant::now();
    let mut captured_frames = 0u64;
    let mut encoded_packets = 0u64;
    let mut write_errors = 0u64;

    send_velocity_diag(
        &handle,
        &channel,
        "videoStart",
        serde_json::json!({
            "outputIndex": output_index,
            "width": width,
            "height": height,
            "targetFps": target_fps,
            "headerBytes": sequence_header.len(),
        }),
    );

    while !stop.load(Ordering::SeqCst) {
        let now = Instant::now();
        if now < next_frame {
            std::thread::sleep(next_frame - now);
        }
        next_frame += frame_duration;

        let frame = match capture.acquire(1000) {
            Ok(Some(frame)) => frame,
            Ok(None) => continue,
            Err(_) => continue,
        };
        captured_frames += 1;

        if cached_texture.is_none() {
            cached_texture = Some(create_cached_texture(&device, width, height)?);
        }

        let texture = cached_texture
            .as_ref()
            .ok_or_else(|| anyhow!("missing cached texture"))?;
        unsafe {
            context.CopyResource(texture, &frame.texture);
        }

        let timestamp = (started.elapsed().as_secs_f64() * 10_000_000.0) as i64;
        encoder.encode(texture, timestamp)?;
        for packet in encoder.drain()? {
            let data = if !sequence_header_sent {
                sequence_header_sent = true;
                let mut data = sequence_header.clone();
                data.extend_from_slice(&packet.data);
                data
            } else {
                packet.data
            };
            let sample = Sample {
                data: Bytes::from(data),
                timestamp: SystemTime::now(),
                duration: frame_duration,
                ..Default::default()
            };
            if handle.block_on(track.write_sample(&sample)).is_err() {
                write_errors += 1;
            } else {
                encoded_packets += 1;
            }
        }

        if last_diag.elapsed() >= Duration::from_secs(1) {
            send_velocity_diag(
                &handle,
                &channel,
                "videoStats",
                serde_json::json!({
                    "capturedFrames": captured_frames,
                    "encodedPackets": encoded_packets,
                    "writeErrors": write_errors,
                    "elapsedMs": started.elapsed().as_millis(),
                }),
            );
            last_diag = Instant::now();
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn run_video_loop(
    _track: Arc<TrackLocalStaticSample>,
    _stop: Arc<AtomicBool>,
    _target_fps: u32,
    _handle: tokio::runtime::Handle,
    _channel: Arc<RTCDataChannel>,
) -> Result<()> {
    Err(anyhow!("Velocity is only available on Windows"))
}

#[cfg(windows)]
fn run_audio_loop(
    track: Arc<TrackLocalStaticSample>,
    stop: Arc<AtomicBool>,
    handle: tokio::runtime::Handle,
) -> Result<()> {
    let mut audio = crate::audio::SystemAudioEncoder::new(crate::audio::AudioConfig::default())?;
    let duration = Duration::from_millis(20);

    while !stop.load(Ordering::SeqCst) {
        for packet in audio.poll_packets()? {
            let sample = Sample {
                data: Bytes::from(packet.data),
                timestamp: SystemTime::now(),
                duration,
                ..Default::default()
            };
            let _ = handle.block_on(track.write_sample(&sample));
        }
        std::thread::sleep(Duration::from_millis(4));
    }

    Ok(())
}

#[cfg(not(windows))]
fn run_audio_loop(
    _track: Arc<TrackLocalStaticSample>,
    _stop: Arc<AtomicBool>,
    _handle: tokio::runtime::Handle,
) -> Result<()> {
    Err(anyhow!("Velocity audio is only available on Windows"))
}

#[cfg(windows)]
fn create_cached_texture(
    device: &ID3D11Device,
    width: u32,
    height: u32,
) -> Result<ID3D11Texture2D> {
    unsafe {
        let desc = windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: windows::Win32::Graphics::Direct3D11::D3D11_USAGE_DEFAULT,
            BindFlags: windows::Win32::Graphics::Direct3D11::D3D11_BIND_SHADER_RESOURCE.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut texture = None;
        device.CreateTexture2D(&desc, None, Some(&mut texture))?;
        texture.ok_or_else(|| anyhow!("null cached texture"))
    }
}
