"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface VideoDisplayProps {
  stream: MediaStream | null;
  inputChannel: RTCDataChannel | null;
  hostWidth: number;
  hostHeight: number;
  hideUI: boolean;
  onToggleUI: () => void;
}

// Derive a host-side key `code` (e.g. "KeyA") from a keyboard event. Hardware
// keyboards provide e.code directly; mobile soft keyboards often leave it empty
// and only give e.key, so we reconstruct the common cases.
function deriveKey(e: { code: string; key: string }): { code: string; shift: boolean } | null {
  if (e.code && e.code !== "Unidentified") return { code: e.code, shift: false };
  const k = e.key;
  if (!k || k === "Unidentified") return null;
  if (k.length === 1) {
    if (/[a-z]/.test(k)) return { code: "Key" + k.toUpperCase(), shift: false };
    if (/[A-Z]/.test(k)) return { code: "Key" + k, shift: true };
    if (/[0-9]/.test(k)) return { code: "Digit" + k, shift: false };
    if (k === " ") return { code: "Space", shift: false };
  }
  switch (k) {
    case "Enter": return { code: "Enter", shift: false };
    case "Backspace": return { code: "Backspace", shift: false };
    case "Tab": return { code: "Tab", shift: false };
    case "ArrowLeft": return { code: "ArrowLeft", shift: false };
    case "ArrowRight": return { code: "ArrowRight", shift: false };
    case "ArrowUp": return { code: "ArrowUp", shift: false };
    case "ArrowDown": return { code: "ArrowDown", shift: false };
    default: return null;
  }
}

