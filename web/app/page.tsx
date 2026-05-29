import Link from "next/link";
import { createClient } from "../lib/supabase-server";
import UserMenu from "../components/UserMenu";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-end px-6 h-14">
        {user ? (
          <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
        ) : (
          <Link
            href="/login"
            className="px-4 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-sm font-medium transition-colors text-white/80 hover:text-white"
          >
            Se connecter
          </Link>
        )}
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center gap-6 pt-40 pb-24 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 text-xs text-white/40 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Connexion P2P directe — aucun serveur intermédiaire
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight max-w-3xl leading-tight">
          Partage d&apos;écran
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">
            sans serveur
          </span>
        </h1>

        <p className="text-white/40 max-w-md text-lg leading-relaxed">
          Recto transforme ton PC en hôte de streaming. Verso s&apos;y connecte
          en un code — depuis l&apos;app Windows ou le navigateur.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link
            href="/verso"
            className="px-7 py-3.5 rounded-xl bg-white text-black font-semibold text-base hover:bg-white/90 transition-colors"
          >
            Rejoindre en Verso →
          </Link>
          <a
            href="#comment"
            className="px-7 py-3.5 rounded-xl border border-white/10 hover:border-white/20 font-medium text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            Comment ça marche
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="flex flex-wrap justify-center gap-16 py-14 border-y border-white/5 px-6">
        {[
          { value: "60 FPS", label: "Stream fluide" },
          { value: "P2P", label: "Connexion directe" },
          { value: "E2E", label: "Chiffré WebRTC" },
          { value: "0", label: "Serveur relais" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-white/30 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Tutorial */}
      <section id="comment" className="max-w-4xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center mb-3">En 3 étapes</h2>
        <p className="text-white/30 text-center mb-16 text-sm">
          Pas de compte, pas de configuration réseau, pas de serveur à gérer.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <Step
            number="01"
            title="Lance Recto sur le PC hôte"
            description="Ouvre l'app Recto sur Windows, clique « Partager mon écran » et sélectionne la fenêtre ou l'écran à partager."
            detail={
              <div className="mt-4 rounded-lg bg-white/4 border border-white/6 px-4 py-3 text-xs font-mono text-white/30">
                <span className="text-white/20">app → </span>
                <span className="text-violet-400">Démarrer le partage</span>
              </div>
            }
          />
          <Step
            number="02"
            title="Partage le code à 6 caractères"
            description="Recto génère un code unique. Envoie-le par message, Discord, ou autre au destinataire."
            detail={
              <div className="mt-4 flex gap-1.5 justify-center">
                {["A", "B", "3", "X", "K", "7"].map((c, i) => (
                  <span
                    key={i}
                    className="w-8 h-9 flex items-center justify-center font-mono font-bold text-sm bg-white/5 border border-white/8 rounded-md text-white"
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
            detail={
              <Link
                href="/verso"
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-white/4 border border-white/8 text-white/40 text-xs py-2.5 hover:bg-white/8 hover:text-white/70 transition-colors"
              >
                Ouvrir Verso dans le navigateur →
              </Link>
            }
          />
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-white/6 p-8">
          <h3 className="font-semibold text-base mb-6 text-center text-white/70">
            Comment la connexion fonctionne
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            {[
              { step: "Signaling",     desc: "Recto et Verso s'échangent leurs descriptions WebRTC via Supabase Realtime — ultra rapide, pas de serveur dédié.", accent: "text-violet-400" },
              { step: "NAT Traversal", desc: "ICE + STUN établit la route la plus directe entre les deux machines, même derrière un routeur.", accent: "text-blue-400" },
              { step: "Stream P2P",    desc: "La vidéo et l'audio circulent directement entre Recto et Verso via WebRTC — Supabase n'est plus dans la boucle.", accent: "text-emerald-400" },
              { step: "Input",         desc: "Clavier et souris capturés chez Verso, injectés sur le PC Recto via l'API Windows SendInput — latence < 5ms en LAN.", accent: "text-amber-400" },
            ].map((row) => (
              <div key={row.step} className="flex gap-4 px-4 py-3 rounded-lg hover:bg-white/3 transition-colors">
                <span className={`font-mono text-xs font-semibold shrink-0 w-24 pt-0.5 ${row.accent}`}>{row.step}</span>
                <span className="text-white/30 leading-relaxed text-xs">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center px-6 pb-24">
        <h2 className="text-2xl font-bold mb-3">Prêt à te connecter ?</h2>
        <p className="text-white/30 text-sm mb-8">
          Tu as reçu un code Recto ? Rejoins depuis le navigateur.
        </p>
        <Link
          href="/verso"
          className="inline-flex px-8 py-4 rounded-xl bg-white text-black font-semibold text-base hover:bg-white/90 transition-colors"
        >
          Ouvrir Verso →
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-white/15">
        Recto · WebRTC P2P · Supabase Realtime
      </footer>
    </main>
  );
}

function Step({
  number,
  title,
  description,
  detail,
}: {
  number: string;
  title: string;
  description: string;
  detail: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/6 p-6 flex flex-col hover:border-white/10 transition-colors">
      <span className="font-mono text-xs text-white/20 mb-4">{number}</span>
      <h3 className="font-semibold text-sm mb-2 text-white">{title}</h3>
      <p className="text-white/30 text-xs leading-relaxed flex-1">{description}</p>
      {detail}
    </div>
  );
}
