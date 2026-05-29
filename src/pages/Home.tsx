import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="page" style={{ gap: "clamp(28px, 4vw, 48px)" }}>
      {/* Logo + titre */}
      <div style={{ textAlign: "center" }}>
        <img
          src="/assets/desktop-computer_1f5a5-fe0f.png"
          alt="Recto"
          style={{ width: 64, height: 64, margin: "0 auto 16px", display: "block" }}
        />
        <h1 className="serif" style={{
          fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
          letterSpacing: "-0.04em", lineHeight: 1.05,
          color: "var(--tx)",
        }}>
          Partage ton écran,<br />
          <em style={{ color: "var(--accent)" }}>sans serveur.</em>
        </h1>
        <p style={{
          marginTop: 10, fontSize: "0.9rem",
          color: "var(--tx-2)", lineHeight: 1.55,
          maxWidth: 360, margin: "10px auto 0",
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

      {/* Footer */}
      <p style={{ fontSize: "0.76rem", color: "var(--tx-3)", letterSpacing: "0.01em" }}>
        WebRTC P2P · Signaling Supabase · Chiffré E2E
      </p>
    </div>
  );
}

function ModeCard({ badge, badgeAccent, title, desc, cta, onClick }: {
  badge: string;
  badgeAccent?: boolean;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button className="mode-card" onClick={onClick}>
      <span className={`mode-card-badge${badgeAccent ? " is-accent" : ""}`}>
        {badge}
      </span>
      <div>
        <h3 className="serif" style={{ fontSize: "1.2rem", fontStyle: "italic" }}>{title}</h3>
        <p style={{ marginTop: 4 }}>{desc}</p>
      </div>
      <span className="mode-card-cta">{cta}</span>
    </button>
  );
}
