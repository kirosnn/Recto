import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PreferencesDrawer from "../components/PreferencesDrawer";
import DiscordIcon from "../components/DiscordIcon";
import { open } from "@tauri-apps/plugin-shell";
import { isTauri } from "@tauri-apps/api/core";

function getDesktopRedirectTo() {
  if (window.location.port === "5173") return "recto-dev-recto://auth/callback";
  if (window.location.port === "5174") return "recto-dev-verso://auth/callback";

  return (import.meta.env.VITE_DESKTOP_AUTH_CALLBACK_URL as string | undefined) ?? "recto://auth/callback";
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const runningInTauri = isTauri();
      const redirectTo = runningInTauri
        ? getDesktopRedirectTo()
        : `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data.url) {
        if (runningInTauri) {
          await open(data.url);
          setLoading(false);
        } else {
          window.location.href = data.url;
        }
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ gap: 28 }}>
      <PreferencesDrawer />

      <div style={{ textAlign: "center" }}>
        <img
          src="/assets/desktop-computer.png"
          alt="Recto"
          style={{ width: 56, height: 56, margin: "0 auto 16px", display: "block", objectFit: "contain" }}
        />
        <h1 className="serif" style={{
          fontSize: "clamp(1.4rem, 2.8vw, 2rem)",
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
