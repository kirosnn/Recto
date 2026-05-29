import { createContext, useContext, useRef, useState, useCallback } from "react";
import { RectoConnection } from "../lib/webrtc";
import { endSession } from "../lib/signaling";
import { identityFromUser } from "../lib/identity";
import { useAuth } from "./useAuth";
import { invoke } from "@tauri-apps/api/core";

export type SessionStatus = "idle" | "selecting" | "waiting" | "connected" | "error";

export type PeerIdentity = { name: string; avatar: string | null };

// Debug snapshot of the last input event injected on the host. Stored in a ref
// (not state) so high-frequency mouse moves don't trigger re-renders; the debug
// panel polls it instead.
export type InputDebug = { summary: string; count: number };

type Ctx = {
  status: SessionStatus;
  code: string;
  duration: number;
  error: string;
  copied: boolean;
  peer: PeerIdentity | null;
  lastInputRef: React.MutableRefObject<InputDebug>;
  start: () => Promise<void>;
  stop: () => void;
  copyCode: () => Promise<void>;
};

// One-line human summary of an input event for the debug overlay.
function describeInput(event: { type: string } & Record<string, unknown>): string {
  switch (event.type) {
    case "mouseMove":
      return `souris ${Math.round(event.x as number)}, ${Math.round(event.y as number)}`;
    case "mouseMoveDelta":
      return `souris Δ ${event.dx}, ${event.dy}`;
    case "mouseDown":
      return `clic ${event.button} ↓`;
    case "mouseUp":
      return `clic ${event.button} ↑`;
    case "mouseWheel":
      return `molette ${Math.round(event.deltaY as number)}`;
    case "keyDown":
      return `touche ${event.code} ↓`;
    case "keyUp":
      return `touche ${event.code} ↑`;
    default:
      return event.type;
  }
}

interface DisplayInfo {
  id: number;
  width: number;
  height: number;
  x: number;
  y: number;
  primary: boolean;
}

const RectoSessionCtx = createContext<Ctx>({
  status: "idle", code: "", duration: 0, error: "", copied: false, peer: null,
  lastInputRef: { current: { summary: "", count: 0 } },
  start: async () => {}, stop: () => {}, copyCode: async () => {},
});

export function useRectoSession() { return useContext(RectoSessionCtx); }

export function RectoSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [code, setCode] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [peer, setPeer] = useState<PeerIdentity | null>(null);

  const conn = useRef<RectoConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastInputRef = useRef<InputDebug>({ summary: "", count: 0 });

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (code) endSession(code).catch(() => {});
    conn.current?.stop(); conn.current = null;
    setStatus("idle"); setCode(""); setDuration(0); setError(""); setPeer(null);
    lastInputRef.current = { summary: "", count: 0 };
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
        const self = identityFromUser(user);
        inputCh.onopen = async () => {
          // Announce our Discord identity to Verso. Sent a few times because the
          // input channel is unreliable (maxRetransmits: 0).
          const sendIdentity = () => {
            if (inputCh.readyState === "open") {
              inputCh.send(JSON.stringify({ type: "identity", name: self.name, avatar: self.avatar }));
            }
          };
          sendIdentity();
          setTimeout(sendIdentity, 400);
          setTimeout(sendIdentity, 1200);

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
            // Verso announces who it is — show it in the UI, don't inject it
            if (event.type === "identity") {
              setPeer({ name: event.name, avatar: event.avatar ?? null });
              return;
            }
            lastInputRef.current = {
              summary: describeInput(event),
              count: lastInputRef.current.count + 1,
            };
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
    <RectoSessionCtx.Provider value={{ status, code, duration, error, copied, peer, lastInputRef, start, stop, copyCode }}>
      {children}
    </RectoSessionCtx.Provider>
  );
}
