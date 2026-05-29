import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handle = async () => {
      // Supabase PKCE flow → ?code=...
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      } else {
        // Implicit flow → #access_token=...
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const access_token  = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }

      navigate("/", { replace: true });
    };

    handle();
  }, [navigate]);

  return (
    <div className="page">
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        border: "2.5px solid var(--border-2)", borderTopColor: "var(--accent)",
        animation: "spin 0.75s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
