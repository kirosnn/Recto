"use client";

export const dynamic = "force-dynamic";

import { useState, useRef, useEffect } from "react";
import { WebVersoConnection } from "../../lib/webrtc";

type Status = "idle" | "connecting" | "connected" | "error";

export default function VersoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conn = useRef<WebVersoConnection | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => () => conn.current?.stop(), []);

  const handleConnect = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Le code doit faire 6 caractères");
      return;
    }
    setStatus("connecting");
    setError("");

    conn.current = new WebVersoConnection({
      onStream: (s) => setStream(s),
      onConnected: () => setStatus("connected"),
      onDisconnected: () => {
        setStatus("idle");
        setStream(null);
      },
      onError: (e) => {
        setError(e);
        setStatus("error");
      },
    });

    try {
      await conn.current.connect(trimmed);
    } catch (e: unknown) {
      setError((e as Error).message || "Connexion échouée");
      setStatus("error");
      conn.current = null;
    }
  };

  const handleDisconnect = () => {
    conn.current?.stop();
    conn.current = null;
    setStatus("idle");
    setStream(null);
    setCode("");
  };

  if (status === "connected" || stream) {
    return (
      <div className="relative w-screen h-screen bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        <button
          onClick={handleDisconnect}
          className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur
                     border border-white/10 text-sm text-zinc-300 hover:text-white transition-all"
        >
          ✕ Déconnecter
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold">Rejoindre un Recto</h1>
        <p className="text-zinc-500 text-sm">
          Entre le code à 6 caractères affiché sur l&apos;écran hôte
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="XXXXXX"
          maxLength={6}
          className="
            font-mono w-full text-center text-3xl tracking-[0.5em] font-bold
            bg-white/5 border border-white/10 rounded-xl px-6 py-4
            focus:outline-none focus:border-brand-500/50
            placeholder:text-zinc-700 placeholder:tracking-widest
            transition-all uppercase text-white
          "
          autoFocus
          disabled={status === "connecting"}
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={status === "connecting" || code.trim().length < 6}
          className="
            w-full py-3 rounded-xl font-semibold transition-all
            bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {status === "connecting" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              Connexion…
            </span>
          ) : (
            "Se connecter →"
          )}
        </button>
      </div>
    </main>
  );
}