// Web Verso equivalent of the desktop VideoDisplay: forwards mouse/keyboard (and
// touch, on phones) to Recto over the "input" DataChannel.
export default function VideoDisplay({
  stream,
  inputChannel,
  hostWidth,
  hostHeight,
  hideUI,
  onToggleUI,
}: VideoDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const kbRef = useRef<HTMLInputElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [kbActive, setKbActive] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      (videoRef.current as HTMLVideoElement & { playoutDelayHint?: number }).playoutDelayHint = 0;
    }
  }, [stream]);

  useEffect(() => {
    containerRef.current?.focus();
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const onLockChange = () => {
      setIsLocked(document.pointerLockElement === containerRef.current);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, []);

  const sendInput = useCallback(
    (event: object) => {
      if (inputChannel?.readyState === "open") {
        inputChannel.send(JSON.stringify(event));
      }
    },
    [inputChannel]
  );

  // Host pixels per CSS pixel, for relative (pointer-lock / trackpad) movement
  const getVideoScale = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return 1;
    const rect = container.getBoundingClientRect();
    const vw = video.videoWidth || hostWidth;
    const vh = video.videoHeight || hostHeight;
    const displayW =
      rect.width / rect.height > vw / vh ? rect.height * (vw / vh) : rect.width;
    return vw / displayW;
  }, [hostWidth, hostHeight]);

  // Map cursor position to host-space coords, accounting for letterbox offset
  const getAbsolutePos = useCallback(
    (e: React.MouseEvent) => {
      const video = videoRef.current!;
      const container = containerRef.current!;
      const rect = container.getBoundingClientRect();
      const vw = video.videoWidth || hostWidth;
      const vh = video.videoHeight || hostHeight;
      const containerAspect = rect.width / rect.height;
      const videoAspect = vw / vh;

      let displayW: number, displayH: number, offsetX: number, offsetY: number;
      if (containerAspect > videoAspect) {
        displayH = rect.height;
        displayW = rect.height * videoAspect;
        offsetX = (rect.width - displayW) / 2;
        offsetY = 0;
      } else {
        displayW = rect.width;
        displayH = rect.width / videoAspect;
        offsetX = 0;
        offsetY = (rect.height - displayH) / 2;
      }

      return {
        x: ((e.clientX - rect.left - offsetX) / displayW) * vw,
        y: ((e.clientY - rect.top - offsetY) / displayH) * vh,
        width: vw,
        height: vh,
      };
    },
    [hostWidth, hostHeight]
  );

  // Best-effort fullscreen on the user's first interaction with the video — a
  // reliable gesture fallback in case the request at connect time was ignored.
  const ensureFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const requestLock = useCallback(() => {
    ensureFullscreen();
    if (isTouch) return; // no pointer lock on touch devices
    const el = containerRef.current;
    if (!el) return;
    const promise = (el as Element & {
      requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void;
    }).requestPointerLock({ unadjustedMovement: true });
    if (promise instanceof Promise) {
      promise.catch(() => el.requestPointerLock());
    }
    el.focus();
  }, [isTouch, ensureFullscreen]);

  // Touch trackpad: drag = relative cursor move, tap = left click, two-finger
  // tap = right click, two-finger drag = scroll. Native non-passive listeners so
  // preventDefault can suppress page scroll / synthesized mouse events.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const TAP_MS = 300;
    const MOVE_THRESH = 8;
    const g = {
      active: false, maxTouches: 0, moved: false,
      startTime: 0, lastX: 0, lastY: 0, lastMidY: 0,
    };

    const isControl = (t: EventTarget | null) =>
      t instanceof HTMLElement && t.closest("[data-control]") !== null;

    const onStart = (e: TouchEvent) => {
      if (isControl(e.target)) return; // let on-screen buttons work
      e.preventDefault();
      ensureFullscreen(); // first touch is a valid gesture for fullscreen
      const n = e.touches.length;
      if (!g.active) {
        g.active = true; g.maxTouches = n; g.moved = false; g.startTime = Date.now();
      } else {
        g.maxTouches = Math.max(g.maxTouches, n);
      }
      g.lastX = e.touches[0].clientX;
      g.lastY = e.touches[0].clientY;
      if (n >= 2) g.lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    };

    const onMove = (e: TouchEvent) => {
      if (isControl(e.target) || !g.active) return;
      e.preventDefault();
      const scale = getVideoScale();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - g.lastX;
        const dy = t.clientY - g.lastY;
        if (Math.abs(dx) > MOVE_THRESH || Math.abs(dy) > MOVE_THRESH) g.moved = true;
        if (dx || dy) {
          sendInput({ type: "mouseMoveDelta", dx: Math.round(dx * scale), dy: Math.round(dy * scale) });
        }
        g.lastX = t.clientX;
        g.lastY = t.clientY;
      } else if (e.touches.length >= 2) {
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const ddy = midY - g.lastMidY;
        if (Math.abs(ddy) > 1) {
          g.moved = true;
          sendInput({ type: "mouseWheel", deltaX: 0, deltaY: Math.round(-ddy * 2) });
        }
        g.lastMidY = midY;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!g.active) return;
      e.preventDefault();
      if (e.touches.length > 0) {
        // A finger lifted but others remain: re-anchor to avoid a jump
        g.lastX = e.touches[0].clientX;
        g.lastY = e.touches[0].clientY;
        return;
      }
      const dur = Date.now() - g.startTime;
      if (!g.moved && dur < TAP_MS) {
        const btn = g.maxTouches >= 2 ? 2 : 0;
        sendInput({ type: "mouseDown", button: btn });
        sendInput({ type: "mouseUp", button: btn });
      }
      g.active = false;
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [getVideoScale, sendInput, ensureFullscreen]);

  // Forward a key event (from the container or the hidden mobile input)
  const forwardKey = useCallback(
    (e: React.KeyboardEvent, down: boolean) => {
      if (e.code === "Escape") return;
      if (e.ctrlKey && e.altKey && e.code === "KeyH") {
        e.preventDefault();
        if (down) onToggleUI();
        return;
      }
      const derived = deriveKey(e);
      if (!derived) return;
      e.preventDefault();
      sendInput({
        type: down ? "keyDown" : "keyUp",
        code: derived.code,
        modifiers: {
          ctrl: e.ctrlKey,
          shift: e.shiftKey || derived.shift,
          alt: e.altKey,
          meta: e.metaKey,
        },
      });
    },
    [sendInput, onToggleUI]
  );

  const btnStyle: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    background: "rgba(17,17,17,0.82)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f1e8",
    fontSize: "0.9rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#000",
        cursor: isLocked ? "none" : "default",
        outline: "none",
        touchAction: "none",
      }}
      onClick={requestLock}
      onMouseMove={(e) => {
        if (isTouch) return;
        if (isLocked) {
          const scale = getVideoScale();
          sendInput({
            type: "mouseMoveDelta",
            dx: Math.round(e.movementX * scale),
            dy: Math.round(e.movementY * scale),
          });
        } else {
          sendInput({ type: "mouseMove", ...getAbsolutePos(e) });
        }
      }}
      onMouseDown={(e) => { if (!isTouch) sendInput({ type: "mouseDown", button: e.button }); }}
      onMouseUp={(e) => { if (!isTouch) sendInput({ type: "mouseUp", button: e.button }); }}
      onWheel={(e) =>
        sendInput({ type: "mouseWheel", deltaX: e.deltaX, deltaY: e.deltaY })
      }
      onKeyDown={(e) => forwardKey(e, true)}
      onKeyUp={(e) => forwardKey(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />

      {/* Hidden input: focusing it opens the phone's soft keyboard */}
      <input
        ref={kbRef}
        aria-hidden
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(e) => forwardKey(e, true)}
        onKeyUp={(e) => forwardKey(e, false)}
        onInput={(e) => { e.currentTarget.value = ""; }}
        onBlur={() => setKbActive(false)}
        style={{
          position: "absolute", top: 0, left: 0,
          width: 1, height: 1, opacity: 0, padding: 0, border: 0,
          pointerEvents: "none",
        }}
      />

      {stream && !isLocked && !hideUI && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "20vh",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              borderRadius: 8,
              padding: "9px 18px",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.8rem",
              textAlign: "center",
              maxWidth: "90vw",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {isTouch
              ? "Glisser = souris · tap = clic · 2 doigts = clic droit / défiler"
              : "Cliquer pour capturer la souris · Échap pour libérer · Ctrl+Alt+H pour masquer"}
          </div>
        </div>
      )}

      {/* On-screen controls for touch devices */}
      {isTouch && !hideUI && (
        <div
          data-control
          style={{
            position: "absolute",
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 10,
            zIndex: 10,
          }}
        >
          <button
            data-control
            style={btnStyle}
            onClick={() => {
              sendInput({ type: "mouseDown", button: 2 });
              sendInput({ type: "mouseUp", button: 2 });
            }}
          >
            Clic droit
          </button>
          <button
            data-control
            style={{ ...btnStyle, background: kbActive ? "rgba(217,119,87,0.9)" : btnStyle.background }}
            onClick={() => {
              kbRef.current?.focus();
              setKbActive(true);
            }}
          >
            ⌨ Clavier
          </button>
        </div>
      )}
    </div>
  );
}
