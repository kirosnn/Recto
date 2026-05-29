import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";
import DiscordIcon from "../components/DiscordIcon";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { theme, toggle } = useTheme();

  const handleLogin = async () => {
    setLoading(true);
    try {
      // redirectTo = origin courant → http://localhost:5173 (dev) ou tauri://localhost (prod)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true, // on gère la navigation nous-mêmes
        },
      });
      if (error) throw error;
      if (data.url) {
        // Naviguer le WebView Tauri directement vers Discord OAuth
        window.location.href = data.url;
      }
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
            <DiscordIcon size={20} />
          )}
          {loading ? "Connexion…" : "Continuer avec Discord"}
        </button>

        <p style={{ marginTop: 14, fontSize: "0.76rem", color: "var(--tx-3)", textAlign: "center", lineHeight: 1.6 }}>
          Ton pseudo Discord sera utilisé. Aucun mot de passe stocké.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
