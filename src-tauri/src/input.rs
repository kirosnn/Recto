use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InputEvent {
    MouseMove { x: f64, y: f64, width: f64, height: f64 },
    MouseMoveDelta { dx: i32, dy: i32 },
    MouseDown { button: u8 },
    MouseUp { button: u8 },
    MouseWheel { delta_x: f64, delta_y: f64 },
    KeyDown { code: String, modifiers: Modifiers },
    KeyUp { code: String, modifiers: Modifiers },
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Modifiers {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub meta: bool,
}

#[derive(Debug, Serialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub primary: bool,
}

#[cfg(windows)]
pub fn inject(event: InputEvent) -> anyhow::Result<()> {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;

    unsafe {
        match event {
            InputEvent::MouseMove { x, y, width, height } => {
                // Verso sends cursor position in shared-screen pixels (0..width, 0..height).
                // Recto shares its primary monitor, whose top-left is the virtual-desktop
                // origin (0,0). With MOUSEEVENTF_VIRTUALDESK the 0..65535 absolute range
                // spans the *entire* virtual desktop, so on a multi-monitor setup we must
                // map the shared-screen fraction onto the primary's rectangle within that
                // virtual space — otherwise the cursor lands on the wrong monitor.
                let (v_left, v_top, v_w, v_h, prim_w, prim_h) = virtual_and_primary();
                let fx = if width > 0.0 { x / width } else { 0.0 };
                let fy = if height > 0.0 { y / height } else { 0.0 };
                let px = fx * prim_w as f64; // primary origin is (0,0)
                let py = fy * prim_h as f64;
                let denom_x = (v_w - 1).max(1) as f64;
                let denom_y = (v_h - 1).max(1) as f64;
                let abs_x = (((px - v_left as f64) * 65535.0) / denom_x) as i32;
                let abs_y = (((py - v_top as f64) * 65535.0) / denom_y) as i32;
                let input = INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: abs_x,
                            dy: abs_y,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
            }
            InputEvent::MouseMoveDelta { dx, dy } => {
                let input = INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx,
                            dy,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_MOVE,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
            }
            InputEvent::MouseDown { button } => {
                let flag = match button {
                    0 => MOUSEEVENTF_LEFTDOWN,
                    1 => MOUSEEVENTF_MIDDLEDOWN,
                    2 => MOUSEEVENTF_RIGHTDOWN,
                    _ => return Ok(()),
                };
                let input = INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: 0,
                            dwFlags: flag,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
            }
            InputEvent::MouseUp { button } => {
                let flag = match button {
                    0 => MOUSEEVENTF_LEFTUP,
                    1 => MOUSEEVENTF_MIDDLEUP,
                    2 => MOUSEEVENTF_RIGHTUP,
                    _ => return Ok(()),
                };
                let input = INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: 0,
                            dwFlags: flag,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
            }
            InputEvent::MouseWheel { delta_x, delta_y } => {
                if delta_y != 0.0 {
                    let input = INPUT {
                        r#type: INPUT_MOUSE,
                        Anonymous: INPUT_0 {
                            mi: MOUSEINPUT {
                                dx: 0,
                                dy: 0,
                                mouseData: (-delta_y as i32) as u32,
                                dwFlags: MOUSEEVENTF_WHEEL,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    };
                    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                }
                if delta_x != 0.0 {
                    let input = INPUT {
                        r#type: INPUT_MOUSE,
                        Anonymous: INPUT_0 {
                            mi: MOUSEINPUT {
                                dx: 0,
                                dy: 0,
                                mouseData: (-delta_x as i32) as u32,
                                dwFlags: MOUSEEVENTF_HWHEEL,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    };
                    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                }
            }
            InputEvent::KeyDown { code, modifiers } => {
                let vk = key_code_to_vk(&code);
                if let Some(vk) = vk {
                    send_modifiers_down(&modifiers);
                    let input = INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: vk,
                                wScan: 0,
                                dwFlags: KEYBD_EVENT_FLAGS(0),
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    };
                    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                }
            }
            InputEvent::KeyUp { code, modifiers } => {
                let vk = key_code_to_vk(&code);
                if let Some(vk) = vk {
                    let input = INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: vk,
                                wScan: 0,
                                dwFlags: KEYEVENTF_KEYUP,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    };
                    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                    send_modifiers_up(&modifiers);
                }
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn send_modifiers_down(m: &Modifiers) {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    let mut keys: Vec<INPUT> = vec![];
    if m.ctrl  { keys.push(make_key(VK_CONTROL, false)); }
    if m.shift { keys.push(make_key(VK_SHIFT, false)); }
    if m.alt   { keys.push(make_key(VK_MENU, false)); }
    if m.meta  { keys.push(make_key(VK_LWIN, false)); }
    if !keys.is_empty() {
        SendInput(&keys, std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(windows)]
unsafe fn send_modifiers_up(m: &Modifiers) {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    let mut keys: Vec<INPUT> = vec![];
    if m.ctrl  { keys.push(make_key(VK_CONTROL, true)); }
    if m.shift { keys.push(make_key(VK_SHIFT, true)); }
    if m.alt   { keys.push(make_key(VK_MENU, true)); }
    if m.meta  { keys.push(make_key(VK_LWIN, true)); }
    if !keys.is_empty() {
        SendInput(&keys, std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(windows)]
fn make_key(vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY, up: bool) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(windows)]
fn key_code_to_vk(code: &str) -> Option<windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY> {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    Some(match code {
        "KeyA" => VK_A, "KeyB" => VK_B, "KeyC" => VK_C, "KeyD" => VK_D,
        "KeyE" => VK_E, "KeyF" => VK_F, "KeyG" => VK_G, "KeyH" => VK_H,
        "KeyI" => VK_I, "KeyJ" => VK_J, "KeyK" => VK_K, "KeyL" => VK_L,
        "KeyM" => VK_M, "KeyN" => VK_N, "KeyO" => VK_O, "KeyP" => VK_P,
        "KeyQ" => VK_Q, "KeyR" => VK_R, "KeyS" => VK_S, "KeyT" => VK_T,
        "KeyU" => VK_U, "KeyV" => VK_V, "KeyW" => VK_W, "KeyX" => VK_X,
        "KeyY" => VK_Y, "KeyZ" => VK_Z,
        "Digit0" => VK_0, "Digit1" => VK_1, "Digit2" => VK_2,
        "Digit3" => VK_3, "Digit4" => VK_4, "Digit5" => VK_5,
        "Digit6" => VK_6, "Digit7" => VK_7, "Digit8" => VK_8, "Digit9" => VK_9,
        "F1" => VK_F1, "F2" => VK_F2, "F3" => VK_F3, "F4" => VK_F4,
        "F5" => VK_F5, "F6" => VK_F6, "F7" => VK_F7, "F8" => VK_F8,
        "F9" => VK_F9, "F10" => VK_F10, "F11" => VK_F11, "F12" => VK_F12,
        "Enter" => VK_RETURN, "Space" => VK_SPACE, "Backspace" => VK_BACK,
        "Tab" => VK_TAB, "Escape" => VK_ESCAPE, "Delete" => VK_DELETE,
        "Insert" => VK_INSERT, "Home" => VK_HOME, "End" => VK_END,
        "PageUp" => VK_PRIOR, "PageDown" => VK_NEXT,
        "ArrowLeft" => VK_LEFT, "ArrowRight" => VK_RIGHT,
        "ArrowUp" => VK_UP, "ArrowDown" => VK_DOWN,
        "ShiftLeft" | "ShiftRight" => VK_SHIFT,
        "ControlLeft" | "ControlRight" => VK_CONTROL,
        "AltLeft" | "AltRight" => VK_MENU,
        "MetaLeft" | "MetaRight" => VK_LWIN,
        "CapsLock" => VK_CAPITAL,
        "Minus" => VK_OEM_MINUS, "Equal" => VK_OEM_PLUS,
        "BracketLeft" => VK_OEM_4, "BracketRight" => VK_OEM_6,
        "Backslash" => VK_OEM_5, "Semicolon" => VK_OEM_1,
        "Quote" => VK_OEM_7, "Comma" => VK_OEM_COMMA,
        "Period" => VK_OEM_PERIOD, "Slash" => VK_OEM_2,
        "Backquote" => VK_OEM_3,
        _ => return None,
    })
}

#[cfg(not(windows))]
pub fn inject(_event: InputEvent) -> anyhow::Result<()> {
    Ok(())
}

// Returns (virtual_left, virtual_top, virtual_width, virtual_height, primary_w, primary_h).
// The primary monitor's top-left is, by Windows definition, the virtual origin (0,0).
#[cfg(windows)]
fn virtual_and_primary() -> (i32, i32, i32, i32, i32, i32) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXSCREEN, SM_CXVIRTUALSCREEN, SM_CYSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };
    unsafe {
        let v_left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let v_top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let v_w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let v_h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        let prim_w = GetSystemMetrics(SM_CXSCREEN);
        let prim_h = GetSystemMetrics(SM_CYSCREEN);
        (v_left, v_top, v_w, v_h, prim_w, prim_h)
    }
}

pub fn get_displays() -> Vec<DisplayInfo> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{BOOL, LPARAM, RECT, TRUE};
        use windows::Win32::Graphics::Gdi::{
            EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
        };
        // MONITORINFOF_PRIMARY isn't re-exported in this windows-rs version; it's a
        // stable Win32 constant (0x1).
        const MONITORINFOF_PRIMARY: u32 = 1;

        unsafe extern "system" fn enum_proc(
            monitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            data: LPARAM,
        ) -> BOOL {
            let displays = &mut *(data.0 as *mut Vec<DisplayInfo>);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(monitor, &mut info).as_bool() {
                let r = info.rcMonitor;
                displays.push(DisplayInfo {
                    id: displays.len() as u32,
                    width: (r.right - r.left).max(0) as u32,
                    height: (r.bottom - r.top).max(0) as u32,
                    x: r.left,
                    y: r.top,
                    primary: (info.dwFlags & MONITORINFOF_PRIMARY) != 0,
                });
            }
            TRUE
        }

        let mut displays: Vec<DisplayInfo> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                HDC::default(),
                None,
                Some(enum_proc),
                LPARAM(&mut displays as *mut _ as isize),
            );
        }

        // Fallback to the primary screen if enumeration yields nothing.
        if displays.is_empty() {
            let (_, _, _, _, w, h) = virtual_and_primary();
            displays.push(DisplayInfo {
                id: 0,
                width: w as u32,
                height: h as u32,
                x: 0,
                y: 0,
                primary: true,
            });
        }
        displays
    }
    #[cfg(not(windows))]
    {
        vec![DisplayInfo { id: 0, width: 1920, height: 1080, x: 0, y: 0, primary: true }]
    }
}
