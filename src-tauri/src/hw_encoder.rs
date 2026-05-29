use serde::Serialize;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HwEncoderCaps {
    pub gpu_name: String,
    pub vendor: String, // "nvidia" | "amd" | "intel" | "unknown"
    pub nvenc: bool,
    pub amf: bool,
    pub qsv: bool,
}

pub fn detect() -> HwEncoderCaps {
    #[cfg(windows)]
    {
        let gpu_name = get_primary_gpu_name();
        let vendor = detect_vendor(&gpu_name);
        let nvenc = vendor == "nvidia" && has_dll("nvEncodeAPI64.dll");
        let amf = vendor == "amd"
            && (has_dll("amdvce64.dll") || has_dll("amdenc64.dll") || has_dll("amfrt64.dll"));
        let qsv = vendor == "intel";
        HwEncoderCaps { gpu_name, vendor, nvenc, amf, qsv }
    }
    #[cfg(not(windows))]
    HwEncoderCaps::default()
}

#[cfg(windows)]
fn get_primary_gpu_name() -> String {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};
    unsafe {
        let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else {
            return "Unknown".to_string();
        };
        let mut first: Option<String> = None;
        let mut idx = 0u32;
        while let Ok(adapter) = factory.EnumAdapters1(idx) {
            if let Ok(desc) = adapter.GetDesc1() {
                let end = desc.Description.iter().position(|&x| x == 0).unwrap_or(128);
                let name = String::from_utf16_lossy(&desc.Description[..end]);
                if first.is_none() { first = Some(name.clone()); }
                // Skip Microsoft Basic Render Driver (software fallback)
                if !name.contains("Basic Render") && !name.contains("Microsoft Basic") {
                    return name;
                }
            }
            idx += 1;
        }
        first.unwrap_or_else(|| "Unknown".to_string())
    }
}

fn detect_vendor(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("nvidia") || n.contains("geforce") || n.contains("rtx") || n.contains("gtx") || n.contains("quadro") {
        "nvidia".to_string()
    } else if n.contains("amd") || n.contains("radeon") || n.contains("rx ") {
        "amd".to_string()
    } else if n.contains("intel") || n.contains("arc") || n.contains("iris") || n.contains("uhd") {
        "intel".to_string()
    } else {
        "unknown".to_string()
    }
}

#[cfg(windows)]
fn has_dll(name: &str) -> bool {
    let sys = std::env::var("SystemRoot").unwrap_or("C:\\Windows".into());
    std::path::Path::new(&format!("{}\\System32\\{}", sys, name)).exists()
}
