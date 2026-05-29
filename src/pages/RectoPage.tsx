import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { RectoConnection } from "../lib/webrtc";
import { endSession } from "../lib/signaling";
import PreferencesDrawer from "../components/PreferencesDrawer";
import BackButton from "../components/BackButton";

type Status = "idle" | "selecting" | "waiting" | "connected" | "error";

export default function RectoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const conn = useRef<RectoConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  const handleStart = async () => {
    setStatus("selecting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 60, cursor: "always" } as MediaTrackConstraints,
        audio: true,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);
      stream.getVideoTracks()[0].onended = () => handleStop();

      conn.current = new RectoConnection({
        onCode: (c) => { setCode(c); setStatus("waiting"); },
        onConnected: () => {
          setStatus("connected");
          timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
        },
        onDisconnected: () => handleStop(),
        onError: (e) => { setError(e); setStatus("error"); },
      });

      const inputCh = conn.current.getInputChannel();
      if (inputCh) {
        inputCh.onmessage = async (e) => {
          try { await invoke("inject_input", { event: JSON.parse(e.data as string) }); } catch {}
        };
      }
      await conn.current.start(stream);
    } catch (e: unknown) {
      if ((e as Error).name !== "NotAllowedError") { setError((e as Error).message || "Erreur"); setStatus("error"); }
      else setStatus("idle");
    }
  };

  const handleStop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (code) endSession(code).catch(() => {});
    conn.current?.stop(); conn.current = null;
    setStatus("idle"); setCode(""); setDuration(0);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => () => handleStop(), []);

  const fmt = (s: number) =>
    [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
      .map((n) => String(n).padStart(2, "0")).join(":");

  return (
    <div className="page" style={{ gap: "clamp(20px, 3vw, 32px)" }}>

      <PreferencesDrawer />
      {(status === "idle" || status === "error") && <BackButton />}

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
          <button className="btn btn-accent" style={{ minHeight: 44, padding: "0 28px", fontSize: "0.95rem" }} onClick={handleStart}>
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
      {(status === "waiting" || status === "connected") && (
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>

          {/* Code */}
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              Code de session
            </p>
            <div
              className="code-display"
              onClick={copyCode}
              title="Cliquer pour copier"
              style={{ cursor: "pointer", justifyContent: "center" }}
            >
              {code.split("").map((c, i) => (
                <span key={i} className="code-char">{c}</span>
              ))}
            </div>
            <p style={{ marginTop: 10, fontSize: "0.76rem", color: copied ? "var(--accent)" : "var(--tx-3)", transition: "color 200ms ease" }}>
              {copied ? "✓ Copié !" : "Cliquer pour copier"}
            </p>
          </div>

          {/* Status pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusPill
              active={status === "connected"}
              label={status === "waiting" ? "En attente…" : "Connecté"}
            />
            {status === "connected" && (
              <span className="mono" style={{ fontSize: "0.82rem", color: "var(--tx-3)", letterSpacing: "0.02em" }}>
                {fmt(duration)}
              </span>
            )}
          </div>

          {/* Hint */}
          <p style={{ fontSize: "0.78rem", color: "var(--tx-3)", textAlign: "center", lineHeight: 1.6 }}>
            Verso sur le web ·{" "}
            <span style={{ color: "var(--tx-2)" }}>kirossenrecto.vercel.app/verso</span>
          </p>

          <button
            className="btn btn-ghost"
            onClick={handleStop}
            style={{ color: "#c4623e", borderColor: "rgba(217,119,87,0.2)", fontSize: "0.88rem", width: "100%" }}
          >
            Arrêter le partage
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <p style={{ color: "#c4623e", fontSize: "0.9rem" }}>{error}</p>
          <button className="btn btn-ghost" onClick={() => setStatus("idle")}>Réessayer</button>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      border: "2.5px solid var(--border-2)",
      borderTopColor: "var(--accent)",
      animation: "spin 0.75s linear infinite",
      margin: "0 auto",
    }} />
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 12px", borderRadius: 999,
      border: "1px solid var(--border-2)",
      background: "var(--bg-alt)",
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
