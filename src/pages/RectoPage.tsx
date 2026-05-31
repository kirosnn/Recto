import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRectoSession } from "../context/RectoSessionContext";
import PreferencesDrawer from "../components/PreferencesDrawer";
import PeerBadge from "../components/PeerBadge";
import BackButton from "../components/BackButton";

// Sender-side stats for the host overlay. Recto only ever produces outbound-rtp
// (it's the one encoding & sending), so the key signals are about the ENCODER:
// which codec, hardware vs software, and whether it can keep up (fps / qLimit).
interface SenderStats {
  codec: string;
  encoder: string;     // encoderImplementation, e.g. "NVENC"/"libaom" (SW)
  hardware: boolean;   // true if the encoder is GPU-accelerated
  width: number;
  height: number;
  captureFps: number;  // media-source rate = what getDisplayMedia delivers
  fps: number;         // outbound-rtp rate = what the encoder actually sends
  bitrateKbps: number;
  rtt: number;
  qualityLimit: string; // "none" | "cpu" | "bandwidth" | ...
}

const EMPTY_STATS: SenderStats = {
  codec: "—", encoder: "—", hardware: false, width: 0, height: 0,
  captureFps: 0, fps: 0, bitrateKbps: 0, rtt: 0, qualityLimit: "—",
};

