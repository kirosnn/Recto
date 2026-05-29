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
          src="/assets/logo.png"
          alt="Recto"
          width={64}
          height={64}
          className="main-logo"
          priority
        />
      </header>

      {/* ── Intro ── */}
      <h1 className="main-intro">
        <span className="main-line">Partage d&apos;écran de PC à PC,</span>
        <span className="main-line">sans serveur intermédiaire.</span>
      </h1>

      {/* ── Body ── */}
      <p className="main-body">
        Recto transforme ton PC en hôte de streaming. Verso s&apos;y connecte
        via un code à 6 caractères — depuis l&apos;app Windows ou le navigateur.
        Connexion P2P WebRTC chiffrée de bout en bout, signaling via Supabase Realtime.
      </p>

      {/* ── Actions ── */}
      <div className="main-actions">
        {user ? (
          <Link href="/verso" className="main-button main-button-primary is-accent">
            Rejoindre en Verso
          </Link>
        ) : (
          <Link href="/login" className="main-button main-button-primary is-accent">
            Se connecter
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
            boxShadow: "0 0 0 2px rgba(217,119,87,0.2)",
            display: "inline-block",
          }} />
          Bêta · Connexion directe · Zéro relais
        </span>
      </div>

      {/* ── Comment ça marche ── */}
      <section id="comment" className="main-collaboration">
        <h2 className="main-collaboration-title">Comment ça marche.</h2>

        <div className="main-experience-list">
          {[
            {
              num: "01",
              title: "Lance Recto sur le PC hôte",
              desc: "Ouvre l'app Windows, clique « Partager mon écran » et sélectionne la fenêtre ou l'écran à partager.",
              badge: "App Windows",
            },
            {
              num: "02",
              title: "Partage le code à 6 caractères",
              desc: "Recto génère un code unique valable 15 minutes. Envoie-le par Discord, message, ou autre.",
              badge: "Ex : AB3XK7",
            },
            {
              num: "03",
              title: "Verso se connecte et voit l'écran",
              desc: "Le client saisit le code dans l'app ou ici dans le navigateur. La connexion P2P s'établit directement.",
              badge: "App ou navigateur",
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

      {/* ── Sous le capot ── */}
      <section className="main-collaboration">
        <h2 className="main-collaboration-title">Sous le capot.</h2>

        <div className="main-experience-list">
          {[
            { label: "Signaling",     period: "Supabase",  desc: "SDP + ICE échangés via Supabase Realtime. Aucun serveur de relais — juste un canal temps réel qui sort de la boucle une fois connecté." },
            { label: "NAT Traversal", period: "STUN/ICE",  desc: "ICE + STUN (Google) trouve la route directe entre les deux machines, même derrière un NAT strict ou un pare-feu." },
            { label: "Stream",        period: "WebRTC E2E", desc: "Vidéo (60 FPS) et audio circulent directement de Recto à Verso, chiffrés de bout en bout. Supabase ne touche pas le flux." },
            { label: "Input",         period: "SendInput",  desc: "Clavier et souris capturés chez Verso, injectés côté Recto via l'API Windows SendInput — latence < 5ms en LAN." },
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

      {/* ── Preferences Drawer ── */}
      <PreferencesDrawer user={user as Parameters<typeof PreferencesDrawer>[0]["user"]} />
    </div>
  );
}
