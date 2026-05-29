import { useNavigate } from "react-router-dom";
import PreferencesDrawer from "../components/PreferencesDrawer";
import { useRectoSession } from "../context/RectoSessionContext";

export default function Home() {
  const navigate = useNavigate();
  const { status, code } = useRectoSession();
  const isSharing = status === "waiting" || status === "connected";

  return (
    <div className="page" style={{ gap: "clamp(24px, 3.5vw, 40px)" }}>
      <PreferencesDrawer />

      {/* Logo + titre */}
      <div style={{ textAlign: "center" }}>
        <img
          src="/assets/desktop-computer.png"
          alt="Recto"
          style={{
            width: 60,
            height: 60,
            margin: "0 auto 14px",
            display: "block",
            objectFit: "contain",
          }}
        />
        <h1
          className="serif"
          style={{
            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            color: "var(--tx)",
          }}
        >
          Partage ton écran,
          <br />
          <em style={{ color: "var(--accent)" }}>sans serveur.</em>
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: "0.9rem",
            color: "var(--tx-2)",
            lineHeight: 1.55,
            maxWidth: 340,
            margin: "10px auto 0",
          }}
        >
          Recto partage. Verso reçoit. Un code suffit.
        </p>
      </div>

      {/* Bannière session active */}
      {isSharing && (
        <button
          onClick={() => navigate("/recto")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            borderRadius: 12,
            border: "1px solid rgba(76,175,125,0.25)",
            background: "rgba(76,175,125,0.08)",
            cursor: "pointer",
            width: "100%",
            maxWidth: 360,
            transition: "background 180ms ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(76,175,125,0.14)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(76,175,125,0.08)")
          }
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: "#4caf7d",
              boxShadow: "0 0 8px rgba(76,175,125,0.7)",
            }}
          />
          <span
            style={{
              flex: 1,
              textAlign: "left",
              fontSize: "0.85rem",
              color: "var(--tx)",
              fontWeight: 500,
            }}
          >
            Partage en cours
            {status === "connected" ? " · Connecté" : " · En attente"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.82rem",
              color: "var(--tx-2)",
              letterSpacing: "0.06em",
            }}
          >
            {code}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ color: "var(--tx-3)", flexShrink: 0 }}
          >
            <path
              d="M5 2.5L9.5 7L5 11.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

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
          cta="Se connecter"
          onClick={() => navigate("/verso")}
        />
      </div>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  cta,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button className="mode-card" onClick={onClick}>
      <img
        src={icon}
        alt={title}
        style={{ width: 48, height: 48, objectFit: "contain" }}
      />
      <div>
        <h3
          className="serif"
          style={{ fontSize: "1.2rem", fontStyle: "italic" }}
        >
          {title}
        </h3>
        <p style={{ marginTop: 4 }}>{desc}</p>
      </div>
      <span className="mode-card-cta">{cta}</span>
    </button>
  );
}
