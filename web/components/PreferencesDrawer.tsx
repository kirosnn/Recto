"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase-browser";
import { useTheme } from "./ThemeProvider";
import { useWebSettings } from "../lib/webSettings";
import { bitrateLabel } from "../../src/lib/settings";

type User = {
  user_metadata: { full_name?: string; avatar_url?: string };
  email?: string;
};

export default function PreferencesDrawer({ user }: { user?: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { settings, update } = useWebSettings();
  const supabase = createClient();
  const isVerso = true; // site is primarily Verso client

  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const avatar = user?.user_metadata?.avatar_url;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className={`main-preferences-drawer${open ? " is-open" : ""}`} aria-label="Préférences">
      <button
        type="button"
        className="main-preferences-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer" : "Ouvrir les préférences"}
      >
        <svg className="main-preferences-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="main-preferences-panel">
        <p className="main-preferences-title">Préférences</p>

        <div className="main-preferences-group">
          <p className="main-preferences-group-title">Thème</p>
          <div className="main-preferences-options">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`main-preferences-option${theme === t ? " is-active" : ""}`}
                onClick={() => { if (theme !== t) toggle(); }}
              >
                {t === "dark" ? "Sombre" : "Clair"}
              </button>
            ))}
          </div>
        </div>

        <div className="main-preferences-group">
          <p className="main-preferences-group-title">Entrée</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Souris</span>
            <div className="main-preferences-options main-preferences-options-inline">
              {([{ label: "Max", ms: 0 }, { label: "60fps", ms: 16 }, { label: "30fps", ms: 33 }] as const).map(({ label, ms }) => (
                <button
                  key={ms}
                  type="button"
                  className={`main-preferences-option main-preferences-option-sm${settings.inputThrottleMs === ms ? " is-active" : ""}`}
                  onClick={() => update({ inputThrottleMs: ms })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Manette</span>
            <input
              type="range"
              className="pref-slider"
              min={1}
              max={100}
              step={1}
              value={Math.round(settings.virtualGamepadSensitivity * 1000)}
              onChange={(e) => update({ virtualGamepadSensitivity: Number(e.target.value) / 1000 })}
              style={{ maxWidth: 132 }}
            />
          </div>
        </div>

        <div className="main-preferences-group">
          <p className="main-preferences-group-title">Affichage</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Image</span>
            <div className="main-preferences-options main-preferences-options-inline">
              {(["contain", "cover"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`main-preferences-option main-preferences-option-sm${settings.displayMode === mode ? " is-active" : ""}`}
                  onClick={() => update({ displayMode: mode })}
                >
                  {mode === "contain" ? "Letterbox" : "Plein"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Stats</span>
            <button
              type="button"
              className={`main-preferences-toggle-pill${settings.showStats ? " is-on" : ""}`}
              onClick={() => update({ showStats: !settings.showStats })}
              aria-pressed={settings.showStats}
            >
              <span className="pref-toggle-pill-knob" />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Basse latence</span>
            <button
              type="button"
              className={`main-preferences-toggle-pill${settings.lowLatencyMode ? " is-on" : ""}`}
              onClick={() => update({ lowLatencyMode: !settings.lowLatencyMode })}
              aria-pressed={settings.lowLatencyMode}
            >
              <span className="pref-toggle-pill-knob" />
            </button>
          </div>
        </div>

        <div className="main-preferences-group">
          <p className="main-preferences-group-title">Qualité Recto</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Codec</span>
            <div className="main-preferences-options main-preferences-options-inline">
              {(["auto", "H264", "H265", "AV1"] as const).map((codec) => (
                <button
                  key={codec}
                  type="button"
                  className={`main-preferences-option main-preferences-option-sm${settings.requestedCodec === codec ? " is-active" : ""}`}
                  onClick={() => update({ requestedCodec: codec })}
                >
                  {codec === "auto" ? "Auto" : codec}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>FPS</span>
            <div className="main-preferences-options main-preferences-options-inline">
              {([30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  className={`main-preferences-option main-preferences-option-sm${settings.requestedFps === fps ? " is-active" : ""}`}
                  onClick={() => update({ requestedFps: fps })}
                >
                  {fps}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>{bitrateLabel(settings.requestedBitrateKbps)}</span>
            <input
              type="range"
              className="pref-slider"
              min={0}
              max={80}
              step={1}
              value={settings.requestedBitrateKbps ? Math.min(80, settings.requestedBitrateKbps / 1000) : 0}
              onChange={(e) => {
                const value = Number(e.target.value);
                update({ requestedBitrateKbps: value === 0 ? null : value * 1000 });
              }}
              style={{ maxWidth: 132 }}
            />
          </div>
        </div>

        <div className="main-preferences-group">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/settings");
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-2)",
              background: "var(--bg-alt)",
              color: "var(--tx)",
              cursor: "pointer",
              fontSize: "0.88rem",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              transition: "background 160ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-alt)")}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M8.5 3H11.5L12.2 5.3C12.8 5.5 13.4 5.8 13.9 6.2L16.2 5.5L17.7 8L15.9 9.5C16 9.8 16 10.1 16 10.5C16 10.8 16 11.1 15.9 11.5L17.7 13L16.2 15.5L13.9 14.8C13.4 15.2 12.8 15.5 12.2 15.7L11.5 18H8.5L7.8 15.7C7.2 15.5 6.6 15.2 6.1 14.8L3.8 15.5L2.3 13L4.1 11.5C4 11.1 4 10.8 4 10.5C4 10.1 4 9.8 4.1 9.5L2.3 8L3.8 5.5L6.1 6.2C6.6 5.8 7.2 5.5 7.8 5.3L8.5 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="10" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Paramètres
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ color: "var(--tx-3)" }}>
              <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {user && (
          <div className="main-preferences-user">
            {avatar
              ? <img src={avatar} alt={name} className="main-preferences-avatar" />
              : <div className="main-preferences-avatar main-preferences-avatar-initials">{name[0]?.toUpperCase()}</div>
            }
            <div className="main-preferences-user-info">
              <div className="main-preferences-username">{name}</div>
              {user.email && <div className="main-preferences-email">{user.email}</div>}
            </div>
          </div>
        )}

        {user && (
          <button type="button" className="main-preferences-logout" onClick={handleLogout}>
            Se déconnecter
          </button>
        )}
      </div>
    </aside>
  );
}
