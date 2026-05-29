"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase-browser";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeProvider";

type User = {
  user_metadata: { full_name?: string; avatar_url?: string };
  email?: string;
};

export default function PreferencesDrawer({ user }: { user?: User }) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const router = useRouter();
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

        {user && (
          <button type="button" className="main-preferences-logout" onClick={handleLogout}>
            Se déconnecter
          </button>
        )}
      </div>
    </aside>
  );
}
