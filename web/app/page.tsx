import Image from "next/image";
import Link from "next/link";
import { createClient } from "../lib/supabase-server";
import PreferencesDrawer from "../components/PreferencesDrawer";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="main-page">
      {/* ── Header ── */}
      <header className="main-header">
        <Image
          src="/assets/desktop-computer.png"
          alt="Recto"
          width={72}
          height={72}
          className="main-logo"
          priority
          style={{ imageRendering: "auto" }}
        />
      </header>

      {/* ── Intro ── */}
      <h1 className="main-intro">
        <span className="main-line">Vois l&apos;écran de n&apos;importe quel PC</span>
        <span className="main-line">en quelques secondes.</span>
      </h1>

      {/* ── Body ── */}
      <p className="main-body">
        Partage un code, connecte-toi. Pas d&apos;inscription, pas d&apos;installation côté client,
        pas de serveur qui se souvient de toi. Recto et Verso se trouvent directement —
        et dès que c&apos;est fait, tout passe entre vos deux PC.
      </p>

      {/* ── Actions ── */}
      <div className="main-actions">
        {user ? (
          <Link href="/verso" className="main-button main-button-primary is-accent recto-cta">
            Rejoindre en Verso
          </Link>
        ) : (
          <Link href="/login" className="main-button main-button-primary is-accent recto-cta">
            Commencer
          </Link>
        )}
        <a href="#comment" className="main-button main-button-secondary">
          Comment ça marche
        </a>
      </div>

      {/* ── Meta ── */}
      <div className="main-meta">
        <span className="main-meta-chip">
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: "#d97757", flexShrink: 0,
            boxShadow: "0 0 0 3px rgba(217,119,87,0.18)",
            display: "inline-block",
            animation: "recto-pulse 2.5s ease-in-out infinite",
          }} />
          Gratuit · Sans compte · Connexion directe
        </span>
      </div>

      {/* ── Recto / Verso ── */}
      <section className="main-collaboration">
        <h2 className="main-collaboration-title">Deux rôles, une idée simple.</h2>

        <div className="main-experience-list">
          <div className="main-experience-row">
            <div className="main-experience-company">
              <span style={{
                fontFamily: "var(--font-serif)", fontSize: "1.15rem",
                fontStyle: "italic", letterSpacing: "-0.02em",
              }}>Recto</span>
              <span style={{
                fontSize: "0.76rem", padding: "2px 9px",
                background: "rgba(217,119,87,0.08)",
                border: "1px solid rgba(217,119,87,0.18)",
                borderRadius: "999px", color: "#c4623e",
                fontWeight: 500,
              }}>Hôte</span>
            </div>
            <div className="main-experience-content">
              <div className="main-experience-main">
                <h2>Le PC qui partage son écran</h2>
                <p>
                  Recto, c&apos;est toi. Tu ouvres l&apos;app Windows, tu partages ce que tu veux,
                  et tu reçois un code. Ton PC fait tourner le flux — personne d&apos;autre n&apos;y touche.
                </p>
              </div>
              <span className="main-experience-period">App Windows</span>
            </div>
          </div>

          <div className="main-experience-row">
            <div className="main-experience-company">
              <span style={{
                fontFamily: "var(--font-serif)", fontSize: "1.15rem",
                fontStyle: "italic", letterSpacing: "-0.02em",
              }}>Verso</span>
              <span style={{
                fontSize: "0.76rem", padding: "2px 9px",
                background: "rgba(18,18,18,0.05)",
                border: "1px solid rgba(18,18,18,0.1)",
                borderRadius: "999px", color: "#6d6057",
                fontWeight: 500,
              }}>Client</span>
            </div>
            <div className="main-experience-content">
              <div className="main-experience-main">
                <h2>Le PC (ou navigateur) qui reçoit</h2>
                <p>
                  Verso, c&apos;est l&apos;autre personne. Elle entre le code dans l&apos;app ou sur ce site —
                  et voit ton écran en direct. Elle peut même prendre le contrôle clavier et souris.
                </p>
              </div>
              <span className="main-experience-period">App ou web</span>
            </div>
          </div>

          <div className="main-experience-row" style={{ background: "transparent", cursor: "default" }}>
            <div className="main-experience-company">
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.78rem",
                color: "#a39589", letterSpacing: "0.02em",
              }}>Pourquoi ces noms ?</span>
            </div>
            <div className="main-experience-content">
              <div className="main-experience-main">
                <p style={{ fontStyle: "italic" }}>
                  Recto et Verso, c&apos;est le recto et le verso d&apos;une feuille.
                  Le Recto montre, le Verso reçoit. Simple.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section id="comment" className="main-collaboration">
        <h2 className="main-collaboration-title">Aussi simple que ça.</h2>

        <div className="main-experience-list">
          {[
            {
              num: "01",
              title: "Tu ouvres Recto sur ton PC",
              desc: "Lance l'app, clique sur partager, choisis ce que tu veux montrer. Un code apparaît.",
              badge: "App Windows",
            },
            {
              num: "02",
              title: "Tu envoies le code",
              desc: "Six lettres. Par Discord, SMS, ou à voix haute. L'autre personne l'entre sur son téléphone ou navigateur.",
              badge: "Expire en 15 min",
            },
            {
              num: "03",
              title: "La connexion se fait toute seule",
              desc: "Pas de configuration réseau, pas de port à ouvrir. Ça marche derrière n'importe quel routeur.",
              badge: "Navigateur ou app",
            },
          ].map((step) => (
            <div key={step.num} className="main-experience-row">
              <div className="main-experience-company">
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.82rem",
                  fontWeight: 400, color: "#a39589",
                }}>
                  {step.num}
                </span>
                <span style={{
                  fontSize: "0.78rem", padding: "2px 10px",
                  background: "rgba(217,119,87,0.08)",
                  border: "1px solid rgba(217,119,87,0.18)",
                  borderRadius: "999px", color: "#c4623e",
                  fontWeight: 500, letterSpacing: "-0.01em",
                }}>
                  {step.badge}
                </span>
              </div>
              <div className="main-experience-content">
                <div className="main-experience-main">
                  <h2>{step.title}</h2>
                  <p>{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pourquoi Recto ── */}
      <section className="main-collaboration">
        <h2 className="main-collaboration-title">Pourquoi Recto.</h2>

        <div className="main-experience-list">
          {[
            {
              label: "Instantané",
              period: "< 3 secondes",
              desc: "De « j'ouvre l'app » à « tu vois mon écran » en moins de 3 secondes. Pas de salle d'attente, pas de chargement.",
            },
            {
              label: "Privé",
              period: "Chiffré E2E",
              desc: "Ta vidéo ne passe jamais par nos serveurs. Elle va directement de ton PC à celui de l'autre personne, et personne d'autre ne peut la voir.",
            },
            {
              label: "Fluide",
              period: "Jusqu'à 60 FPS",
              desc: "Assez rapide pour du jeu vidéo, assez clair pour du code, assez fiable pour une démo client.",
            },
            {
              label: "Contrôle total",
              period: "Clavier & souris",
              desc: "La personne en Verso peut prendre la main sur ton PC — comme si elle était là, mais à l'autre bout du monde.",
            },
          ].map((row) => (
            <div key={row.label} className="main-experience-row">
              <div className="main-experience-company">
                <span>{row.label}</span>
              </div>
              <div className="main-experience-content">
                <div className="main-experience-main">
                  <p>{row.desc}</p>
                </div>
                <span className="main-experience-period">{row.period}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="main-footer">
        <div className="main-footer-inner">
          <span className="main-footer-link" style={{ cursor: "default" }}>
            Recto © 2026
          </span>
          <div style={{ display: "flex", gap: "16px" }}>
            <Link href="/verso" className="main-footer-link">
              Verso →
            </Link>
            <a
              href="https://github.com/kirosnn/Recto"
              target="_blank"
              rel="noopener noreferrer"
              className="main-footer-link"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>

      <PreferencesDrawer user={user as Parameters<typeof PreferencesDrawer>[0]["user"]} />

      <style>{`
        @keyframes recto-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(217,119,87,0.18); }
          50%       { box-shadow: 0 0 0 5px rgba(217,119,87,0.08); }
        }
        .recto-cta {
          transition: box-shadow 180ms ease, transform 180ms ease !important;
        }
        .recto-cta:hover  { transform: scale(1.03); }
        .recto-cta:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}
