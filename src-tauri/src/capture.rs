//! Capture d'écran native via DXGI **Desktop Duplication**.
//!
//! Pourquoi : `getDisplayMedia` dans WebView2 plafonne à ~20 fps (auto-throttling
//! Chromium qu'on ne peut pas contourner). Desktop Duplication est l'API que les
//! outils type Parsec/OBS utilisent : elle livre les frames du bureau directement
//! en **texture GPU D3D11**, à la cadence réelle de composition de Windows (jusqu'à
//! la fréquence de l'écran), avec en bonus les *dirty rects* (zones changées) pour
//! savoir quand l'image bouge réellement.
//!
//! Phase 1 (ce fichier) : capturer et mesurer le FPS réel. Le texture reste sur le
//! GPU — en phase 2 on la passera directement à l'encodeur matériel (zéro-copie).

#![cfg(windows)]

use anyhow::{anyhow, Result};
use windows::core::{Interface, HRESULT};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT;
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
    DXGI_OUTDUPL_DESC, DXGI_OUTDUPL_FRAME_INFO,
};

// Codes d'erreur DXGI/COM définis par leur valeur HRESULT brute : leur chemin
// d'import varie selon les versions du crate `windows`, mais les valeurs sont
// gravées dans l'ABI Windows et ne changent jamais.
const DXGI_ERROR_WAIT_TIMEOUT: HRESULT = HRESULT(0x887A0027u32 as i32);
const DXGI_ERROR_ACCESS_LOST: HRESULT = HRESULT(0x887A0026u32 as i32);
const E_ACCESSDENIED: HRESULT = HRESULT(0x80070005u32 as i32);

/// Une frame capturée. En phase 1 on n'expose que les métadonnées + la texture GPU.
/// La texture appartient au duplicator jusqu'au prochain `acquire`.
pub struct CapturedFrame {
    /// Texture GPU (BGRA) du bureau. Réutilisable directement par l'encodeur.
    pub texture: ID3D11Texture2D,
    /// Le bureau a-t-il réellement changé depuis la dernière frame ?
    /// (false = frame identique → l'encodeur peut sauter / faire du build-to-lossless)
    pub dirty: bool,
    /// Timestamp de présentation fourni par DXGI (QPC units).
    pub present_time: i64,
}

/// Duplicateur de bureau : encapsule le device D3D11 et la duplication d'une sortie.
pub struct DesktopDuplicator {
    device: ID3D11Device,
    _context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    desc: DXGI_OUTDUPL_DESC,
    holding_frame: bool,
}

impl DesktopDuplicator {
    /// Crée un duplicateur sur la sortie `output_index` de l'adaptateur primaire.
    pub fn new(output_index: u32) -> Result<Self> {
        unsafe {
            // 1. Device D3D11 matériel. BGRA_SUPPORT est requis pour Desktop Duplication.
            let feature_levels = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0];
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                None,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&feature_levels),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )?;
            let device = device.ok_or_else(|| anyhow!("D3D11CreateDevice a renvoyé un device nul"))?;
            let context = context.ok_or_else(|| anyhow!("D3D11CreateDevice a renvoyé un contexte nul"))?;

            // 2. Remonter device → DXGI device → adapter → output souhaité.
            let dxgi_device: IDXGIDevice = device.cast()?;
            let adapter: IDXGIAdapter = dxgi_device.GetAdapter()?;
            let output = adapter
                .EnumOutputs(output_index)
                .map_err(|e| anyhow!("sortie {output_index} introuvable: {e}"))?;
            let output1: IDXGIOutput1 = output.cast()?;

            // 3. Démarrer la duplication de cette sortie.
            let duplication: IDXGIOutputDuplication = output1
                .DuplicateOutput(&device)
                .map_err(|e| anyhow!("DuplicateOutput a échoué: {e}"))?;

            let desc = duplication.GetDesc();

            Ok(Self {
                device,
                _context: context,
                duplication,
                desc,
                holding_frame: false,
            })
        }
    }

    /// (largeur, hauteur) du bureau capturé.
    pub fn dimensions(&self) -> (u32, u32) {
        (self.desc.ModeDesc.Width, self.desc.ModeDesc.Height)
    }

    /// Format de pixel DXGI (typiquement DXGI_FORMAT_B8G8R8A8_UNORM).
    pub fn format(&self) -> DXGI_FORMAT {
        self.desc.ModeDesc.Format
    }

    /// Référence au device D3D11 (l'encodeur devra partager le même device en phase 2).
    pub fn device(&self) -> &ID3D11Device {
        &self.device
    }

    /// Tente d'acquérir la prochaine frame. `timeout_ms = 0` => non bloquant.
    ///
    /// Renvoie `Ok(None)` sur timeout (aucune nouvelle frame, le bureau n'a pas
    /// changé) — ce n'est PAS une erreur, c'est le signal "écran figé".
    pub fn acquire(&mut self, timeout_ms: u32) -> Result<Option<CapturedFrame>> {
        unsafe {
            // Toujours libérer la frame précédente avant d'en acquérir une nouvelle.
            if self.holding_frame {
                let _ = self.duplication.ReleaseFrame();
                self.holding_frame = false;
            }

            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut resource: Option<IDXGIResource> = None;

            match self
                .duplication
                .AcquireNextFrame(timeout_ms, &mut frame_info, &mut resource)
            {
                Ok(()) => {}
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => return Ok(None),
                Err(e) if e.code() == DXGI_ERROR_ACCESS_LOST => {
                    // Changement de mode/résolution, passage plein écran, UAC… :
                    // la duplication doit être recréée par l'appelant.
                    return Err(anyhow!("ACCESS_LOST: duplication à recréer"));
                }
                Err(e) if e.code() == E_ACCESSDENIED => {
                    return Err(anyhow!("ACCESS_DENIED: bureau sécurisé (UAC/verrou)"));
                }
                Err(e) => return Err(anyhow!("AcquireNextFrame: {e}")),
            }

            self.holding_frame = true;

            let resource = resource.ok_or_else(|| anyhow!("frame sans ressource"))?;
            let texture: ID3D11Texture2D = resource.cast()?;

            // LastPresentTime == 0 → seul le curseur a bougé, pas le contenu.
            let dirty = frame_info.LastPresentTime != 0;

            Ok(Some(CapturedFrame {
                texture,
                dirty,
                present_time: frame_info.LastPresentTime,
            }))
        }
    }
}

impl Drop for DesktopDuplicator {
    fn drop(&mut self) {
        if self.holding_frame {
            unsafe {
                let _ = self.duplication.ReleaseFrame();
            }
        }
    }
}
