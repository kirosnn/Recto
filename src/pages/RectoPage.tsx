import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RectoConnection } from "../lib/webrtc";
import { endSession } from "../lib/signaling";
import SessionCode from "../components/SessionCode";

type Status =
  | "idle"
  | "selecting"
  | "waiting"
  | "connected"
  | "error";

export default function RectoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [duration, setDuration] = useState(0);
  const conn = useRef<RectoConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStart = async () => {
    setStatus("selecting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60, cursor: "always" } as MediaTrackConstraints,
        audio: true,
      });

      stream.getVideoTracks()[0].onended = () => handleStop();

      conn.current = new RectoConnection({
        onCode: (c) => {
          setCode(c);
          setStatus("waiting");
        },
        onConnected: () => {
          setStatus("connected");
          timerRef.current = setInterval(
            () => setDuration((d) => d + 1),
            1000
          );
        },
        onDisconnected: () => handleStop(),
        onError: (e) => {
          setError(e);
          setStatus("error");
        },
      });

      const inputCh = conn.current.getInputChannel();
      if (inputCh) {
        inputCh.onmessage = async (e) => {
          try {
            const event = JSON.parse(e.data as string);
            await invoke("inject_input", { event });
          } catch {}
        };
      }

      await conn.current.start(stream);
    } catch (e: unknown) {
      if ((e as Error).name !== "NotAllowedError") {
        setError((e as Error).message || "Erreur inconnue");
        setStatus("error");
      } else {
        setStatus("idle");
      }
    }
  };

  const handleStop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (code) endSession(code).catch(() => {});
    conn.current?.stop();
    conn.current = null;
    setStatus("idle");
    setCode("");
    setDuration(0);
  };

  useEffect(() => () => handleStop(), []);

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(
      Math.floor((s % 3600) / 60)
    ).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 p-8 animate-fade-in">
      {status === "idle" && (
        <>
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-2xl font-bold">Partager mon écran</h2>
            <p className="text-zinc-500 text-sm">
              Un code sera généré — donne-le au client Verso
            </p>
          </div>
          <button
            onClick={handleStart}
            className="px-8 py-4 bg-brand-600 hover:bg-brand-500 rounded-xl font-semibold
                       text-lg transition-colors glow-purple"
          >
            🖥 Démarrer le partage
          </button>
        </>
      )}

      {status === "selecting" && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-zinc-400">Sélectionne une fenêtre ou un écran…</p>
        </div>
      )}

      {(status === "waiting" || status === "connected") && (
        <div className="flex flex-col items-center gap-8 w-full max-w-md">
          <SessionCode code={code} />

          <div className="glass rounded-xl p-5 w-full flex flex-col gap-3">
            <StatusRow
              label="Statut"
              value={status === "waiting" ? "En attente du client…" : "Connecté ✓"}
              valueClass={
                status === "connected" ? "text-emerald-400" : "text-yellow-400"
              }
            />
            {status === "connected" && (
              <StatusRow
                label="Durée"
                value={formatDuration(duration)}
                valueClass="code-char text-white"
              />
            )}
          </div>

          {status === "waiting" && (
            <p className="text-xs text-zinc-600 text-center">
              Le client Verso peut aussi se connecter depuis{" "}
              <span className="text-zinc-400">recto.app/verso</span>
            </p>
          )}

          <button
            onClick={handleStop}
            className="px-6 py-2.5 rounded-lg border border-red-500/30 text-red-400
                       hover:bg-red-500/10 transition-colors text-sm"
          >
            Arrêter le partage
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => setStatus("idle")}
            className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
