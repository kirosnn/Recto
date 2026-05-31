#[cfg(windows)]
fn main() {
    use amffi::{
        amf_init,
        components::video_encoder_vce::{
            AMFVideoEncoderProfile, AMFVideoEncoderQualityPreset, AMFVideoEncoderRateControlMethod,
            AMFVideoEncoderUsage, AMF_VIDEO_ENCODER_B_PIC_PATTERN, AMF_VIDEO_ENCODER_FRAMERATE,
            AMF_VIDEO_ENCODER_FRAMESIZE, AMF_VIDEO_ENCODER_LOWLATENCY_MODE,
            AMF_VIDEO_ENCODER_MAX_CONSECUTIVE_BPICTURES, AMF_VIDEO_ENCODER_PROFILE,
            AMF_VIDEO_ENCODER_QUALITY_PRESET, AMF_VIDEO_ENCODER_RATE_CONTROL_METHOD,
            AMF_VIDEO_ENCODER_TARGET_BITRATE, AMF_VIDEO_ENCODER_USAGE, AMF_VIDEO_ENCODER_VCE_AVC,
        },
        core::{
            buffer::AMFBuffer,
            context::AMFContext1,
            data::{AMFDXVersion, AMFMemoryType},
            interface::Interface,
            platform::{AMFRate, AMFSize},
            result::AMFError,
            surface::AMFSurfaceFormat,
        },
    };
    use std::{
        fs::File,
        io::Write,
        sync::{
            atomic::{AtomicBool, AtomicU64, Ordering},
            Arc,
        },
        time::{Duration, Instant},
    };

    const WIDTH: i32 = 1920;
    const HEIGHT: i32 = 1080;
    const FPS: u32 = 60;
    const FRAMES: u64 = 600;

    let library = amf_init().expect("AMF runtime");
    let version = library.query_version().expect("AMF version");
    let factory = library.init_factory(version).expect("AMF factory");
    let context = factory.create_context().expect("AMF context");
    let context1 = context.cast::<AMFContext1>().expect("AMFContext1");
    context1
        .init_dx11(None, AMFDXVersion::DX11_0)
        .expect("InitDX11");

    let encoder = factory
        .create_component(&context1, AMF_VIDEO_ENCODER_VCE_AVC)
        .expect("AMF H264 encoder");

    encoder
        .set_property(
            AMF_VIDEO_ENCODER_USAGE,
            AMFVideoEncoderUsage::UltraLowLatency as i64,
        )
        .ok();
    encoder
        .set_property(AMF_VIDEO_ENCODER_TARGET_BITRATE, 20_000_000i64)
        .expect("bitrate");
    encoder
        .set_property(AMF_VIDEO_ENCODER_FRAMESIZE, AMFSize::new(WIDTH, HEIGHT))
        .expect("frame size");
    encoder
        .set_property(AMF_VIDEO_ENCODER_FRAMERATE, AMFRate::new(FPS, 1))
        .expect("framerate");
    encoder
        .set_property(
            AMF_VIDEO_ENCODER_PROFILE,
            AMFVideoEncoderProfile::High as i64,
        )
        .ok();
    encoder
        .set_property(
            AMF_VIDEO_ENCODER_RATE_CONTROL_METHOD,
            AMFVideoEncoderRateControlMethod::Cbr as i64,
        )
        .ok();
    encoder
        .set_property(
            AMF_VIDEO_ENCODER_QUALITY_PRESET,
            AMFVideoEncoderQualityPreset::Speed as i64,
        )
        .ok();
    encoder
        .set_property(AMF_VIDEO_ENCODER_LOWLATENCY_MODE, true)
        .ok();
    encoder
        .set_property(AMF_VIDEO_ENCODER_B_PIC_PATTERN, 0i64)
        .ok();
    encoder
        .set_property(AMF_VIDEO_ENCODER_MAX_CONSECUTIVE_BPICTURES, 0i64)
        .ok();

    encoder
        .init(AMFSurfaceFormat::Nv12, WIDTH, HEIGHT)
        .expect("encoder init");

    let done = Arc::new(AtomicBool::new(false));
    let packets = Arc::new(AtomicU64::new(0));
    let bytes = Arc::new(AtomicU64::new(0));
    let done_out = done.clone();
    let packets_out = packets.clone();
    let bytes_out = bytes.clone();
    let encoder_out = encoder.clone();

    let output_thread = std::thread::spawn(move || {
        let mut file = File::create("amf_capture.h264").expect("amf_capture.h264");
        while !done_out.load(Ordering::Relaxed) {
            match encoder_out.query_output() {
                Ok(data) => {
                    let buffer: AMFBuffer = data.cast().expect("AMFBuffer");
                    let size = buffer.get_size() as usize;
                    let data = unsafe {
                        std::slice::from_raw_parts(buffer.get_native() as *const u8, size)
                    };
                    file.write_all(data).expect("write amf h264");
                    packets_out.fetch_add(1, Ordering::Relaxed);
                    bytes_out.fetch_add(size as u64, Ordering::Relaxed);
                }
                Err(AMFError::Repeat) | Err(AMFError::InputFull) => {
                    std::thread::sleep(Duration::from_micros(200));
                }
                Err(AMFError::Eof) => break,
                Err(e) => panic!("{e:?}"),
            }
        }
        while let Ok(data) = encoder_out.query_output() {
            let buffer: AMFBuffer = data.cast().expect("AMFBuffer");
            let size = buffer.get_size() as usize;
            let data =
                unsafe { std::slice::from_raw_parts(buffer.get_native() as *const u8, size) };
            file.write_all(data).expect("write amf h264");
            packets_out.fetch_add(1, Ordering::Relaxed);
            bytes_out.fetch_add(size as u64, Ordering::Relaxed);
        }
    });

    let start = Instant::now();
    let mut submitted = 0u64;
    let mut dropped = 0u64;
    let mut x = 0usize;

    while submitted < FRAMES {
        let surface = context
            .alloc_surface(AMFMemoryType::Host, AMFSurfaceFormat::Nv12, WIDTH, HEIGHT)
            .expect("surface");
        fill_nv12(&surface, x);
        x = (x + 7) % WIDTH as usize;

        match encoder.submit_input(&surface) {
            Ok(()) => submitted += 1,
            Err(AMFError::InputFull) => {
                dropped += 1;
                std::thread::sleep(Duration::from_micros(500));
            }
            Err(e) => panic!("{e:?}"),
        }
    }

    while encoder.drain().is_err() {
        std::thread::sleep(Duration::from_millis(1));
    }
    done.store(true, Ordering::Relaxed);
    output_thread.join().expect("output thread");
    encoder.terminate().ok();
    context.terminate().ok();

    let secs = start.elapsed().as_secs_f64();
    let packets = packets.load(Ordering::Relaxed);
    let bytes = bytes.load(Ordering::Relaxed);
    println!("[amf_probe] durée           : {secs:.1} s");
    println!(
        "[amf_probe] frames soumises : {submitted} ({:.1} fps)",
        submitted as f64 / secs
    );
    println!("[amf_probe] input full      : {dropped}");
    println!("[amf_probe] paquets H264    : {packets}");
    println!(
        "[amf_probe] bitrate         : {:.1} Mbps",
        (bytes as f64 * 8.0 / secs) / 1_000_000.0
    );
}

#[cfg(windows)]
fn fill_nv12(surface: &amffi::core::surface::AMFSurface, x: usize) {
    let y = surface.get_plane_at(0);
    let uv = surface.get_plane_at(1);
    unsafe {
        for row in 0..y.get_height() as usize {
            let line = (y.get_native() as *mut u8).add(row * y.get_h_pitch() as usize);
            line.write_bytes(96, y.get_width() as usize);
            let stripe = (x + row) % y.get_width() as usize;
            for col in stripe..(stripe + 80).min(y.get_width() as usize) {
                *line.add(col) = 210;
            }
        }
        for row in 0..uv.get_height() as usize {
            let line = (uv.get_native() as *mut u8).add(row * uv.get_h_pitch() as usize);
            for col in 0..uv.get_width() as usize {
                *line.add(col * 2) = 128;
                *line.add(col * 2 + 1) = 128;
            }
        }
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("amf_probe : Windows uniquement.");
}
