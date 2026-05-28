import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Recto</h1>
        <p className="text-zinc-400 max-w-sm">
          Partage d&apos;écran P2P serverless. Sans installation, sans serveur
          intermédiaire.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <Link
          href="/verso"
          className="px-8 py-4 bg-brand-600 hover:bg-brand-500 rounded-xl font-semibold
                     text-lg transition-colors"
        >
          📺 Rejoindre en tant que Verso
        </Link>
        <p className="text-sm text-zinc-600">
          Pour partager ton écran, télécharge l&apos;app{" "}
          <span className="text-zinc-400">Recto</span> sur Windows.
        </p>
      </div>

      <div className="flex gap-8 text-center text-zinc-600 text-sm">
        <div>
          <div className="text-2xl mb-1">🔒</div>
          <div>Chiffré E2E</div>
        </div>
        <div>
          <div className="text-2xl mb-1">⚡</div>
          <div>60 FPS P2P</div>
        </div>
        <div>
          <div className="text-2xl mb-1">🌐</div>
          <div>Serverless</div>
        </div>
      </div>
    </main>
  );
}
