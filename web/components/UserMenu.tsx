"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase-browser";
import { useRouter } from "next/navigation";

type User = {
  user_metadata: { full_name?: string; avatar_url?: string; custom_claims?: { global_name?: string } };
  email?: string;
};

export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.custom_claims?.global_name ||
    user.email?.split("@")[0] || "Utilisateur";

  const avatar = user.user_metadata?.avatar_url;

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "5px 10px 5px 6px", borderRadius: "20px",
          border: "1px solid var(--border)", background: "transparent",
          cursor: "pointer", transition: "background 180ms ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--border)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {avatar
          ? <img src={avatar} alt={name} style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{
              width: "22px", height: "22px", borderRadius: "50%",
              background: "var(--accent-dim)", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 600, color: "var(--accent)",
            }}>{name[0].toUpperCase()}</div>
        }
        <span style={{ fontSize: "0.88rem", color: "var(--tx-2)", letterSpacing: "-0.01em" }}>{name}</span>
        <span style={{ fontSize: "10px", color: "var(--tx-3)", lineHeight: 1 }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20,
            width: "200px", borderRadius: "14px",
            border: "1px solid var(--border-2)",
            background: "var(--surface)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            boxShadow: "var(--shadow-md)", overflow: "hidden",
          }}>
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--tx)", letterSpacing: "-0.01em" }}>{name}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--tx-3)", marginTop: "2px" }}>{user.email}</div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px",
                fontSize: "0.88rem", color: "var(--accent)",
                background: "transparent", border: "none", cursor: "pointer",
                transition: "background 150ms ease", letterSpacing: "-0.01em",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-dim)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
