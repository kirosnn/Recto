import Link from "next/link";
import { createClient } from "../lib/supabase-server";
import UserMenu from "../components/UserMenu";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 h-14 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <span className="font-bold tracking-wide text-white">Recto</span>
        {user ? (
          <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
        ) : (
        <Link
          href="/verso"
          className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm font-medium transition-colors"
        >
          Se connecter
        </Link>
        )}
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center gap-6 pt-40 pb-24 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-400 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Connexion P2P directe — aucun serveur intermédiaire
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight max-w-3xl leading-tight">
          Partage d&apos;écran
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-violet-400">
            sans serveur
          </span>
        </h1>

        <p className="text-zinc-400 max-w-md text-lg leading-relaxed">
          Recto transforme ton PC en hôte de streaming. Verso s&apos;y connecte
          en un code — depuis l&apos;app Windows ou le navigateur.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link
            href="/verso"
            className="px-7 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold text-base transition-colors"
          >
            Rejoindre en Verso →
          </Link>
          <a
            href="#comment"
            className="px-7 py-3.5 rounded-xl border border-white/10 hover:border-white/20 font-medium text-sm text-zinc-300 transition-colors"
          >
            Comment ça marche
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="flex flex-wrap justify-center gap-12 py-12 border-y border-white/5 px-6">
        {[
          { value: "60 FPS", label: "Stream fluide" },
          { value: "P2P", label: "Connexion directe" },
          { value: "E2E", label: "Chiffré WebRTC" },
          { value: "0", label: "Serveur relais" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Tutorial */}
      <section id="comment" className="max-w-4xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center mb-4">
          En 3 étapes
        </h2>
        <p className="text-zinc-500 text-center mb-16 text-sm">
          Pas de compte, pas de configuration réseau, pas de serveur à gérer.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          <Step
            number="01"
            title="Lance Recto sur le PC hôte"
            description="Ouvre l'app Recto sur Windows, clique « Partager mon écran » et sélectionne la fenêtre ou l'écran à partager."
            color="brand"
            icon="🖥"
            detail={
              <div className="mt-4 rounded-lg bg-white/5 border border-white/8 px-4 py-3 text-xs font-mono text-zinc-400">
                <span className="text-zinc-600">app → </span>
                <span className="text-brand-300">Démarrer le partage</span>
              </div>
            }
          />
          <Step
            number="02"
            title="Partage le code à 6 caractères"
            description="Recto génère un code unique. Envoie-le par message, Discord, ou autre au destinataire."
            color="violet"
            icon="🔑"
            detail={
              <div className="mt-4 flex gap-1.5 justify-center">
                {["A", "B", "3", "X", "K", "7"].map((c, i) => (
                  <span
                    key={i}
                    className="w-8 h-9 flex items-center justify-center font-mono font-bold text-sm bg-white/5 border border-white/10 rounded-md text-white"
                  >
                    {c}
                  </span>
                ))}
              </div>
            }
          />
          <Step
            number="03"
            title="Verso entre le code et voit l'écran"
            description="Le client Verso saisit le code — dans l'app Windows ou ici dans le navigateur. La connexion P2P s'établit directement."
            color="emerald"
            icon="📺"
            detail={
              <Link
                href="/verso"
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-600/20 border border-emerald-500/20 text-emerald-300 text-xs py-2.5 hover:bg-emerald-600/30 transition-colors"
              >
                Ouvrir Verso dans le navigateur →
              </Link>
            }
          />
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-white/8 bg-white/3 p-8">
          <h3 className="font-semibold text-lg mb-6 text-center">
            Comment la connexion fonctionne
          </h3>
          <div className="flex flex-col gap-3 text-sm">
            {[
              {
                step: "Signaling",
                desc: "Recto et Verso s'échangent leurs descriptions WebRTC (SDP + ICE) via Supabase Realtime — ultra rapide, pas de serveur dédié.",
                color: "text-brand-300",
                bg: "bg-brand-500/10",
              },
              {
                step: "NAT Traversal",
                desc: "Le protocole ICE avec serveurs STUN établit la route la plus directe entre les deux machines, même derrière un routeur.",
                color: "text-violet-300",
                bg: "bg-violet-500/10",
              },
              {
                step: "Stream P2P",
                desc: "Une fois connectés, la vidéo et l'audio circulent directement entre Recto et Verso via WebRTC — Supabase n'est plus dans la boucle.",
                color: "text-emerald-300",
                bg: "bg-emerald-500/10",
              },
              {
                step: "Input (app)",
                desc: "Dans l'app Verso, clavier et souris sont capturés et injectés sur le PC Recto via l'API Windows SendInput — latence < 5ms en LAN.",
                color: "text-amber-300",
                bg: "bg-amber-500/10",
              },
            ].map((row) => (
              <div key={row.step} className={`flex gap-4 rounded-lg ${row.bg} px-4 py-3`}>
                <span className={`font-mono font-semibold shrink-0 w-24 ${row.color}`}>
                  {row.step}
                </span>
                <span className="text-zinc-400 leading-relaxed">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="text-center px-6 pb-24">
        <h2 className="text-2xl font-bold mb-4">Prêt à te connecter ?</h2>
        <p className="text-zinc-500 text-sm mb-8">
          Tu as reçu un code Recto ? Rejoins depuis le navigateur directement.
        </p>
        <Link
          href="/verso"
          className="inline-flex px-8 py-4 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold text-lg transition-colors"
        >
          Ouvrir Verso →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-700">
        Recto · Connexion P2P via WebRTC · Signaling Supabase
      </footer>
    </main>
  );
}

function Step({
  number,
  title,
  description,
  color,
  icon,
  detail,
}: {
  number: string;
  title: string;
  description: string;
  color: "brand" | "violet" | "emerald";
  icon: string;
  detail: React.ReactNode;
}) {
  const accent = {
    brand:   { border: "border-brand-500/20",   num: "text-brand-400",   bg: "bg-brand-500/10" },
    violet:  { border: "border-violet-500/20",  num: "text-violet-400",  bg: "bg-violet-500/10" },
    emerald: { border: "border-emerald-500/20", num: "text-emerald-400", bg: "bg-emerald-500/10" },
  }[color];

  return (
    <div className={`rounded-2xl border ${accent.border} bg-white/3 p-6 flex flex-col`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`font-mono text-xs font-bold ${accent.num}`}>{number}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <h3 className="font-semibold text-base mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm leading-relaxed flex-1">{description}</p>
      {detail}
    </div>
  );
}
