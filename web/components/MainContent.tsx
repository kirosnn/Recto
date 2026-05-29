"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PreferencesDrawer from "./PreferencesDrawer";

// ── Variants copiés exactement du kirosnn-portifolio ──────────

const wordVariants = {
  hidden: {
    opacity: 0,
    filter: "blur(10px)",
  },
  visible: {
    opacity: [0, 0.42, 0.82, 1] as number[],
    filter: ["blur(10px)", "blur(13px)", "blur(5px)", "blur(0px)"],
    transition: {
      duration: 0.98,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
};

const riseInVariants = {
  hidden: {
    opacity: 0,
    y: 12,
    filter: "blur(8px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

const intro1 = ["Vois", "l'écran", "de", "n'importe", "quel", "PC"];
const intro2 = ["en", "quelques", "secondes."];
const bodyWords = [
  "Partage", "un", "code,", "connecte-toi.", "Pas", "d'inscription,",
  "pas", "d'installation", "côté", "client,", "pas", "de", "serveur",
  "qui", "se", "souvient", "de", "toi.", "Recto", "et", "Verso",
  "se", "trouvent", "directement", "—", "et", "dès", "que", "c'est",
  "fait,", "tout", "passe", "entre", "vos", "deux", "PC.",
];

type User = {
  user_metadata: { full_name?: string; avatar_url?: string };
  email?: string;
} | null;

const introDurationMs = 4100;

export default function MainContent({ user }: { user: User }) {
  const [isIntroComplete, setIsIntroComplete] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const lockClass = "main-page-scroll-locked";
    let frame = 0;

    const keepTop = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (root.classList.contains(lockClass) && window.scrollY !== 0) {
          window.scrollTo(0, 0);
        }
      });
    };

    root.classList.add(lockClass);
    window.scrollTo(0, 0);
    window.addEventListener("scroll", keepTop, { passive: true });

    const timer = window.setTimeout(() => {
      setIsIntroComplete(true);
      root.classList.remove(lockClass);
      window.removeEventListener("scroll", keepTop);
      cancelAnimationFrame(frame);
    }, introDurationMs);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", keepTop);
      root.classList.remove(lockClass);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="main-page">

      {/* ── Header (pas animé, comme le portfolio) ── */}
      <header className="main-header">
        <Image
          src="/assets/desktop-computer.png"
          alt="Recto"
          width={72}
          height={72}
          className="main-logo"
          priority
        />
      </header>

      {/* ── Intro : chaque mot animé avec wordVariants + stagger ── */}
      <motion.h1
        className="main-intro"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.145, delayChildren: 0.2 } },
        }}
      >
        <div className="main-line">
          {intro1.map((word, i) => (
            <motion.span key={i} className="main-word" variants={wordVariants}>
              {word}
            </motion.span>
          ))}
        </div>
        <div className="main-line">
          {intro2.map((word, i) => (
            <motion.span key={i} className="main-word" variants={wordVariants}>
              {word}
            </motion.span>
          ))}
        </div>
      </motion.h1>

      {/* ── Body : chaque mot animé, délai après l'intro ── */}
      <motion.p
        className="main-body"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.05, delayChildren: 1.1 } },
        }}
      >
        {bodyWords.map((word, i) => (
          <motion.span key={i} className="main-body-word" variants={wordVariants}>
            {word}{" "}
          </motion.span>
        ))}
      </motion.p>

      {/* ── Actions : riseIn après les mots ── */}
      <motion.div
        className="main-actions"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.08, delayChildren: 2.0 } },
        }}
      >
        <motion.div variants={riseInVariants}>
          <Link
            href={user ? "/verso" : "/login"}
            className="main-button main-button-primary is-accent recto-cta"
          >
            {user ? "Rejoindre en Verso" : "Commencer"}
          </Link>
        </motion.div>
        <motion.div variants={riseInVariants}>
          <a href="#roles" className="main-button main-button-secondary">
            En savoir plus
          </a>
        </motion.div>
      </motion.div>

      {/* ── Meta (riseIn) ── */}
      <motion.div
        className="main-meta"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { delayChildren: 2.2 } },
        }}
      >
        <motion.span className="main-meta-chip" variants={riseInVariants}>
          Gratuit · Sans compte · Connexion directe
        </motion.span>
      </motion.div>

      {isIntroComplete && (
        <>
          {/* ── Section Recto / Verso ── */}
          <Section id="roles" title="Deux rôles, une idée simple.">
            <div className="main-experience-list">
              <ExperienceRow
                left={
                  <>
                    <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", fontStyle: "italic", letterSpacing: "-0.02em" }}>Recto</span>
                    <Badge color="accent">Hôte</Badge>
                  </>
                }
                title="Le PC qui partage son écran"
                desc="Recto, c'est toi. Tu ouvres l'app Windows, tu partages ce que tu veux, et tu reçois un code. Ton PC fait tourner le flux — personne d'autre n'y touche."
                period="App Windows"
              />
              <ExperienceRow
                left={
                  <>
                    <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", fontStyle: "italic", letterSpacing: "-0.02em" }}>Verso</span>
                    <Badge color="neutral">Client</Badge>
                  </>
                }
                title="Le PC (ou navigateur) qui reçoit"
                desc="Verso, c'est l'autre personne. Elle entre le code dans l'app ou sur ce site — et voit ton écran en direct. Elle peut même prendre le contrôle clavier et souris."
                period="App ou web"
              />
              <ExperienceRow
                left={
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "#a39589", letterSpacing: "0.02em" }}>
                    Pourquoi ces noms ?
                  </span>
                }
                desc="Recto et Verso, c'est le recto et le verso d'une feuille. Le Recto montre, le Verso reçoit. Simple."
                italic
              />
            </div>
          </Section>

          {/* ── Section Comment ça marche ── */}
          <Section id="comment" title="Aussi simple que ça.">
            <div className="main-experience-list">
              {[
                { num: "01", badge: "App Windows",     title: "Tu ouvres Recto sur ton PC",        desc: "Lance l'app, clique sur partager, choisis ce que tu veux montrer. Un code apparaît." },
                { num: "02", badge: "Expire en 15 min", title: "Tu envoies le code",                desc: "Six lettres. Par Discord, SMS, ou à voix haute. L'autre personne l'entre sur son téléphone ou navigateur." },
                { num: "03", badge: "Navigateur ou app", title: "La connexion se fait toute seule", desc: "Pas de configuration réseau, pas de port à ouvrir. Ça marche derrière n'importe quel routeur." },
              ].map((step) => (
                <ExperienceRow
                  key={step.num}
                  left={
                    <>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", fontWeight: 400, color: "#a39589" }}>{step.num}</span>
                      <Badge color="accent">{step.badge}</Badge>
                    </>
                  }
                  title={step.title}
                  desc={step.desc}
                />
              ))}
            </div>
          </Section>

          {/* ── Section Pourquoi Recto ── */}
          <Section title="Pourquoi Recto.">
            <div className="main-experience-list">
              {[
                { label: "Instantané",    period: "< 3 secondes",   desc: "De « j'ouvre l'app » à « tu vois mon écran » en moins de 3 secondes. Pas de salle d'attente." },
                { label: "Privé",         period: "Chiffré E2E",    desc: "Ta vidéo ne passe jamais par nos serveurs. Elle va directement de ton PC à celui de l'autre personne." },
                { label: "Fluide",        period: "Jusqu'à 60 FPS", desc: "Assez rapide pour du jeu vidéo, assez clair pour du code, assez fiable pour une démo client." },
                { label: "Contrôle total",period: "Clavier & souris", desc: "La personne en Verso peut prendre la main sur ton PC — comme si elle était là, à l'autre bout du monde." },
              ].map((row) => (
                <ExperienceRow
                  key={row.label}
                  left={<span>{row.label}</span>}
                  desc={row.desc}
                  period={row.period}
                />
              ))}
            </div>
          </Section>

          {/* ── Footer ── */}
          <motion.footer
            className="main-footer"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            variants={riseInVariants}
          >
            <div className="main-footer-inner">
              <span className="main-footer-link" style={{ cursor: "default" }}>Recto © 2026</span>
              <div style={{ display: "flex", gap: "16px" }}>
                <Link href="/verso" className="main-footer-link">Verso →</Link>
                <a href="https://github.com/kirosnn/Recto" target="_blank" rel="noopener noreferrer" className="main-footer-link">GitHub</a>
              </div>
            </div>
          </motion.footer>

          <PreferencesDrawer user={user as Parameters<typeof PreferencesDrawer>[0]["user"]} />
        </>
      )}

      <style>{`
        .recto-cta { transition: box-shadow 180ms ease, transform 180ms ease !important; }
        .recto-cta:hover  { transform: scale(1.03); }
        .recto-cta:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <motion.section
      id={id}
      className="main-collaboration"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1, delayChildren: 0 } },
      }}
    >
      <motion.h2 className="main-collaboration-title" variants={riseInVariants}>
        {title}
      </motion.h2>
      <motion.div variants={riseInVariants}>
        {children}
      </motion.div>
    </motion.section>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: "accent" | "neutral" }) {
  return (
    <span style={{
      fontSize: "0.76rem", padding: "2px 9px",
      background: color === "accent" ? "rgba(217,119,87,0.08)" : "rgba(18,18,18,0.05)",
      border: `1px solid ${color === "accent" ? "rgba(217,119,87,0.18)" : "rgba(18,18,18,0.1)"}`,
      borderRadius: "999px",
      color: color === "accent" ? "#c4623e" : "#6d6057",
      fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

function ExperienceRow({
  left, title, desc, period, italic,
}: {
  left: React.ReactNode;
  title?: string;
  desc?: string;
  period?: string;
  italic?: boolean;
}) {
  return (
    <div className="main-experience-row">
      <div className="main-experience-company">{left}</div>
      <div className="main-experience-content">
        <div className="main-experience-main">
          {title && <h2>{title}</h2>}
          {desc && <p style={italic ? { fontStyle: "italic" } : undefined}>{desc}</p>}
        </div>
        {period && <span className="main-experience-period">{period}</span>}
      </div>
    </div>
  );
}
