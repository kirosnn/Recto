"use client";

import { useState, useRef, useEffect } from "react";
import { WebVersoConnection } from "../../../lib/webrtc";

type Status = "idle" | "connecting" | "connected" | "error";

export default function VersoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conn = useRef<WebVersoConnection | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => () => conn.current?.stop(), []);

  const handleConnect = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { setError("Le code doit faire 6 caractères"); return; }
    setStatus("connecting"); setError("");

    conn.current = new WebVersoConnection({
      onStream: (s) => setStream(s),
      onConnected: () => setStatus("connected"),
      onDisconnected: () => { setStatus("idle"); setStream(null); },
      onError: (e) => { setError(e); setStatus("error"); conn.current = null; },
    });

    try { await conn.current.connect(trimmed); }
    catch (e: unknown) { setError((e as Error).message || "Connexion échouée"); setStatus("error"); conn.current = null; }
  };

  const handleDisconnect = () => {
    conn.current?.stop(); conn.current = null;
    setStatus("idle"); setStream(null); setCode("");
  };

  if (status === "connected" || stream) {
    return (
      <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#000" }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <button
          onClick={handleDisconnect}
          style={{
            position: "absolute", top: "16px", right: "16px",
            padding: "6px 14px", borderRadius: "10px",
            background: "rgba(17,17,17,0.82)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#f5f1e8", fontSize: "0.88rem", cursor: "pointer",
            fontFamily: "var(--font-sans)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          ✕ Déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="main-page" style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", minHeight: "100vh",
    }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <h1 className="main-intro" style={{ textAlign: "left", marginTop: 0 }}>
          Se connecter.
        </h1>

        <p className="main-body" style={{ textAlign: "left", marginTop: "12px", width: "100%" }}>
          Entre le code à 6 caractères affiché sur l&apos;écran Recto.
        </p>

        <div style={{ marginTop: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            placeholder="AB3XK7"
            maxLength={6}
            disabled={status === "connecting"}
            autoFocus
            style={{
              width: "100%", height: "52px",
              fontFamily: "var(--font-mono)", fontSize: "1.6rem",
              fontWeight: 600, letterSpacing: "0.3em", textAlign: "center",
              background: "rgba(18,18,18,0.04)", color: "#121212",
              border: "1px solid rgba(18,18,18,0.14)",
              borderRadius: "12px", outline: "none",
              transition: "border-color 180ms ease, box-shadow 180ms ease",
            }}
            onFocus={(e) => { e.target.style.borderColor = "#d97757"; e.target.style.boxShadow = "0 0 0 3px rgba(217,119,87,0.12)"; }}
            onBlur={(e) => { e.target.style.borderColor = "rgba(18,18,18,0.14)"; e.target.style.boxShadow = "none"; }}
          />

          {error && (
            <p style={{ fontSize: "0.85rem", color: "#c4623e", letterSpacing: "-0.01em" }}>{error}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={status === "connecting" || code.trim().length < 6}
            className="main-button main-button-primary is-accent"
            style={{ width: "100%", minHeight: "46px", opacity: (status === "connecting" || code.trim().length < 6) ? 0.5 : 1 }}
          >
            {status === "connecting" ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Connexion…
              </>
            ) : "Se connecter →"}
          </button>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          html[data-theme="dark"] input {
            background: rgba(255,255,255,0.04) !important;
            color: #f5f1e8 !important;
            border-color: rgba(255,255,255,0.12) !important;
          }
        `}</style>
      </div>
    </div>
  );
}
