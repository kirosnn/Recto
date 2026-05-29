import Link from "next/link";
import { createClient } from "../lib/supabase-server";
import UserMenu from "../components/UserMenu";
import ThemeToggle from "../components/ThemeToggle";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-bg text-tx">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-end gap-1 px-6 h-14">
        <ThemeToggle />
        {user ? (
          <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
        ) : (
          <Link
            href="/login"
            className="px-4 py-1.5 rounded-lg bg-surface hover:bg-border text-tx text-sm font-medium transition-colors"
          >
            Se connecter
          </Link>
        )}
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center gap-6 pt-40 pb-24 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-txm mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Connexion P2P directe — aucun serveur intermédiaire
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight max-w-3xl leading-tight text-tx">
          Partage d&apos;écran
          <br />
          <span className="text-accent">sans serveur</span>
        </h1>

        <p className="text-txm max-w-md text-lg leading-relaxed">
          Recto transforme ton PC en hôte de streaming. Verso s&apos;y connecte
          en un code — depuis l&apos;app Windows ou le navigateur.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link
            href="/verso"
            className="px-7 py-3.5 rounded-xl bg-accent hover:opacity-90 text-white font-semibold text-base transition-opacity"
          >
            Rejoindre en Verso →
          </Link>
          <a
            href="#comment"
            className="px-7 py-3.5 rounded-xl border border-border hover:bg-surface font-medium text-sm text-txm hover:text-tx transition-colors"
          >
            Comment ça marche
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="flex flex-wrap justify-center gap-16 py-14 border-y border-border px-6">
        {[
          { value: "60 FPS", label: "Stream fluide" },
          { value: "P2P",    label: "Connexion directe" },
          { value: "E2E",    label: "Chiffré WebRTC" },
          { value: "0",      label: "Serveur relais" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-bold text-accent">{s.value}</div>
            <div className="text-sm text-txm mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Tutorial */}
      <section id="comment" className="max-w-4xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center mb-3 text-tx">En 3 étapes</h2>
        <p className="text-txm text-center mb-16 text-sm">
          Pas de compte, pas de configuration réseau, pas de serveur à gérer.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <Step
            number="01"
            title="Lance Recto sur le PC hôte"
            description="Ouvre l'app Recto sur Windows, clique « Partager mon écran » et sélectionne la fenêtre ou l'écran."
            detail={
              <div className="mt-4 rounded-lg bg-surface border border-border px-4 py-3 text-xs font-mono text-txm">
                <span className="text-txm/50">app → </span>
                <span className="text-accent">Démarrer le partage</span>
              </div>
            }
          />
          <Step
            number="02"
            title="Partage le code à 6 caractères"
            description="Recto génère un code unique. Envoie-le par Discord, message, ou autre."
            detail={
              <div className="mt-4 flex gap-1.5 justify-center">
                {["A", "B", "3", "X", "K", "7"].map((c, i) => (
                  <span
                    key={i}
                    className="w-8 h-9 flex items-center justify-center font-mono font-bold text-sm bg-surface border border-border rounded-md text-tx"
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
            description="Le client saisit le code dans l'app Windows ou le navigateur. La connexion P2P s'établit directement."
            detail={
              <Link
                href="/verso"
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-surface border border-border text-txm text-xs py-2.5 hover:text-tx hover:bg-border transition-colors"
              >
                Ouvrir Verso →
              </Link>
            }
          />
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-border p-8">
          <h3 className="font-semibold text-sm mb-6 text-center text-txm uppercase tracking-widest">
            Sous le capot
          </h3>
          <div className="flex flex-col gap-1">
            {[
              { step: "Signaling",     desc: "SDP + ICE échangés via Supabase Realtime — ultra rapide, pas de serveur dédié." },
              { step: "NAT Traversal", desc: "ICE + STUN établit la route directe entre les deux machines, même derrière un routeur." },
              { step: "Stream P2P",    desc: "Vidéo et audio circulent directement Recto → Verso via WebRTC chiffré E2E." },
              { step: "Input",         desc: "Clavier/souris capturés chez Verso, injectés côté Recto via SendInput Windows (< 5ms LAN)." },
            ].map((row) => (
              <div key={row.step} className="flex gap-4 px-4 py-3 rounded-xl hover:bg-surface transition-colors group">
                <span className="font-mono text-xs font-semibold shrink-0 w-24 pt-0.5 text-accent">{row.step}</span>
                <span className="text-txm text-xs leading-relaxed">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center px-6 pb-24">
        <h2 className="text-2xl font-bold mb-3 text-tx">Prêt à te connecter ?</h2>
        <p className="text-txm text-sm mb-8">Tu as reçu un code ? Rejoins depuis le navigateur.</p>
        <Link
          href="/verso"
          className="inline-flex px-8 py-4 rounded-xl bg-accent hover:opacity-90 text-white font-semibold text-base transition-opacity"
        >
          Ouvrir Verso →
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-txm/40 border-t border-border">
        Recto · WebRTC P2P · Supabase Realtime
      </footer>
    </main>
  );
}

function Step({
  number, title, description, detail,
}: {
  number: string; title: string; description: string; detail: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border p-6 flex flex-col hover:bg-surface transition-colors">
      <span className="font-mono text-xs text-txm/40 mb-4">{number}</span>
      <h3 className="font-semibold text-sm mb-2 text-tx">{title}</h3>
      <p className="text-txm text-xs leading-relaxed flex-1">{description}</p>
      {detail}
    </div>
  );
}
