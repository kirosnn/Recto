"use client";

import { useTheme } from "../components/ThemeProvider";
import { useWebSettings } from "../lib/webSettings";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { settings, update } = useWebSettings();

  return (
    <div style={{ minHeight: "100vh", padding: "clamp(56px,6vw,72px) clamp(16px,4vw,32px) 48px" }}>
      <button onClick={() => router.back()} className="back-btn" aria-label="Retour">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={{ maxWidth: 540, margin: "0 auto" }}>
        <h1 className="serif" style={{ fontSize: "clamp(1.8rem,3vw,2.4rem)", letterSpacing: "-0.04em", marginBottom: "clamp(28px,4vw,40px)" }}>
          Paramètres.
        </h1>

        <Section label="Général">
          <Row label="Thème" last>
            <div className="pref-options pref-options-inline">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`pref-option pref-option-sm${theme === t ? " is-active" : ""}`}
                  onClick={() => { if (theme !== t) toggle(); }}
                >
                  {t === "dark" ? "Sombre" : "Clair"}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section label="Client · Verso" sub="Paramètres de contrôle à distance">
          <Row label="Latence souris">
            <div className="pref-options pref-options-inline">
              {([
                { label: "Max", ms: 0 },
                { label: "60fps", ms: 16 },
                { label: "30fps", ms: 33 },
              ] as const).map(({ label, ms }) => (
                <button
                  key={ms}
                  type="button"
                  className={`pref-option pref-option-sm${settings.inputThrottleMs === ms ? " is-active" : ""}`}
                  onClick={() => update({ inputThrottleMs: ms })}
                >
                  {label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Ajustement vidéo">
            <div className="pref-options pref-options-inline">
              {(["contain", "cover"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`pref-option pref-option-sm${settings.displayMode === m ? " is-active" : ""}`}
                  onClick={() => update({ displayMode: m })}
                >
                  {m === "contain" ? "Letterbox" : "Plein"}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Stats overlay" last>
            <button
              type="button"
              className={`pref-toggle-pill${settings.showStats ? " is-on" : ""}`}
              onClick={() => update({ showStats: !settings.showStats })}
              aria-pressed={settings.showStats}
            >
              <span className="pref-toggle-pill-knob" />
            </button>
          </Row>
        </Section>

        <p style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--tx-3)", marginTop: 8 }}>
          WinDirector · Web
        </p>
      </div>
    </div>
  );
}

function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--tx-3)" }}>
          {label}
        </span>
        {sub && <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--tx-3)" }}>{sub}</p>}
      </div>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: 16,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "13px 18px",
      borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      <span style={{ fontSize: "0.88rem", color: "var(--tx)", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
