import { createContext, useContext, useRef, useState, useCallback } from "react";
import { RectoConnection } from "../lib/webrtc";
import { endSession } from "../lib/signaling";
import { invoke } from "@tauri-apps/api/core";

export type SessionStatus = "idle" | "selecting" | "waiting" | "connected" | "error";

type Ctx = {
  status: SessionStatus;
  code: string;
  duration: number;
  error: string;
  copied: boolean;
  start: () => Promise<void>;
  stop: () => void;
  copyCode: () => Promise<void>;
};

const RectoSessionCtx = createContext<Ctx>({
  status: "idle", code: "", duration: 0, error: "", copied: false,
  start: async () => {}, stop: () => {}, copyCode: async () => {},
});

export function useRectoSession() { return useContext(RectoSessionCtx); }

export function RectoSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [code, setCode] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const conn = useRef<RectoConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (code) endSession(code).catch(() => {});
    conn.current?.stop(); conn.current = null;
    setStatus("idle"); setCode(""); setDuration(0); setError("");
  }, [code]);

  const start = useCallback(async () => {
    setStatus("selecting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 60, cursor: "always" } as MediaTrackConstraints,
        audio: true,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);

      stream.getVideoTracks()[0].onended = () => stop();

      conn.current = new RectoConnection({
        onCode: (c) => { setCode(c); setStatus("waiting"); },
        onConnected: () => {
          setStatus("connected");
          timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
        },
        onDisconnected: () => stop(),
        onError: (e) => { setError(e); setStatus("error"); },
      });

      const inputCh = conn.current.getInputChannel();
      if (inputCh) {
        inputCh.onmessage = async (e) => {
          try { await invoke("inject_input", { event: JSON.parse(e.data as string) }); } catch {}
        };
      }
      await conn.current.start(stream);
    } catch (e: unknown) {
      if ((e as Error).name !== "NotAllowedError") { setError((e as Error).message || "Erreur"); setStatus("error"); }
      else setStatus("idle");
    }
  }, [stop]);

  const copyCode = useCallback(async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <RectoSessionCtx.Provider value={{ status, code, duration, error, copied, start, stop, copyCode }}>
      {children}
    </RectoSessionCtx.Provider>
  );
}
