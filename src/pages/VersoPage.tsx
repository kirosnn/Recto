import { useState, useRef, useEffect } from "react";
import { VersoConnection } from "../lib/webrtc";
import VideoDisplay from "../components/VideoDisplay";

type Status = "idle" | "connecting" | "connected" | "error";

export default function VersoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [inputChannel, setInputChannel] = useState<RTCDataChannel | null>(null);
  const [hostSize] = useState({ w: 1920, h: 1080 });
  const conn = useRef<VersoConnection | null>(null);

  const handleConnect = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Le code doit faire 6 caractères");
      return;
    }

    setStatus("connecting");
    setError("");

    conn.current = new VersoConnection({
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
      onInputChannel: (ch) => setInputChannel(ch),
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
    setInputChannel(null);
    setCode("");
  };

  useEffect(() => () => conn.current?.stop(), []);

  if (status === "connected" || (status === "connecting" && stream)) {
    return (
      <div className="relative w-full h-full">
        <VideoDisplay
          stream={stream}
          inputChannel={inputChannel}
          hostWidth={hostSize.w}
          hostHeight={hostSize.h}
        />
        <button
          onClick={handleDisconnect}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur
                     border border-white/10 text-xs text-zinc-300 hover:text-white
                     hover:bg-black/80 transition-all z-10"
        >
          ✕ Déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 p-8 animate-fade-in">
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-2xl font-bold">Se connecter à un hôte</h2>
        <p className="text-zinc-500 text-sm">
          Entre le code affiché sur l&apos;écran Recto
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="CODE"
          maxLength={6}
          className="
            code-char w-full text-center text-3xl tracking-[0.5em] font-bold
            bg-white/5 border border-white/10 rounded-xl px-6 py-4
            focus:outline-none focus:border-emerald-500/50 focus:bg-white/8
            placeholder:text-zinc-700 placeholder:tracking-widest
            transition-all uppercase
          "
          autoFocus
          disabled={status === "connecting"}
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={status === "connecting" || code.trim().length < 6}
          className="
            w-full py-3 rounded-xl font-semibold text-sm transition-all
            bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40
            disabled:cursor-not-allowed
          "
        >
          {status === "connecting" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Connexion…
            </span>
          ) : (
            "Se connecter →"
          )}
        </button>
      </div>

      <p className="text-xs text-zinc-700 text-center">
        Tu peux aussi rejoindre depuis un navigateur sur{" "}
        <span className="text-zinc-500">recto.app/verso</span>
      </p>
    </div>
  );
}
