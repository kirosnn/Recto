"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function buildAppUrl(search: string) {
  const params = new URLSearchParams(search);
  const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  const hashParams = new URLSearchParams(hash);
  const appParams = new URLSearchParams();

  for (const key of ["code", "access_token", "refresh_token", "expires_at", "expires_in", "token_type", "error", "error_code", "error_description", "state"]) {
    const value = params.get(key) ?? hashParams.get(key);
    if (value) appParams.set(key, value);
  }

  return `recto://auth/callback${appParams.size ? `?${appParams.toString()}` : ""}`;
}

export default function DesktopCallbackPage() {
  const [opened, setOpened] = useState(false);
  const [hasCode, setHasCode] = useState(false);

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "recto://auth/callback";
    return buildAppUrl(window.location.search);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    setHasCode(params.has("code") || hashParams.has("access_token"));

    const timer = window.setTimeout(() => {
      setOpened(true);
      window.location.href = appUrl;
    }, 350);

    return () => window.clearTimeout(timer);
  }, [appUrl]);

  const openRecto = () => {
    setOpened(true);
    window.location.href = appUrl;
  };

  return (
    <main className="main-page recto-form-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <section className="recto-form-inner" style={{ width: "100%", maxWidth: 420 }}>
        <h1 className="main-intro" style={{ marginTop: 0, textAlign: "left" }}>
          Ouvrir Recto
        </h1>

        <p className="main-body" style={{ marginTop: 12, textAlign: "left", width: "100%" }}>
          {hasCode
            ? "Connexion Discord validée. Confirme l'ouverture de l'application Recto pour terminer."
            : "Le retour Discord ne contient pas de code de connexion. Recommence la connexion depuis Recto."}
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 28 }}>
          <button
            type="button"
            onClick={openRecto}
            className="main-button main-button-primary is-accent"
            style={{ width: "100%", minHeight: 50, fontSize: "1rem" }}
          >
            {opened ? "Rouvrir Recto" : "Ouvrir Recto"}
          </button>

          <Link
            href="/login"
            className="main-button"
            style={{ width: "100%", minHeight: 46, fontSize: "0.95rem", textDecoration: "none" }}
          >
            Revenir au site
          </Link>
        </div>
      </section>
    </main>
  );
}
