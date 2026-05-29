"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase-browser";
import DiscordIcon from "../../components/DiscordIcon";

export default function LoginButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      if (next) {
        document.cookie = `recto-next=${encodeURIComponent(next)}; Path=/; Max-Age=300; SameSite=Lax`;
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) throw error;
      if (data.url) window.location.assign(data.url);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogin}
      disabled={loading}
      className={`main-button main-button-primary is-accent${loading ? " is-loading" : ""}`}
      style={{ width: "100%", minHeight: "50px", fontSize: "1rem", opacity: loading ? 0.7 : 1 }}
    >
      {loading ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.8s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <DiscordIcon size={20} />
      )}
      {loading ? "Redirection…" : "Continuer avec Discord"}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
