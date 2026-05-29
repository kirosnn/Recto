import { useEffect, useRef, useCallback, useState } from "react";

interface VideoDisplayProps {
  stream: MediaStream | null;
  inputChannel: RTCDataChannel | null;
  hostWidth: number;
  hostHeight: number;
}

export default function VideoDisplay({ stream, inputChannel, hostWidth, hostHeight }: VideoDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
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

  // Returns scale factor: host pixels per CSS pixel (for pointer lock relative movement)
  const getVideoScale = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return 1;
    const rect = container.getBoundingClientRect();
    const vw = video.videoWidth || hostWidth;
    const vh = video.videoHeight || hostHeight;
    const displayW =
      rect.width / rect.height > vw / vh
        ? rect.height * (vw / vh)
        : rect.width;
    return vw / displayW;
  }, [hostWidth, hostHeight]);

  // Returns host-space absolute coordinates, accounting for letterbox offset
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

  const handleClick = useCallback(() => {
    if (!isLocked) containerRef.current?.requestPointerLock();
    containerRef.current?.focus();
  }, [isLocked]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black"
      style={{ cursor: isLocked ? "none" : "default", outline: "none" }}
      tabIndex={0}
      onClick={handleClick}
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
        // Let browser handle Escape to exit pointer lock naturally
        if (e.code === "Escape") return;
        e.preventDefault();
        sendInput({
          type: "keyDown",
          code: e.code,
          modifiers: {
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            meta: e.metaKey,
          },
        });
      }}
      onKeyUp={(e) => {
        if (e.code === "Escape") return;
        e.preventDefault();
        sendInput({
          type: "keyUp",
          code: e.code,
          modifiers: {
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            meta: e.metaKey,
          },
        });
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="w-full h-full object-contain"
      />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-brand-500 rounded-full animate-spin" />
            <span className="text-sm">Connexion en cours…</span>
          </div>
        </div>
      )}
      {stream && !isLocked && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(8px)",
              borderRadius: 8,
              padding: "9px 16px",
              color: "rgba(255,255,255,0.65)",
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
