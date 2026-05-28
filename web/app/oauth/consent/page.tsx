"use client";

export const dynamic = "force-dynamic";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

const SCOPES: Record<string, { label: string; description: string; icon: string }> = {
  "session:create":  { label: "Créer des sessions",       description: "Démarrer un partage d'écran en ton nom",            icon: "🖥" },
  "session:read":    { label: "Voir tes sessions",         description: "Accéder à la liste de tes sessions actives",         icon: "👁" },
  "session:join":    { label: "Rejoindre des sessions",    description: "Se connecter en Verso à tes sessions",               icon: "📺" },
  "profile:read":    { label: "Lire ton profil",           description: "Accéder à ton nom et ton adresse e-mail",            icon: "👤" },
};

function ConsentForm() {
  const params = useSearchParams();
  const router = useRouter();

  const clientId    = params.get("client_id")    ?? "unknown";
  const redirectUri = params.get("redirect_uri") ?? "";
  const scope       = params.get("scope")        ?? "session:read";
  const state       = params.get("state")        ?? "";
  const appName     = params.get("app_name")     ?? clientId;

  const [status, setStatus] = useState<"idle" | "allowing" | "denying">("idle");
  const [error, setError]   = useState("");

  const requestedScopes = scope.split(" ").filter((s) => s in SCOPES);

  function deny() {
    if (!redirectUri) { setError("redirect_uri manquant"); return; }
    setStatus("denying");
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    router.replace(url.toString());
  }

  async function allow() {
    if (!redirectUri) { setError("redirect_uri manquant"); return; }
    setStatus("allowing");
    try {
      // Generate authorization code via Supabase edge function (or simple token)
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri, scope, state }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { code } = await res.json() as { code: string };
      const url = new URL(redirectUri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      router.replace(url.toString());
    } catch (e: unknown) {
      setError((e as Error).message);
      setStatus("idle");
    }
  }

  if (!clientId || clientId === "unknown") {
    return <ErrorCard message="Paramètre client_id manquant." />;
  }

  return (
    <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-7 pt-8 pb-6 border-b border-white/8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-lg">
            🔗
          </div>
          <div className="text-sm text-zinc-400">
            <span className="font-semibold text-white">{appName}</span>
            <br />demande l&apos;accès à ton compte Recto
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          kirossenrecto.vercel.app
        </div>
      </div>

      {/* Scopes */}
      <div className="px-7 py-5">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
          Autorisations demandées
        </p>
        <ul className="flex flex-col gap-2.5">
          {requestedScopes.length > 0 ? (
            requestedScopes.map((s) => (
              <li key={s} className="flex items-start gap-3">
                <span className="text-base mt-0.5">{SCOPES[s].icon}</span>
                <div>
                  <div className="text-sm font-medium text-white">{SCOPES[s].label}</div>
                  <div className="text-xs text-zinc-500">{SCOPES[s].description}</div>
                </div>
              </li>
            ))
          ) : (
            <li className="text-xs text-zinc-600">Aucune permission spécifique.</li>
          )}
        </ul>
      </div>

      {/* Warning */}
      <div className="mx-7 mb-5 px-3 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/15 text-xs text-amber-300/80 leading-relaxed">
        N&apos;autorise que les apps en lesquelles tu as confiance. Recto ne
        te demandera jamais ton mot de passe via une app tierce.
      </div>

      {error && (
        <p className="mx-7 mb-4 text-xs text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="px-7 pb-7 flex gap-3">
        <button
          onClick={deny}
          disabled={status !== "idle"}
          className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-zinc-400
                     hover:border-white/20 hover:text-white transition-colors disabled:opacity-40"
        >
          {status === "denying" ? "Refus…" : "Refuser"}
        </button>
        <button
          onClick={allow}
          disabled={status !== "idle"}
          className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm font-semibold
                     transition-colors disabled:opacity-40"
        >
          {status === "allowing" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Autorisation…
            </span>
          ) : (
            "Autoriser"
          )}
        </button>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="w-full max-w-sm bg-zinc-900 border border-red-500/20 rounded-2xl p-8 text-center">
      <div className="text-2xl mb-3">⚠️</div>
      <p className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}

export default function OAuthConsentPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 gap-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-white tracking-wide text-lg">Recto</span>
      </div>

      <Suspense fallback={
        <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-10 flex justify-center">
          <span className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }>
        <ConsentForm />
      </Suspense>

      <p className="text-xs text-zinc-700 text-center max-w-xs">
        En autorisant, tu accordes à cette application les permissions listées
        ci-dessus sur ton compte Recto.
      </p>
    </div>
  );
}
