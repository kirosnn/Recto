import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VersoConnection } from "../lib/webrtc";
import VideoDisplay from "../components/VideoDisplay";
import PreferencesDrawer from "../components/PreferencesDrawer";
import BackButton from "../components/BackButton";

type Status = "idle" | "connecting" | "connected" | "error";

export default function VersoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [inputChannel, setInputChannel] = useState<RTCDataChannel | null>(null);
  // Defaults to 1920×1080; updated when Recto sends displayInfo over DataChannel
  const [hostSize, setHostSize] = useState({ w: 1920, h: 1080 });
  const conn = useRef<VersoConnection | null>(null);
  const navigate = useNavigate();

  const handleConnect = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { setError("Le code doit faire 6 caractères"); return; }
    setStatus("connecting"); setError("");

    conn.current = new VersoConnection({
      onStream: (s) => setStream(s),
      onConnected: () => setStatus("connected"),
      onDisconnected: () => { setStatus("idle"); setStream(null); setInputChannel(null); },
      onError: (e) => { setError(e); setStatus("error"); conn.current = null; },
      onInputChannel: (ch) => setInputChannel(ch),
      onDisplayInfo: (w, h) => setHostSize({ w, h }),
    });

    try { await conn.current.connect(trimmed); }
    catch (e: unknown) { setError((e as Error).message || "Connexion échouée"); setStatus("error"); conn.current = null; }
  };

  const handleDisconnect = () => {
    conn.current?.stop(); conn.current = null;
    setStatus("idle"); setStream(null); setInputChannel(null); setCode("");
  };

  useEffect(() => () => conn.current?.stop(), []);

  if (status === "connected" || (status === "connecting" && stream)) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
        <VideoDisplay
          stream={stream}
          inputChannel={inputChannel}
          hostWidth={hostSize.w}
          hostHeight={hostSize.h}
        />
        <button
          onClick={handleDisconnect}
          className="btn btn-ghost"
          style={{
            position: "absolute", top: 10, right: 10,
            fontSize: "0.8rem", minHeight: 30, padding: "0 12px",
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)",
            zIndex: 10,
          }}
        >
          ✕ Déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ gap: "clamp(20px, 3vw, 32px)" }}>
      <PreferencesDrawer />
      <BackButton />

      <div style={{ textAlign: "center" }}>
        <h1 className="serif" style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.04em", color: "var(--tx)" }}>
          Se connecter.
        </h1>
        <p style={{ marginTop: 8, fontSize: "0.88rem", color: "var(--tx-2)" }}>
          Entre le code affiché sur l&apos;écran Recto.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          className="code-input"
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="AB3XK7"
          maxLength={6}
          autoFocus
          disabled={status === "connecting"}
        />

        {error && (
          <p style={{ fontSize: "0.82rem", color: "#c4623e", textAlign: "center" }}>{error}</p>
        )}

        <button
          className="btn btn-accent"
          onClick={handleConnect}
          disabled={status === "connecting" || code.trim().length < 6}
          style={{ width: "100%", minHeight: 44 }}
        >
          {status === "connecting" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white",
                display: "inline-block", animation: "spin 0.75s linear infinite",
              }} />
              Connexion…
            </span>
          ) : "Se connecter →"}
        </button>
      </div>

      <p style={{ fontSize: "0.76rem", color: "var(--tx-3)", textAlign: "center" }}>
        Tu peux aussi rejoindre depuis{" "}
        <span style={{ color: "var(--tx-2)" }}>kirossenrecto.vercel.app/verso</span>
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
