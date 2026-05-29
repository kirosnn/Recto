import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { theme, toggle } = useTheme();

  const handleLogin = async () => {
    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: "recto://auth/callback",
          skipBrowserRedirect: false,
        },
      });
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ gap: 28 }}>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{
          position: "absolute", top: 10, right: 10,
          width: 32, height: 32, borderRadius: 8,
          border: "1px solid var(--border-2)", background: "transparent",
          cursor: "pointer", color: "var(--tx-3)", fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title={theme === "dark" ? "Thème clair" : "Thème sombre"}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>

      <div style={{ textAlign: "center" }}>
        <img
          src="/assets/desktop-computer_1f5a5-fe0f.png"
          alt="Recto"
          style={{ width: 56, height: 56, margin: "0 auto 16px", display: "block" }}
        />
        <h1 className="serif" style={{
          fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
          letterSpacing: "-0.04em", color: "var(--tx)",
        }}>
          Bienvenue.
        </h1>
        <p style={{ marginTop: 8, fontSize: "0.88rem", color: "var(--tx-2)", lineHeight: 1.5 }}>
          Connecte-toi avec Discord pour continuer.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 300 }}>
        <button
          className="btn"
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%", minHeight: 44,
            background: loading ? "rgba(88,101,242,0.7)" : "#5865F2",
            color: "white", border: "1px solid rgba(88,101,242,0.3)",
            boxShadow: "0 2px 8px rgba(88,101,242,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
            opacity: loading ? 0.7 : 1,
            gap: 10, fontSize: "0.95rem",
          }}
        >
          {loading ? (
            <span style={{
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white",
              display: "inline-block", animation: "spin 0.75s linear infinite",
            }} />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
          )}
          {loading ? "Ouverture du navigateur…" : "Continuer avec Discord"}
        </button>

        <p style={{ marginTop: 14, fontSize: "0.76rem", color: "var(--tx-3)", textAlign: "center", lineHeight: 1.6 }}>
          Ton pseudo Discord sera utilisé. Aucun mot de passe stocké.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
