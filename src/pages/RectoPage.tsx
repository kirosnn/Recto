import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRectoSession } from "../context/RectoSessionContext";
import PreferencesDrawer from "../components/PreferencesDrawer";
import PeerBadge from "../components/PeerBadge";
import BackButton from "../components/BackButton";

export default function RectoPage() {
  const { status, code, duration, error, copied, peer, lastInputRef, start, stop, copyCode } = useRectoSession();
  const navigate = useNavigate();

  // Debug overlay (Ctrl+Alt+D): shows the last input event injected on the host,
  // so input can be verified even when testing on a single machine.
  const [showDebug, setShowDebug] = useState(false);
  const [dbg, setDbg] = useState({ summary: "", count: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.code === "KeyD") {
        e.preventDefault();
        setShowDebug((v) => !v);
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
