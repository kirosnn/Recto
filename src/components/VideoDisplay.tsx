import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface VideoDisplayProps {
  stream: MediaStream | null;
  inputChannel: RTCDataChannel | null;
  hostWidth: number;
  hostHeight: number;
}

export default function VideoDisplay({
  stream,
  inputChannel,
  hostWidth,
  hostHeight,
}: VideoDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const sendInput = useCallback(
    (event: object) => {
      if (inputChannel?.readyState === "open") {
        inputChannel.send(JSON.stringify(event));
      }
    },
    [inputChannel]
  );

  const getRelativePos = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * hostWidth,
        y: ((e.clientY - rect.top) / rect.height) * hostHeight,
        width: hostWidth,
        height: hostHeight,
      };
    },
    [hostWidth, hostHeight]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black cursor-none"
      tabIndex={0}
      onMouseMove={(e) => {
        const pos = getRelativePos(e);
        sendInput({ type: "mouseMove", ...pos });
      }}
      onMouseDown={(e) =>
        sendInput({ type: "mouseDown", button: e.button })
      }
      onMouseUp={(e) =>
        sendInput({ type: "mouseUp", button: e.button })
      }
      onWheel={(e) =>
        sendInput({
          type: "mouseWheel",
          deltaX: e.deltaX,
          deltaY: e.deltaY,
        })
      }
      onKeyDown={(e) => {
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
    </div>
  );
}
