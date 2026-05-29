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

interface DisplayInfo {
  id: number;
  width: number;
  height: number;
  x: number;
  y: number;
  primary: boolean;
}

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
        video: { frameRate: 60, cursor: "always" } as MediaTrackConstraints,
        audio: true,
      });

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
        inputCh.onopen = async () => {
          // Send real screen resolution so Verso maps mouse coords correctly
          try {
            const displays = await invoke<DisplayInfo[]>("get_displays");
            const primary = displays.find((d) => d.primary) ?? displays[0];
            if (primary) {
              inputCh.send(JSON.stringify({
                type: "displayInfo",
                width: primary.width,
                height: primary.height,
              }));
            }
          } catch (err) {
            console.error("[Recto] get_displays failed:", err);
          }
        };

        inputCh.onmessage = async (e) => {
          try {
            const event = JSON.parse(e.data as string);
            // displayInfo is Recto→Verso only; skip if Verso somehow echoes it
            if (event.type === "displayInfo") return;
            await invoke("inject_input", { event });
          } catch (err) {
            console.error("[Recto] inject_input failed:", err, e.data);
          }
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
