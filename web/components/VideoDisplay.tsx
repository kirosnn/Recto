"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface VideoDisplayProps {
  stream: MediaStream | null;
  inputChannel: RTCDataChannel | null;
  hostWidth: number;
  hostHeight: number;
}

// Web Verso equivalent of the desktop VideoDisplay: captures mouse/keyboard on
// the streamed video and forwards them to Recto over the "input" DataChannel.
export default function VideoDisplay({
  stream,
  inputChannel,
  hostWidth,
  hostHeight,
}: VideoDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      (videoRef.current as HTMLVideoElement & { playoutDelayHint?: number }).playoutDelayHint = 0;
    }
  }, [stream]);

  useEffect(() => {
    containerRef.current?.focus();
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

  // Host pixels per CSS pixel, for pointer-lock relative movement
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

  const requestLock = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const promise = (el as Element & {
      requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void;
    }).requestPointerLock({ unadjustedMovement: true });
    if (promise instanceof Promise) {
      promise.catch(() => el.requestPointerLock());
    }
    el.focus();
  }, []);

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
      }}
      onClick={requestLock}
      onMouseMove={(e) => {
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
      onMouseDown={(e) => sendInput({ type: "mouseDown", button: e.button })}
      onMouseUp={(e) => sendInput({ type: "mouseUp", button: e.button })}
      onWheel={(e) =>
        sendInput({ type: "mouseWheel", deltaX: e.deltaX, deltaY: e.deltaY })
      }
      onKeyDown={(e) => {
        if (e.code === "Escape") return;
        e.preventDefault();
        sendInput({
          type: "keyDown",
          code: e.code,
          modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey },
        });
      }}
      onKeyUp={(e) => {
        if (e.code === "Escape") return;
        e.preventDefault();
        sendInput({
          type: "keyUp",
          code: e.code,
          modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey },
        });
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />

      {stream && !isLocked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Cliquer pour capturer la souris · Échap pour libérer
          </div>
        </div>
      )}
    </div>
  );
}
