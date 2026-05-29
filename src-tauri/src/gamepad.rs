/// Virtual Xbox 360 controller via ViGEm Bus Driver.
/// Lazily connects on first update; silently no-ops if ViGEm is not installed.

#[cfg(windows)]
mod inner {
    use std::sync::{Mutex, OnceLock};
    use vigem_client::{Client, TargetId, Xbox360Wired, XGamepad};

    // Xbox360Wired<Client> holds a Windows HANDLE which is safe to use across
    // threads when protected by a Mutex, so we declare it Send.
    struct SafeCtrl(Xbox360Wired<Client>);
    unsafe impl Send for SafeCtrl {}

    static CTRL: OnceLock<Mutex<Option<SafeCtrl>>> = OnceLock::new();

    fn cell() -> &'static Mutex<Option<SafeCtrl>> {
        CTRL.get_or_init(|| Mutex::new(None))
    }

    fn try_connect() -> anyhow::Result<SafeCtrl> {
        let client = Client::connect()?;
        let mut target = Xbox360Wired::new(client, TargetId::XBOX360_WIRED);
        target.plugin()?;
        target.wait_ready()?;
        Ok(SafeCtrl(target))
    }

    pub fn update(report: XGamepad) -> anyhow::Result<()> {
        let mut guard = cell().lock().unwrap();
        if guard.is_none() {
            // Silently skip if ViGEm Bus is not installed on the host.
            *guard = try_connect().ok();
        }
        if let Some(ctrl) = guard.as_mut() {
            ctrl.0.update(&report)?;
        }
        Ok(())
    }

    pub fn disconnect() {
        if let Some(cell) = CTRL.get() {
            if let Ok(mut guard) = cell.lock() {
                *guard = None;
            }
        }
    }
}

#[cfg(windows)]
pub use inner::{disconnect, update};

#[cfg(not(windows))]
pub fn update(_: ()) -> anyhow::Result<()> {
    Ok(())
}
#[cfg(not(windows))]
pub fn disconnect() {}