export default function RectoPage() {
  const { status, code, duration, error, copied, peer, lastInputRef, start, stop, copyCode, getStats } = useRectoSession();
  const navigate = useNavigate();

  // Debug overlay (Ctrl+Alt+D): shows the last input event injected on the host,
  // so input can be verified even when testing on a single machine.
  const [showDebug, setShowDebug] = useState(false);
  const [dbg, setDbg] = useState({ summary: "", count: 0 });

  const [showStats, setShowStats] = useState(false);
  const [videoStats, setVideoStats] = useState<SenderStats>(EMPTY_STATS);
  const prevSnapRef = useRef<{ bytes: number; frames: number; ts: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.code === "KeyD") {
        e.preventDefault();
        setShowDebug((v) => !v);
      }
      if (e.ctrlKey && e.altKey && e.code === "KeyS") {
        e.preventDefault();
        setShowStats((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!showDebug) return;
    const id = setInterval(() => setDbg({ ...lastInputRef.current }), 100);
    return () => clearInterval(id);
  }, [showDebug, lastInputRef]);

  useEffect(() => {
    if (!showStats || !getStats) return;
    const id = setInterval(async () => {
      const report = await getStats();
      // Recto is the SENDER → read outbound-rtp (not inbound, which is always
      // empty here and is why this overlay used to show nothing but zeros).
      let outbound: any = null;
      let pair: any = null;
      let source: any = null;
      report.forEach((s: any) => {
        if (s.type === "outbound-rtp" && s.kind === "video") outbound = s;
        else if (s.type === "candidate-pair" && (s.nominated || s.selected)) pair = s;
        // media-source = the capture track itself, *before* encoding. Its
        // framesPerSecond is the rate getDisplayMedia (WebView2) actually
        // delivers — the decisive number vs the encoded outbound fps.
        else if (s.type === "media-source" && s.kind === "video") source = s;
      });
      if (!outbound) return;

      let codec = "—";
      if (outbound.codecId) {
        const c = report.get(outbound.codecId) as any;
        if (c?.mimeType) codec = (c.mimeType as string).replace("video/", "");
      }

      const bytes = (outbound.bytesSent as number) ?? 0;
      const frames = (outbound.framesEncoded as number) ?? 0;
      const now = Date.now();
      const prev = prevSnapRef.current;
      let bitrateKbps = 0;
      let fps = 0;
      if (prev) {
        const dt = (now - prev.ts) / 1000;
        if (dt > 0) {
          bitrateKbps = Math.round(((bytes - prev.bytes) * 8) / 1000 / dt);
          fps = Math.round((frames - prev.frames) / dt);
        }
      }
      prevSnapRef.current = { bytes, frames, ts: now };

      // A hardware encoder reports a vendor name (e.g. "NVIDIA H.264 ...",
      // "QuickSync", "AMF"); software fallbacks report "libaom"/"libvpx"/
      // "OpenH264"/"SimulcastEncoderAdapter". Flag the software ones explicitly.
      const enc = (outbound.encoderImplementation as string) ?? "—";
      const isSoftware = /libaom|libvpx|openh264|software|fallback/i.test(enc) || enc === "ExternalEncoder";

      setVideoStats({
        codec,
        encoder: enc,
        hardware: enc !== "—" && !isSoftware,
        width: (outbound.frameWidth as number) ?? 0,
        height: (outbound.frameHeight as number) ?? 0,
        captureFps: source ? Math.round((source.framesPerSecond as number) ?? 0) : 0,
        fps,
        bitrateKbps,
        rtt: pair ? Math.round(((pair.currentRoundTripTime as number) ?? 0) * 1000) : 0,
        qualityLimit: (outbound.qualityLimitationReason as string) ?? "—",
      });
    }, 500);
    return () => clearInterval(id);
  }, [showStats, getStats]);

  const fmt = (s: number) =>
    [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((n) => String(n).padStart(2, "0")).join(":");

  const isActive = status === "waiting" || status === "connected";

  return (
    <div className="page" style={{ gap: "clamp(20px, 3vw, 32px)" }}>
      <PreferencesDrawer />

      {/* BackButton : toujours visible, mais comportement différent selon état */}
      <BackButton
        onClick={() => navigate("/")}
      />

      {showStats && status === "connected" && (
        <div style={{ position: "fixed", top: 12, right: 12, zIndex: 9999, padding: "10px 14px", borderRadius: 10, background: "rgba(0,0,0,0.82)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", fontSize: "0.78rem", lineHeight: 1.6, pointerEvents: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", minWidth: 210, fontFamily: "monospace" }}>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Stats encodeur · Ctrl+Alt+S</div>
          <div>Codec: <span style={{ color: "#7dd3fc" }}>{videoStats.codec}</span></div>
          <div>
            Encodeur:{" "}
            <span style={{ color: videoStats.hardware ? "#4ade80" : "#f87171", fontWeight: 600 }}>
              {videoStats.hardware ? "Matériel ✓" : "Logiciel ✗"}
            </span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.66rem", marginTop: -2, marginBottom: 2 }}>{videoStats.encoder}</div>
          <div>Résolution: {videoStats.width}×{videoStats.height}</div>
          <div>Capture FPS: <span style={{ color: videoStats.captureFps < 45 ? "#fbbf24" : "#4ade80" }}>{videoStats.captureFps}</span></div>
          <div>Encodé FPS: <span style={{ color: videoStats.fps < 24 ? "#f87171" : "inherit" }}>{videoStats.fps}</span></div>
          <div>Bitrate: {videoStats.bitrateKbps >= 1000 ? `${(videoStats.bitrateKbps / 1000).toFixed(1)} Mbps` : `${videoStats.bitrateKbps} Kbps`}</div>
          <div>RTT: {videoStats.rtt} ms</div>
          <div>Limite: <span style={{ color: videoStats.qualityLimit !== "none" && videoStats.qualityLimit !== "—" ? "#fbbf24" : "inherit" }}>{videoStats.qualityLimit}</span></div>
        </div>
      )}

      {showDebug && (
        <div
          className="mono"
          style={{
            position: "fixed", bottom: 12, left: 12, zIndex: 9999,
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(0,0,0,0.82)", color: "#7CFC9B",
            border: "1px solid rgba(124,252,155,0.3)",
            fontSize: "0.78rem", lineHeight: 1.5, pointerEvents: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)", minWidth: 180,
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            Debug input · Ctrl+Alt+D
          </div>
          <div>reçus : {dbg.count}</div>
          <div>dernier : {dbg.summary || "—"}</div>
        </div>
      )}

      {/* ── Idle ── */}
      {status === "idle" && (
        <>
          <div style={{ textAlign: "center" }}>
            <h1 className="serif" style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.04em", color: "var(--tx)" }}>
              Partager mon écran.
            </h1>
            <p style={{ marginTop: 8, fontSize: "0.88rem", color: "var(--tx-2)" }}>
              Un code sera généré — transmets-le à Verso.
            </p>
          </div>
          <button className="btn btn-accent" style={{ minHeight: 44, padding: "0 28px", fontSize: "0.95rem" }} onClick={start}>
            Démarrer le partage
          </button>
        </>
      )}

      {/* ── Selecting ── */}
      {status === "selecting" && (
        <div style={{ textAlign: "center" }}>
          <Spinner />
          <p style={{ marginTop: 14, color: "var(--tx-2)", fontSize: "0.9rem" }}>Sélectionne ton écran…</p>
        </div>
      )}

      {/* ── Waiting / Connected ── */}
      {isActive && (
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              Code de session
            </p>
            <div className="code-display" onClick={copyCode} title="Cliquer pour copier" style={{ cursor: "pointer", justifyContent: "center" }}>
              {code.split("").map((c, i) => <span key={i} className="code-char">{c}</span>)}
            </div>
            <p style={{ marginTop: 10, fontSize: "0.76rem", color: copied ? "var(--accent)" : "var(--tx-3)", transition: "color 200ms ease" }}>
              {copied ? "✓ Copié !" : "Cliquer pour copier"}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusPill active={status === "connected"} label={status === "waiting" ? "En attente…" : "Connecté"} />
            {status === "connected" && (
              <span className="mono" style={{ fontSize: "0.82rem", color: "var(--tx-3)", letterSpacing: "0.02em" }}>
                {fmt(duration)}
              </span>
            )}
          </div>

          {status === "connected" && peer && (
            <PeerBadge peer={peer} label="Connecté avec" />
          )}

          <p style={{ fontSize: "0.78rem", color: "var(--tx-3)", textAlign: "center", lineHeight: 1.6 }}>
            Verso sur le web ·{" "}
            <span style={{ color: "var(--tx-2)" }}>kirossenrecto.vercel.app/verso</span>
          </p>

          <button className="btn btn-ghost" onClick={stop}
            style={{ color: "#c4623e", borderColor: "rgba(217,119,87,0.2)", fontSize: "0.88rem", width: "100%" }}>
            Arrêter le partage
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <p style={{ color: "#c4623e", fontSize: "0.9rem" }}>{error}</p>
          <button className="btn btn-ghost" onClick={() => { stop(); }}>Réessayer</button>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      border: "2.5px solid var(--border-2)", borderTopColor: "var(--accent)",
      animation: "spin 0.75s linear infinite", margin: "0 auto",
    }} />
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 12px", borderRadius: 999,
      border: "1px solid var(--border-2)", background: "var(--bg-alt)",
      fontSize: "0.82rem", color: active ? "var(--tx)" : "var(--tx-2)",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: active ? "#4caf7d" : "var(--tx-3)",
        boxShadow: active ? "0 0 6px rgba(76,175,125,0.6)" : "none",
        transition: "background 400ms ease, box-shadow 400ms ease",
      }} />
      {label}
    </div>
  );
}
