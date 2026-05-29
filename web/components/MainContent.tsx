"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PreferencesDrawer from "./PreferencesDrawer";

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

const roleCards = [
  {
    eyebrow: "Recto",
    meta: "Hôte · App Windows",
    title: "Le PC qui partage son écran",
    desc: "Recto, c'est toi. Tu ouvres l'app Windows, tu partages ce que tu veux, et tu reçois un code. Ton PC fait tourner le flux — personne d'autre n'y touche.",
  },
  {
    eyebrow: "Verso",
    meta: "Client · App ou web",
    title: "Le PC (ou navigateur) qui reçoit",
    desc: "Verso, c'est l'autre personne. Elle entre le code dans l'app ou sur ce site — et voit ton écran en direct. Elle peut même prendre le contrôle clavier et souris.",
  },
  {
    eyebrow: "Pourquoi ces noms ?",
    title: "Recto montre. Verso reçoit.",
    desc: "Recto et Verso, c'est le recto et le verso d'une feuille. Le Recto montre, le Verso reçoit. Simple.",
  },
];

const stepCards = [
  {
    eyebrow: "01",
    meta: "App Windows",
    title: "Tu ouvres Recto sur ton PC",
    desc: "Lance l'app, clique sur partager, choisis ce que tu veux montrer. Un code apparaît.",
  },
  {
    eyebrow: "02",
    meta: "Expire en 15 min",
    title: "Tu envoies le code",
    desc: "Six lettres. Par Discord, SMS, ou à voix haute. L'autre personne l'entre sur son téléphone ou navigateur.",
  },
  {
    eyebrow: "03",
    meta: "Navigateur ou app",
    title: "La connexion se fait toute seule",
    desc: "Pas de configuration réseau, pas de port à ouvrir. Ça marche derrière n'importe quel routeur.",
  },
];

const reasonCards = [
  {
    eyebrow: "Instantané",
    meta: "< 3 secondes",
    desc: "De « j'ouvre l'app » à « tu vois mon écran » en moins de 3 secondes. Pas de salle d'attente.",
  },
  {
    eyebrow: "Privé",
    meta: "Chiffré E2E",
    desc: "Ta vidéo ne passe jamais par nos serveurs. Elle va directement de ton PC à celui de l'autre personne.",
  },
  {
    eyebrow: "Fluide",
    meta: "Jusqu'à 60 FPS",
    desc: "Assez rapide pour du jeu vidéo, assez clair pour du code, assez fiable pour une démo client.",
  },
  {
    eyebrow: "Contrôle total",
    meta: "Clavier & souris",
    desc: "La personne en Verso peut prendre la main sur ton PC — comme si elle était là, à l'autre bout du monde.",
  },
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
      <div className="main-bg-container">
        <motion.div
          className="main-bg-image"
          initial={{ opacity: 0, scale: 1.1, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: 1.6,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>

      <motion.header
        className="main-header"
        initial={{ opacity: 0, y: -30, scale: 0.85, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{
          duration: 1.2,
          ease: [0.16, 1, 0.3, 1],
          delay: 0.15,
        }}
      >
        <Image
          src="/assets/desktop-computer.png"
          alt="Recto"
          width={72}
          height={72}
          className="main-logo"
          priority
          unoptimized
        />
      </motion.header>

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
          <GridSection id="roles" title="Deux rôles, une idée simple." items={roleCards} />
          <GridSection id="comment" title="Aussi simple que ça." items={stepCards} />
          <GridSection title="Pourquoi Recto." items={reasonCards} />

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

type GridCardItem = {
  eyebrow: string;
  meta?: string;
  title?: string;
  desc: string;
};

function GridSection({ id, title, items }: { id?: string; title: string; items: GridCardItem[] }) {
  return (
    <motion.section
      id={id}
      className="main-grid-section"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1, delayChildren: 0 } },
      }}
    >
      <motion.h2 className="main-grid-title" variants={riseInVariants}>
        {title}
      </motion.h2>
      <motion.div className="main-grid" variants={riseInVariants}>
        {items.map((item) => (
          <article className="main-grid-card" key={`${title}-${item.eyebrow}`}>
            <div className="main-grid-card-top">
              <span className="main-grid-eyebrow">{item.eyebrow}</span>
              {item.meta && <span className="main-grid-meta">{item.meta}</span>}
            </div>
            {item.title && <h3>{item.title}</h3>}
            <p>{item.desc}</p>
          </article>
        ))}
      </motion.div>
    </motion.section>
  );
}
