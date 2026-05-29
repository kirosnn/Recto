import { useNavigate } from "react-router-dom";
import PreferencesDrawer from "../components/PreferencesDrawer";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="page" style={{ gap: "clamp(24px, 3.5vw, 40px)" }}>
      <PreferencesDrawer />

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
          icon="/assets/rectoenvoi.png"
          title="Recto"
          desc="Partage ton écran. Les autres se connectent avec ton code."
          cta="Démarrer le partage →"
          onClick={() => navigate("/recto")}
        />
        <ModeCard
          icon="/assets/versorecu.png"
          title="Verso"
          desc="Entre le code de l'hôte pour voir son écran en direct."
          cta="Se connecter →"
          onClick={() => navigate("/verso")}
        />
      </div>

    </div>
  );
}

function ModeCard({ icon, title, desc, cta, onClick }: {
  icon: string; title: string; desc: string; cta: string; onClick: () => void;
}) {
  return (
    <button className="mode-card" onClick={onClick}>
      <img src={icon} alt={title} style={{ width: 48, height: 48, objectFit: "contain" }} />
      <div>
        <h3 className="serif" style={{ fontSize: "1.2rem", fontStyle: "italic" }}>{title}</h3>
        <p style={{ marginTop: 4 }}>{desc}</p>
      </div>
      <span className="mode-card-cta">{cta}</span>
    </button>
  );
}
