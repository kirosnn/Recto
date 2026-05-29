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
      <div style={{ position: "relative", width: "100%", height: "calc(100vh - 52px)", background: "#000" }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <button
          onClick={handleDisconnect}
          style={{
            position: "absolute", top: "16px", right: "16px",
            padding: "6px 14px", borderRadius: "10px",
            background: "var(--surface)", border: "1px solid var(--border-2)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            color: "var(--tx)", fontSize: "0.84rem", cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          ✕ Déconnecter
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "calc(100vh - 52px)", background: "var(--bg)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "clamp(24px, 5vw, 48px)",
    }}>
      <div style={{ width: "100%", maxWidth: "340px" }}>
        <h1 className="serif" style={{
          fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
          letterSpacing: "-0.03em", color: "var(--tx)",
          marginBottom: "8px", lineHeight: 1.1,
        }}>
          Se connecter.
        </h1>
        <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", marginBottom: "28px", lineHeight: 1.55 }}>
          Entre le code à 6 caractères affiché sur l&apos;écran Recto.
        </p>

        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="A B 3 X K 7"
          maxLength={6}
          disabled={status === "connecting"}
          style={{
            width: "100%", height: "52px",
            fontFamily: "var(--font-geist-mono)", fontSize: "1.4rem",
            fontWeight: 600, letterSpacing: "0.25em", textAlign: "center",
            background: "var(--bg-alt)", border: "1px solid var(--border-2)",
            borderRadius: "12px", color: "var(--tx)", outline: "none",
            marginBottom: "12px",
            transition: "border-color 180ms ease, box-shadow 180ms ease",
          }}
          onFocus={e => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-dim)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--border-2)"; e.target.style.boxShadow = "none"; }}
          autoFocus
        />

        {error && (
          <p style={{ fontSize: "0.82rem", color: "var(--accent)", marginBottom: "12px" }}>{error}</p>
        )}

        <button
          onClick={handleConnect}
          disabled={status === "connecting" || code.trim().length < 6}
          className="btn-primary"
          style={{ width: "100%", opacity: (status === "connecting" || code.trim().length < 6) ? 0.5 : 1 }}
        >
          {status === "connecting" ? (
            <>
              <span style={{
                width: "14px", height: "14px",
                border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white",
                borderRadius: "50%", display: "inline-block",
                animation: "spin 0.7s linear infinite",
              }} />
              Connexion…
            </>
          ) : "Se connecter →"}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
