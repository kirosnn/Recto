import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/useAuth";

export default function PreferencesDrawer() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();

  const name = user?.user_metadata?.full_name
    || user?.user_metadata?.custom_claims?.global_name
    || user?.email?.split("@")[0] || "";
  const avatar = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <aside className={`pref-drawer${open ? " is-open" : ""}`} aria-label="Préférences">
      <button
        type="button"
        className="pref-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer" : "Préférences"}
      >
        <svg className="pref-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="pref-panel">
        <p className="pref-title">Préférences</p>

        <div className="pref-group">
          <p className="pref-group-title">Thème</p>
          <div className="pref-options">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`pref-option${theme === t ? " is-active" : ""}`}
                onClick={() => { if (theme !== t) toggle(); }}
              >
                {t === "dark" ? "Sombre" : "Clair"}
              </button>
            ))}
          </div>
        </div>

        {user && (
          <div className="pref-user">
            {avatar
              ? <img src={avatar} alt={name} className="pref-avatar" />
              : <div className="pref-avatar pref-avatar-initials">
                  {name[0]?.toUpperCase()}
                </div>
            }
            <div className="pref-user-info">
              <div className="pref-username">{name}</div>
              {user.email && <div className="pref-email">{user.email}</div>}
            </div>
          </div>
        )}

        {user && (
          <button type="button" className="pref-logout" onClick={signOut}>
            Se déconnecter
          </button>
        )}
      </div>
    </aside>
  );
}
