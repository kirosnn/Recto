"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase-browser";
import { useTheme } from "./ThemeProvider";

type User = {
  user_metadata: { full_name?: string; avatar_url?: string };
  email?: string;
};

export default function PreferencesDrawer({ user }: { user?: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const supabase = createClient();

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
