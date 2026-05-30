import { useEffect, useRef, useCallback, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { GamepadPoller, type GamepadStateMsg } from "../lib/gamepad";
import { VirtualGamepadEmulator } from "../lib/virtualGamepad";
import type { HwEncoderCaps } from "../lib/webrtc";

interface VideoStats {
  codec: string;
  bitrateKbps: number;
  fps: number;
  width: number;
  height: number;
  packetLossPct: number;
  jitterMs: number;
  hwDecode: boolean;
}

interface PrevStatsSnap {
  bytes: number;
  frames: number;
  ts: number;
}

async function parseRTCStats(
  report: RTCStatsReport,
  prev: PrevStatsSnap | null
): Promise<{ stats: VideoStats; snap: PrevStatsSnap } | null> {
  let inbound: Record<string, unknown> | null = null;
  let codecMime = "?";

  report.forEach((s) => {
    const r = s as Record<string, unknown>;
    if (r.type === "inbound-rtp" && r.kind === "video") inbound = r;
  });
  if (!inbound) return null;

  const codecId = (inbound as Record<string, unknown>).codecId as string | undefined;
  if (codecId) {
    const c = report.get(codecId) as Record<string, unknown> | undefined;
    if (c?.mimeType) codecMime = (c.mimeType as string).replace("video/", "");
  }

  const now = performance.now();
  const bytes = ((inbound as Record<string, unknown>).bytesReceived as number) ?? 0;
  const frames = ((inbound as Record<string, unknown>).framesDecoded as number) ?? 0;
  const snap: PrevStatsSnap = { bytes, frames, ts: now };

  let bitrateKbps = 0;
  let fps = 0;
  if (prev) {
    const dt = (now - prev.ts) / 1000;
    if (dt > 0) {
      bitrateKbps = ((bytes - prev.bytes) * 8) / 1000 / dt;
      fps = (frames - prev.frames) / dt;
    }
  }

  const ib = inbound as Record<string, unknown>;
  const lost = (ib.packetsLost as number) ?? 0;
  const recv = (ib.packetsReceived as number) ?? 0;
  const total = recv + lost;

  return {
    stats: {
      codec: codecMime,
      bitrateKbps: Math.round(bitrateKbps),
      fps: Math.round(fps * 10) / 10,
      width: (ib.frameWidth as number) ?? 0,
      height: (ib.frameHeight as number) ?? 0,
      packetLossPct: total > 0 ? Math.round((lost / total) * 1000) / 10 : 0,
      jitterMs: Math.round(((ib.jitter as number) ?? 0) * 1000),
      hwDecode: (ib.decoderImplementation as string) === "HardwareAccelerated",
    },
    snap,
  };
}

interface VideoDisplayProps {
  stream: MediaStream | null;
  inputChannel: RTCDataChannel | null;
  hostWidth: number;
  hostHeight: number;
  hideUI: boolean;
  onToggleUI: () => void;
  getStats?: () => Promise<RTCStatsReport>;
  hwCaps?: HwEncoderCaps | null;
  setLowLatency?: (enabled: boolean) => void;
}

export default function VideoDisplay({
  stream,
  inputChannel,
  hostWidth,
  hostHeight,
  hideUI,
  onToggleUI,
  getStats,
  hwCaps,
  setLowLatency,
}: VideoDisplayProps) {
  const { settings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isVirtualGamepad, setIsVirtualGamepad] = useState(false);
  const lastMoveSendRef = useRef(0);
  const [showStats, setShowStats] = useState(false);
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null);
  const prevSnapRef = useRef<PrevStatsSnap | null>(null);

  // Gamepad instances — created once, outlive re-renders
  const gpPollerRef = useRef<GamepadPoller | null>(null);
  const vgpRef = useRef<VirtualGamepadEmulator | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Low-latency tuning belongs on the RTCRtpReceiver (playoutDelayHint /
  // jitterBufferTarget), not the <video> element. Route it through the
  // connection, which owns the receivers. Re-applied when the toggle changes.
  useEffect(() => {
    setLowLatency?.(settings.lowLatencyMode);
  }, [stream, settings.lowLatencyMode, setLowLatency]);

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

  // Stats polling
  useEffect(() => {
    if (!showStats || !getStats) return;
    const poll = async () => {
      try {
        const report = await getStats();
        const result = await parseRTCStats(report, prevSnapRef.current);
        if (result) { setVideoStats(result.stats); prevSnapRef.current = result.snap; }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [showStats, getStats]);

  useEffect(() => {
    setShowStats(settings.showStats);
  }, [settings.showStats]);

  // Build gamepad sender callback (stable ref — re-created only when inputChannel changes)
  const sendGamepad = useCallback(
    (msg: GamepadStateMsg) => {
      if (inputChannel?.readyState === "open") {
        inputChannel.send(JSON.stringify(msg));
      }
    },
    [inputChannel]
  );

  // Start real gamepad polling whenever the channel opens
  useEffect(() => {
    if (!inputChannel) return;

    const poller = new GamepadPoller(sendGamepad);
    gpPollerRef.current = poller;
    // Not started here — only on Ctrl+Alt+G to avoid creating a ViGEm
    // controller on the host without the user's explicit intent.

    const vgp = new VirtualGamepadEmulator(sendGamepad);
    vgpRef.current = vgp;
    vgp.sensitivity = settings.virtualGamepadSensitivity ?? 0.025;

    return () => {
      poller.stop();
      vgp.stop();
      gpPollerRef.current = null;
      vgpRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputChannel]);

  // Keep sensitivity in sync when settings change
  useEffect(() => {
    if (vgpRef.current) {
      vgpRef.current.sensitivity = settings.virtualGamepadSensitivity ?? 0.025;
    }
  }, [settings.virtualGamepadSensitivity]);

  const sendInput = useCallback(
    (event: object) => {
      if (inputChannel?.readyState === "open") {
        inputChannel.send(JSON.stringify(event));
      }
    },
    [inputChannel]
  );

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
      className="relative w-full h-full bg-black"
      style={{ cursor: isLocked ? "none" : "default", outline: "none" }}
      tabIndex={0}
      onClick={(e) => {
        if (isVirtualGamepad) {
          vgpRef.current?.mouseButton(e.button, true);
          setTimeout(() => vgpRef.current?.mouseButton(e.button, false), 80);
          return;
        }
        requestLock();
      }}
      onMouseMove={(e) => {
        if (isVirtualGamepad && isLocked) {
          vgpRef.current?.mouseMove(e.movementX, e.movementY);
          return;
        }
        // Normal mouse input
        const throttle = settings.inputThrottleMs;
        if (throttle > 0) {
          const now = performance.now();
          if (now - lastMoveSendRef.current < throttle) return;
          lastMoveSendRef.current = now;
        }
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
      onMouseDown={(e) => {
        if (isVirtualGamepad) {
          vgpRef.current?.mouseButton(e.button, true);
          return;
        }
        sendInput({ type: "mouseDown", button: e.button });
      }}
      onMouseUp={(e) => {
        if (isVirtualGamepad) {
          vgpRef.current?.mouseButton(e.button, false);
          return;
        }
        sendInput({ type: "mouseUp", button: e.button });
      }}
      onWheel={(e) => {
        if (isVirtualGamepad) return;
        sendInput({ type: "mouseWheel", deltaX: e.deltaX, deltaY: e.deltaY });
      }}
      onKeyDown={(e) => {
        if (e.code === "Escape") return;

        // Ctrl+Alt+H — toggle UI overlays
        if (e.ctrlKey && e.altKey && e.code === "KeyH") {
          e.preventDefault();
          onToggleUI();
          return;
        }

        // Ctrl+Alt+S — toggle stats overlay (local, not forwarded)
        if (e.ctrlKey && e.altKey && e.code === "KeyS") {
          e.preventDefault();
          setShowStats((v) => !v);
          return;
        }

        // Ctrl+Alt+G — toggle gamepad mode (real + virtual, opt-in only)
        if (e.ctrlKey && e.altKey && e.code === "KeyG") {
          e.preventDefault();
          setIsVirtualGamepad((v) => {
            const next = !v;
            if (next) {
              gpPollerRef.current?.start(); // real gamepad passthrough
              vgpRef.current?.start();      // KB+mouse → virtual gamepad
              requestLock();
            } else {
              gpPollerRef.current?.stop();
              vgpRef.current?.stop();       // sends neutral state to release buttons
            }
            return next;
          });
          return;
        }

        // Virtual gamepad mode — consumed keys go to the emulator
        if (isVirtualGamepad && vgpRef.current?.isConsumed(e.code)) {
          e.preventDefault();
          vgpRef.current.keyDown(e.code);
          return;
        }

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
        if (e.ctrlKey && e.altKey && e.code === "KeyH") { e.preventDefault(); return; }
        if (e.ctrlKey && e.altKey && e.code === "KeyS") { e.preventDefault(); return; }
        if (e.ctrlKey && e.altKey && e.code === "KeyG") { e.preventDefault(); return; }

        if (isVirtualGamepad && vgpRef.current?.isConsumed(e.code)) {
          e.preventDefault();
          vgpRef.current.keyUp(e.code);
          return;
        }

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
        style={{ objectFit: settings.displayMode }}
      />

      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-brand-500 rounded-full animate-spin" />
            <span className="text-sm">Connexion en cours…</span>
          </div>
        </div>
      )}

      {/* Click-to-lock hint */}
      {stream && !isLocked && !isVirtualGamepad && !hideUI && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            borderRadius: 8,
            padding: "9px 18px",
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.8rem",
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            Cliquer pour capturer la souris · Échap pour libérer · Ctrl+Alt+H masquer · Ctrl+Alt+G manette
          </div>
        </div>
      )}

      {/* Stats overlay — Ctrl+Alt+S */}
      {showStats && stream && (
        <div style={{
          position: "absolute", bottom: 12, right: 12, zIndex: 20,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
          padding: "10px 14px", fontSize: "0.74rem", lineHeight: 1.75,
          color: "rgba(255,255,255,0.85)", pointerEvents: "none",
          fontFamily: "monospace", minWidth: 210,
        }}>
          <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
            Stats · Ctrl+Alt+S
          </div>
          {videoStats ? (
            <>
              <StatRow label="Codec">
                <span style={{ color: "#7dd3fc" }}>{videoStats.codec}</span>
                {videoStats.hwDecode && (
                  <span style={{ marginLeft: 6, fontSize: "0.6rem", background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", padding: "1px 5px", borderRadius: 3 }}>HW</span>
                )}
              </StatRow>
              <StatRow label="Bitrate">{videoStats.bitrateKbps >= 1000 ? `${(videoStats.bitrateKbps / 1000).toFixed(1)} Mbps` : `${videoStats.bitrateKbps} Kbps`}</StatRow>
              <StatRow label="FPS">{videoStats.fps.toFixed(1)}</StatRow>
              {videoStats.width > 0 && <StatRow label="Résolution">{videoStats.width}×{videoStats.height}</StatRow>}
              <StatRow label="Pertes"><span style={{ color: videoStats.packetLossPct > 1 ? "#f87171" : "inherit" }}>{videoStats.packetLossPct.toFixed(1)}%</span></StatRow>
              <StatRow label="Gigue">{videoStats.jitterMs} ms</StatRow>
            </>
          ) : (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem" }}>En attente des stats…</div>
          )}
          {hwCaps && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: "0.68rem", color: "rgba(255,255,255,0.4)" }}>
              <span>Encodeur hôte : </span>
              <span style={{ color: "rgba(255,255,255,0.7)" }}>
                {hwCaps.nvenc ? "NVENC" : hwCaps.amf ? "AMF" : hwCaps.qsv ? "QSV" : hwCaps.vendor !== "unknown" ? hwCaps.vendor.toUpperCase() : "SW"}
              </span>
              {hwCaps.gpuName && <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.6rem", marginTop: 2 }}>{hwCaps.gpuName}</div>}
            </div>
          )}
        </div>
      )}

      {/* Virtual gamepad active indicator */}
      {isVirtualGamepad && !hideUI && (
        <div
          style={{
            position: "absolute", bottom: 12, right: 12,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)",
            borderRadius: 10, padding: "8px 14px",
            border: "1px solid rgba(217,119,87,0.35)",
            color: "#d97757", fontSize: "0.78rem", fontWeight: 600,
            letterSpacing: "0.02em", pointerEvents: "none",
            display: "flex", alignItems: "center", gap: 7,
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#d97757",
            boxShadow: "0 0 6px rgba(217,119,87,0.7)",
            display: "inline-block", flexShrink: 0,
          }} />
          Manette virtuelle · Ctrl+Alt+G pour désactiver
        </div>
      )}
    </div>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}
