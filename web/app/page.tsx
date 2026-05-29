import Link from "next/link";
import { createClient } from "../lib/supabase-server";
import UserMenu from "../components/UserMenu";
import ThemeToggle from "../components/ThemeToggle";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Nav ───────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        gap: "6px", padding: "0 clamp(16px, 3vw, 32px)", height: "52px",
      }}>
        <ThemeToggle />
        {user
          ? <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
          : <Link href="/login" className="btn-ghost" style={{ fontSize: "0.88rem" }}>Se connecter</Link>
        }
      </nav>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section style={{
        maxWidth: "980px", margin: "0 auto",
        padding: "clamp(100px, 14vw, 160px) clamp(16px, 3vw, 32px) clamp(48px, 6vw, 80px)",
      }}>
        <div style={{ marginBottom: "1.4rem" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "7px",
            fontSize: "0.8rem", color: "var(--tx-2)",
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            <span style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "var(--accent)", display: "inline-block",
              animation: "pulse 2.5s ease-in-out infinite",
            }} />
            Bêta · Connexion P2P directe
          </span>
        </div>

        <h1 className="serif" style={{
          fontSize: "clamp(2.8rem, 7vw, 5.5rem)",
          lineHeight: "1.02", letterSpacing: "-0.03em",
          color: "var(--tx)", marginBottom: "1.6rem",
          maxWidth: "780px",
        }}>
          Partage d&apos;écran{" "}
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>sans serveur</em>
          ,<br />de PC à PC.
        </h1>

        <p style={{
          fontSize: "clamp(1rem, 1.8vw, 1.15rem)",
          color: "var(--tx-2)", lineHeight: 1.65,
          maxWidth: "520px", marginBottom: "2.4rem",
          letterSpacing: "-0.01em",
        }}>
          Recto transforme ton PC en hôte de streaming.
          Verso s&apos;y connecte via un code à 6 caractères —
          depuis l&apos;app Windows ou le navigateur.
        </p>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/verso" className="btn-primary">
            Rejoindre en Verso →
          </Link>
          <a href="#comment" className="btn-ghost">
            Comment ça marche
          </a>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        padding: "clamp(20px, 3vw, 32px) clamp(16px, 3vw, 32px)",
      }}>
        <div style={{
          maxWidth: "980px", margin: "0 auto",
          display: "flex", gap: "clamp(32px, 5vw, 64px)", flexWrap: "wrap",
        }}>
          {[
            ["60 FPS", "Stream fluide"],
            ["P2P", "Connexion directe"],
            ["E2E", "Chiffré WebRTC"],
            ["0", "Serveur relais"],
          ].map(([val, label]) => (
            <div key={label}>
              <div style={{
                fontFamily: "var(--font-geist-mono)", fontWeight: 600,
                fontSize: "clamp(1.2rem, 2.2vw, 1.6rem)",
                color: "var(--accent)", letterSpacing: "-0.02em",
              }}>{val}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--tx-3)", marginTop: "2px", letterSpacing: "0.01em" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tutorial ──────────────────────────────────────── */}
      <section id="comment" style={{
        maxWidth: "980px", margin: "0 auto",
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 3vw, 32px)",
      }}>
        <h2 className="serif" style={{
          fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
          letterSpacing: "-0.03em", marginBottom: "clamp(32px, 5vw, 56px)",
          color: "var(--tx)",
        }}>
          En 3 étapes.
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {[
            {
              n: "01",
              title: "Lance Recto sur le PC hôte",
              desc: "Ouvre l'app Recto sur Windows, clique « Partager mon écran » et sélectionne la fenêtre ou l'écran à partager.",
              note: "App Windows requis",
            },
            {
              n: "02",
              title: "Partage le code à 6 caractères",
              desc: "Recto génère un code unique. Envoie-le par Discord, message, ou autre au destinataire. Il expire après 15 minutes.",
              note: "Ex : AB3XK7",
            },
            {
              n: "03",
              title: "Verso entre le code et voit l'écran",
              desc: "Le client saisit le code dans l'app Windows ou ici dans le navigateur. La connexion P2P WebRTC s'établit directement.",
              note: "Navigateur ou app",
            },
          ].map((step, i, arr) => (
            <div key={step.n} style={{
              display: "grid",
              gridTemplateColumns: "minmax(52px, 64px) 1fr auto",
              gap: "0 24px", alignItems: "start",
              padding: "clamp(20px, 3vw, 28px) 0",
              borderTop: "1px solid var(--border)",
              ...(i === arr.length - 1 ? { borderBottom: "1px solid var(--border)" } : {}),
            }}>
              <span className="mono" style={{
                fontSize: "0.78rem", color: "var(--tx-3)",
                paddingTop: "4px", letterSpacing: "0.04em",
              }}>{step.n}</span>
              <div>
                <h3 style={{
                  fontSize: "clamp(1rem, 1.6vw, 1.15rem)",
                  fontWeight: 500, letterSpacing: "-0.02em",
                  color: "var(--tx)", marginBottom: "6px",
                }}>{step.title}</h3>
                <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", lineHeight: 1.6, maxWidth: "540px" }}>{step.desc}</p>
              </div>
              <span style={{
                fontSize: "0.78rem", color: "var(--tx-3)",
                background: "var(--bg-alt)", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "3px 10px",
                letterSpacing: "0.01em", whiteSpace: "nowrap",
                marginTop: "2px",
              }}>{step.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Under the hood ────────────────────────────────── */}
      <section style={{
        maxWidth: "980px", margin: "0 auto",
        padding: "0 clamp(16px, 3vw, 32px) clamp(48px, 8vw, 96px)",
      }}>
        <h2 className="serif" style={{
          fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
          letterSpacing: "-0.03em", marginBottom: "clamp(32px, 5vw, 56px)",
          color: "var(--tx)",
        }}>
          Sous le capot.
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {[
            { label: "Signaling",     desc: "SDP + candidats ICE échangés via Supabase Realtime. Aucun serveur de relais dédié — juste un canal temps réel.", accent: true },
            { label: "NAT Traversal", desc: "ICE + STUN (Google) trouve la route directe entre les deux machines, même derrière un NAT strict.", accent: false },
            { label: "Stream WebRTC", desc: "Vidéo et audio circulent directement de Recto à Verso, chiffrés E2E. Supabase sort de la boucle une fois connecté.", accent: false },
            { label: "Input (app)",   desc: "Clavier et souris capturés chez Verso, injectés côté Recto via l'API Windows SendInput. Latence < 5ms en LAN.", accent: false },
          ].map((row) => (
            <div key={row.label} style={{
              display: "grid", gridTemplateColumns: "minmax(120px, 150px) 1fr",
              gap: "0 24px", padding: "clamp(16px, 2.5vw, 22px) 0",
              borderTop: "1px solid var(--border)",
            }}>
              <span className="mono" style={{
                fontSize: "0.82rem", paddingTop: "2px",
                color: row.accent ? "var(--accent)" : "var(--tx-3)",
                letterSpacing: "0.01em",
              }}>{row.label}</span>
              <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", lineHeight: 1.65 }}>{row.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section style={{
        maxWidth: "980px", margin: "0 auto",
        padding: "clamp(32px, 5vw, 64px) clamp(16px, 3vw, 32px) clamp(64px, 10vw, 120px)",
        borderTop: "1px solid var(--border)",
      }}>
        <h2 className="serif" style={{
          fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
          letterSpacing: "-0.03em", color: "var(--tx)",
          marginBottom: "12px",
        }}>
          Prêt à te connecter ?
        </h2>
        <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", marginBottom: "24px" }}>
          Tu as reçu un code Recto ? Rejoins depuis le navigateur directement.
        </p>
        <Link href="/verso" className="btn-primary">Ouvrir Verso →</Link>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "20px clamp(16px, 3vw, 32px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "8px",
        maxWidth: "980px", margin: "0 auto",
      }}>
        <span className="mono" style={{ fontSize: "0.78rem", color: "var(--tx-3)" }}>
          Recto · WebRTC P2P
        </span>
        <span style={{ fontSize: "0.78rem", color: "var(--tx-3)" }}>
          Signaling via Supabase Realtime
        </span>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
