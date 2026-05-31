"use client";

export const dynamic = "force-dynamic";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

const SCOPES: Record<string, { label: string; description: string; icon: string }> = {
  "session:create":  { label: "Créer des sessions",       description: "Démarrer un partage d'écran en ton nom",            icon: "CR" },
  "session:read":    { label: "Voir tes sessions",         description: "Accéder à la liste de tes sessions actives",         icon: "SR" },
  "session:join":    { label: "Rejoindre des sessions",    description: "Se connecter en Verso à tes sessions",               icon: "JO" },
  "profile:read":    { label: "Lire ton profil",           description: "Accéder à ton nom et ton adresse e-mail",            icon: "ID" },
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
    <div className="site-card" style={{ width: "100%", maxWidth: 390, overflow: "hidden" }}>
      <div style={{ padding: "30px 28px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div className="site-icon-box">
            <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>OA</span>
          </div>
          <div style={{ color: "var(--tx-2)", fontSize: "0.9rem", lineHeight: 1.45 }}>
            <span style={{ color: "var(--tx)", fontWeight: 600 }}>{appName}</span>
            <br />demande l&apos;accès à ton compte Recto
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--tx-3)", fontSize: "0.78rem" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--tx)", display: "inline-block" }} />
          kirossenrecto.vercel.app
        </div>
      </div>

      <div style={{ padding: "22px 28px" }}>
        <p style={{ margin: "0 0 14px", color: "var(--tx-3)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Autorisations demandées
        </p>
        <ul style={{ display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0, listStyle: "none" }}>
          {requestedScopes.length > 0 ? (
            requestedScopes.map((s) => (
              <li key={s} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span className="site-icon-box" style={{ width: 30, height: 30, fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>{SCOPES[s].icon}</span>
                <div>
                  <div style={{ color: "var(--tx)", fontSize: "0.9rem", fontWeight: 500 }}>{SCOPES[s].label}</div>
                  <div className="site-muted" style={{ fontSize: "0.8rem", lineHeight: 1.45 }}>{SCOPES[s].description}</div>
                </div>
              </li>
            ))
          ) : (
            <li className="site-muted" style={{ fontSize: "0.8rem" }}>Aucune permission spécifique.</li>
          )}
        </ul>
      </div>

      <div style={{ margin: "0 28px 20px", padding: "12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-alt)", color: "var(--tx-2)", fontSize: "0.8rem", lineHeight: 1.55 }}>
        N&apos;autorise que les apps en lesquelles tu as confiance. Recto ne
        te demandera jamais ton mot de passe via une app tierce.
      </div>

      {error && (
        <p style={{ margin: "0 28px 16px", color: "#c4623e", fontSize: "0.8rem" }}>{error}</p>
      )}

      <div style={{ padding: "0 28px 28px", display: "flex", gap: 10 }}>
        <button
          onClick={deny}
          disabled={status !== "idle"}
          className="main-button main-button-secondary"
          style={{ flex: 1, minHeight: 42, opacity: status !== "idle" ? 0.45 : 1 }}
        >
          {status === "denying" ? "Refus…" : "Refuser"}
        </button>
        <button
          onClick={allow}
          disabled={status !== "idle"}
          className="main-button main-button-primary"
          style={{ flex: 1, minHeight: 42, opacity: status !== "idle" ? 0.45 : 1 }}
        >
          {status === "allowing" ? (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span className="site-spinner" />
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
    <div className="site-card" style={{ width: "100%", maxWidth: 390, padding: 32, textAlign: "center" }}>
      <p className="site-text" style={{ margin: 0 }}>{message}</p>
    </div>
  );
}

export default function OAuthConsentPage() {
  return (
    <div className="site-shell" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div className="site-content" style={{ width: "min(100%, 390px)", textAlign: "center" }}>
        <span style={{ color: "var(--tx)", fontSize: "1.05rem", fontWeight: 650 }}>Recto</span>
      </div>

      <Suspense fallback={
        <div className="site-card" style={{ width: "100%", maxWidth: 390, padding: 40, display: "flex", justifyContent: "center" }}>
          <span className="site-spinner" />
        </div>
      }>
        <ConsentForm />
      </Suspense>

      <p className="site-muted" style={{ position: "relative", zIndex: 1, margin: 0, textAlign: "center", maxWidth: 320, fontSize: "0.78rem", lineHeight: 1.55 }}>
        En autorisant, tu accordes à cette application les permissions listées
        ci-dessus sur ton compte Recto.
      </p>
    </div>
  );
}
