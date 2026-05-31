"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BackButton from "../../../components/BackButton";

const allowedSchemes = new Set(["recto", "recto-dev-recto", "recto-dev-verso"]);

function buildAppUrl(search: string) {
  const params = new URLSearchParams(search);
  const appParams = new URLSearchParams();
  const requestedScheme = params.get("scheme") ?? "recto";
  const scheme = allowedSchemes.has(requestedScheme) ? requestedScheme : "recto";

  for (const key of ["code", "error", "error_code", "error_description", "state"]) {
    const value = params.get(key);
    if (value) appParams.set(key, value);
  }

  return `${scheme}://auth/callback${appParams.size ? `?${appParams.toString()}` : ""}`;
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
    setHasCode(params.has("code"));

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
    <main className="main-page recto-form-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, position: "relative" }}>
      <BackButton href="/login" />
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
        </div>
      </section>
    </main>
  );
}
