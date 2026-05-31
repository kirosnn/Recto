import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import { RectoConnection, logWebRTCDiagnostics } from "../lib/webrtc";
import {
  createSession,
  endSession,
  fetchSession,
  fetchSessionAnswer,
  subscribeToSession,
} from "../lib/signaling";
import { identityFromUser } from "../lib/identity";
import { useAuth } from "./useAuth";
import { useSettings } from "./SettingsContext";
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
  getStats: () => Promise<RTCStatsReport>;
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

type VelocityStartResult = { offer: RTCSessionDescriptionInit };

const RectoSessionCtx = createContext<Ctx>({
  status: "idle", code: "", duration: 0, error: "", copied: false, peer: null,
  lastInputRef: { current: { summary: "", count: 0 } },
  start: async () => {}, stop: () => {}, copyCode: async () => {},
  getStats: () => Promise.resolve(new Map() as unknown as RTCStatsReport),
});

export function useRectoSession() { return useContext(RectoSessionCtx); }

export function RectoSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [code, setCode] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [peer, setPeer] = useState<PeerIdentity | null>(null);

  const conn = useRef<RectoConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diagRef = useRef<ReturnType<typeof setInterval> | null>(null); // TEMP DIAGNOSTIC
  const lastInputRef = useRef<InputDebug>({ summary: "", count: 0 });
  const velocitySessionRef = useRef(false);
  const velocityChannelRef = useRef<ReturnType<typeof subscribeToSession> | null>(null);

  // Re-apply encoding parameters whenever settings change mid-session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { conn.current?.applySettings(settings); }, [settings]);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (diagRef.current) { clearInterval(diagRef.current); diagRef.current = null; } // TEMP DIAGNOSTIC
    velocityChannelRef.current?.unsubscribe();
    velocityChannelRef.current = null;
    if (velocitySessionRef.current) {
      invoke("velocity_stop").catch(() => {});
      velocitySessionRef.current = false;
    }
    if (code) endSession(code).catch(() => {});
    conn.current?.stop(); conn.current = null;
    setStatus("idle"); setCode(""); setDuration(0); setError(""); setPeer(null);
    lastInputRef.current = { summary: "", count: 0 };
  }, [code]);

  const start = useCallback(async () => {
    setStatus("selecting");
    setError("");
    try {
      if (settings.engine === "velocity") {
        const res = await invoke<VelocityStartResult>("velocity_start", {
          settings: {
            targetFps: settings.velocityTargetFps,
            audioEnabled: settings.velocityAudioEnabled,
          },
        });
        velocitySessionRef.current = true;
        const sessionCode = await createSession(res.offer);
        setCode(sessionCode);
        setStatus("waiting");
        const session = await fetchSession(sessionCode);

        const applyAnswer = async (answer: RTCSessionDescriptionInit) => {
          await invoke("velocity_accept_answer", { answer });
          setStatus("connected");
          if (!timerRef.current) {
            timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
          }
        };

        velocityChannelRef.current = subscribeToSession(session.id, async (update) => {
          if (update.answer) await applyAnswer(update.answer as RTCSessionDescriptionInit);
        });

        const existing = await fetchSessionAnswer(session.id);
        if (existing) await applyAnswer(existing);
        return;
      }

      const videoConstraints: MediaTrackConstraints & { cursor?: string } = {
        frameRate: { ideal: settings.targetFps, max: settings.targetFps },
        cursor: "always",
      };
      if (settings.resolution !== "native") {
        const resMap: Record<string, number> = { "1080p": 1080, "1440p": 1440, "4K": 2160 };
        const h = resMap[settings.resolution];
        if (h) videoConstraints.height = { ideal: h, max: h };
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints as MediaTrackConstraints,
        audio: settings.audioEnabled,
      });

      stream.getVideoTracks()[0].onended = () => stop();

      conn.current = new RectoConnection({
        onCode: (c) => { setCode(c); setStatus("waiting"); },
        onConnected: () => {
          setStatus("connected");
          timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
          // TEMP DIAGNOSTIC (à retirer) — dump sender stats every 2s
          diagRef.current = setInterval(async () => {
            try {
              const r = await conn.current?.getStats();
              if (r) logWebRTCDiagnostics(r, "RECTO");
            } catch {}
          }, 2000);
        },
        onDisconnected: () => stop(),
        onError: (e) => { setError(e); setStatus("error"); },
      }, settings);

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

          // Send hardware encoder capabilities so Verso can show them in the stats overlay
          try {
            const caps = await invoke<{ gpuName: string; vendor: string; nvenc: boolean; amf: boolean; qsv: boolean }>(
              "get_hw_encoder_caps"
            );
            const sendCaps = () => {
              if (inputCh.readyState === "open") {
                inputCh.send(JSON.stringify({ type: "hwCaps", ...caps }));
              }
            };
            sendCaps();
            setTimeout(sendCaps, 600);
          } catch {}
        };

        inputCh.onmessage = async (e) => {
          try {
            const event = JSON.parse(e.data as string);
            // Recto→Verso-only messages; ignore if echoed back
            if (event.type === "displayInfo" || event.type === "hwCaps") return;
            // Verso announces who it is — show it in the UI, don't inject it
            if (event.type === "identity") {
              setPeer({ name: event.name, avatar: event.avatar ?? null });
              return;
            }
            if (event.type === "clientSettings") {
              update({
                maxBitrateKbps: event.maxBitrateKbps ?? settings.maxBitrateKbps,
                targetFps: event.targetFps ?? settings.targetFps,
                codec: event.codec ?? settings.codec,
                preset: "custom",
              });
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
  }, [settings, stop, update, user]);

  const copyCode = useCallback(async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const getStats = useCallback(() => conn.current?.getStats() ?? Promise.resolve(new Map() as unknown as RTCStatsReport), []);

  return (
    <RectoSessionCtx.Provider value={{ status, code, duration, error, copied, peer, lastInputRef, start, stop, copyCode, getStats }}>
      {children}
    </RectoSessionCtx.Provider>
  );
}
