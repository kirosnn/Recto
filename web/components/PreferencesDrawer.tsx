"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase-browser";
import { useTheme } from "./ThemeProvider";
import { useWebSettings } from "../lib/webSettings";

type User = {
  user_metadata: { full_name?: string; avatar_url?: string };
  email?: string;
};

export default function PreferencesDrawer({ user }: { user?: User }) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { settings, update } = useWebSettings();

  const isVerso = pathname?.includes("/verso");

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
        <svg className="main-preferences-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

        {isVerso && (
          <>
            {/* ── Entrée (client) ── */}
            <div className="main-preferences-group">
              <p className="main-preferences-group-title">Entrée</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.45rem" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--tx-2, #6d6057)" }}>Souris</span>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  {([{ label: "Max", ms: 0 }, { label: "60fps", ms: 16 }, { label: "30fps", ms: 33 }] as const).map(({ label, ms }) => (
                    <button
                      key={ms}
                      type="button"
                      className={`main-preferences-option${settings.inputThrottleMs === ms ? " is-active" : ""}`}
                      style={{ minHeight: 28, padding: "0 9px", fontSize: "0.8rem" }}
                      onClick={() => update({ inputThrottleMs: ms })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Affichage (client) ── */}
            <div className="main-preferences-group">
              <p className="main-preferences-group-title">Affichage</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--tx-2, #6d6057)" }}>Ajustement</span>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  {(["contain", "cover"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`main-preferences-option${settings.displayMode === m ? " is-active" : ""}`}
                      style={{ minHeight: 28, padding: "0 9px", fontSize: "0.8rem" }}
                      onClick={() => update({ displayMode: m })}
                    >
                      {m === "contain" ? "Letterbox" : "Plein"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.45rem" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--tx-2, #6d6057)" }}>Stats overlay</span>
                <button
                  type="button"
                  style={{
                    width: 36, height: 20, borderRadius: 999, border: "none", padding: 0,
                    background: settings.showStats ? "#d97757" : "rgba(18,18,18,0.14)",
                    cursor: "pointer", position: "relative", transition: "background 200ms",
                  }}
                  onClick={() => update({ showStats: !settings.showStats })}
                >
                  <span style={{
                    display: "block", width: 14, height: 14, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, left: settings.showStats ? 19 : 3,
                    transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
            </div>
          </>
        )}

        {user && (
          <div className="main-preferences-user">
            {avatar
              ? <img src={avatar} alt={name} className="main-preferences-avatar" />
              : <div className="main-preferences-avatar" style={{
                  background: "linear-gradient(135deg, #d97757, #c4623e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "13px", fontWeight: 700, color: "white",
                }}>
                  {name[0]?.toUpperCase()}
                </div>
            }
            <div>
              <div className="main-preferences-username">{name}</div>
              <div className="main-preferences-email">{user.email}</div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="main-preferences-logout"
          style={{ background: "transparent", color: "var(--tx-2)", border: "1px solid var(--border-2)" }}
        >
          Paramètres complets
        </button>

        {user && (
          <button type="button" className="main-preferences-logout" onClick={handleLogout}>
            Se déconnecter
          </button>
        )}
      </div>
    </aside>
  );
}
