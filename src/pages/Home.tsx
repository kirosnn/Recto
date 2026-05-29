import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "../components/ThemeToggle";

export default function Home() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const name = user?.user_metadata?.full_name
    || user?.user_metadata?.custom_claims?.global_name
    || user?.email?.split("@")[0] || "";
  const avatar = user?.user_metadata?.avatar_url;

  return (
    <div className="page" style={{ gap: "clamp(24px, 3.5vw, 40px)" }}>
      {/* Top bar */}
      <div style={{
        position: "absolute", top: 10, right: 10,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <ThemeToggle />
        {user && (
          <button
            onClick={signOut}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "4px 10px 4px 6px", borderRadius: 20,
              border: "1px solid var(--border-2)", background: "transparent",
              cursor: "pointer", fontSize: "0.82rem", color: "var(--tx-2)",
              transition: "background 180ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {avatar
              ? <img src={avatar} alt={name} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{name[0]?.toUpperCase()}</div>
            }
            {name}
          </button>
        )}
      </div>

      {/* Logo + titre */}
      <div style={{ textAlign: "center" }}>
        <img
          src="/assets/desktop-computer_1f5a5-fe0f.png"
          alt="Recto"
          style={{ width: 60, height: 60, margin: "0 auto 14px", display: "block" }}
        />
        <h1 className="serif" style={{
          fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
          letterSpacing: "-0.04em", lineHeight: 1.05, color: "var(--tx)",
        }}>
          Partage ton écran,<br />
          <em style={{ color: "var(--accent)" }}>sans serveur.</em>
        </h1>
        <p style={{
          marginTop: 10, fontSize: "0.9rem",
          color: "var(--tx-2)", lineHeight: 1.55,
          maxWidth: 340, margin: "10px auto 0",
        }}>
          Recto partage. Verso reçoit. Un code suffit.
        </p>
      </div>

      {/* Mode cards */}
      <div className="mode-cards">
        <ModeCard
          badge="Hôte"
          badgeAccent
          title="Recto"
          desc="Partage ton écran. Les autres se connectent avec ton code."
          cta="Démarrer le partage →"
          onClick={() => navigate("/recto")}
        />
        <ModeCard
          badge="Client"
          title="Verso"
          desc="Entre le code de l'hôte pour voir son écran en direct."
          cta="Se connecter →"
          onClick={() => navigate("/verso")}
        />
      </div>

      <p style={{ fontSize: "0.76rem", color: "var(--tx-3)", letterSpacing: "0.01em" }}>
        WebRTC P2P · Signaling Supabase · Chiffré E2E
      </p>
    </div>
  );
}

function ModeCard({ badge, badgeAccent, title, desc, cta, onClick }: {
  badge: string; badgeAccent?: boolean; title: string;
  desc: string; cta: string; onClick: () => void;
}) {
  return (
    <button className="mode-card" onClick={onClick}>
      <span className={`mode-card-badge${badgeAccent ? " is-accent" : ""}`}>{badge}</span>
      <div>
        <h3 className="serif" style={{ fontSize: "1.2rem", fontStyle: "italic" }}>{title}</h3>
        <p style={{ marginTop: 4 }}>{desc}</p>
      </div>
      <span className="mode-card-cta">{cta}</span>
    </button>
  );
}
