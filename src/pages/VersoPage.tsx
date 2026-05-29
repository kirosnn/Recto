import { useState, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { VersoConnection, type PeerIdentity, type HwEncoderCaps } from "../lib/webrtc";
import { useAuth } from "../context/useAuth";
import { identityFromUser } from "../lib/identity";
import VideoDisplay from "../components/VideoDisplay";
import PeerBadge from "../components/PeerBadge";
import PreferencesDrawer from "../components/PreferencesDrawer";
import BackButton from "../components/BackButton";

type Status = "idle" | "connecting" | "connected" | "error";

// Toggle the Tauri window fullscreen (best-effort)
const setFullscreen = (v: boolean) => {
  getCurrentWindow().setFullscreen(v).catch(() => {});
};

export default function VersoPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [inputChannel, setInputChannel] = useState<RTCDataChannel | null>(null);
  // Defaults to 1920×1080; updated when Recto sends displayInfo over DataChannel
  const [hostSize, setHostSize] = useState({ w: 1920, h: 1080 });
  const [peer, setPeer] = useState<PeerIdentity | null>(null);
  // Ctrl+Alt+H hides the on-video overlays for an immersive view
  const [hideUI, setHideUI] = useState(false);
  const [hwCaps, setHwCaps] = useState<HwEncoderCaps | null>(null);
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
      onConnected: () => { setStatus("connected"); setFullscreen(true); },
      onDisconnected: () => {
        setStatus("idle");
        setStream(null);
        setInputChannel(null);
        setPeer(null);
        setHideUI(false);
        setHwCaps(null);
        setFullscreen(false);
      },
      onError: (e) => {
        setError(e);
        setStatus("error");
        conn.current = null;
        setFullscreen(false);
      },
      onInputChannel: (ch) => setInputChannel(ch),
      onDisplayInfo: (w, h) => setHostSize({ w, h }),
      onIdentity: (id) => setPeer(id),
      onHwCaps: (caps) => setHwCaps(caps),
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
    setPeer(null);
    setCode("");
    setHideUI(false);
    setHwCaps(null);
    setFullscreen(false);
  };

  useEffect(() => () => conn.current?.stop(), []);

  // Announce our Discord identity to Recto once the input channel opens. Sent a
  // few times because the channel is unreliable (maxRetransmits: 0).
  useEffect(() => {
    if (!inputChannel) return;
    const self = identityFromUser(user);
    const send = () => {
      if (inputChannel.readyState === "open") {
        inputChannel.send(
          JSON.stringify({
            type: "identity",
            name: self.name,
            avatar: self.avatar,
          }),
        );
      }
    };
    send();
    const t1 = setTimeout(send, 400);
    const t2 = setTimeout(send, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [inputChannel, user]);

  if (status === "connected" || (status === "connecting" && stream)) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#000",
        }}
      >
        <VideoDisplay
          stream={stream}
          inputChannel={inputChannel}
          hostWidth={hostSize.w}
          hostHeight={hostSize.h}
          hideUI={hideUI}
          onToggleUI={() => setHideUI((v) => !v)}
          getStats={() => conn.current?.getStats() ?? Promise.resolve(new Map() as unknown as RTCStatsReport)}
          hwCaps={hwCaps}
        />
        {peer && !hideUI && (
          <PeerBadge
            peer={peer}
            label="Connecté à"
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              zIndex: 10,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              borderColor: "rgba(255,255,255,0.12)",
            }}
          />
        )}
        {!hideUI && (
          <button
            onClick={handleDisconnect}
            className="btn btn-ghost"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              fontSize: "0.8rem",
              minHeight: 30,
              padding: "0 12px",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.8)",
              zIndex: 10,
            }}
          >
            ✕ Déconnecter
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="page" style={{ gap: "clamp(20px, 3vw, 32px)" }}>
      <PreferencesDrawer />
      <BackButton />

      <div style={{ textAlign: "center" }}>
        <h1
          className="serif"
          style={{
            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
            letterSpacing: "-0.04em",
            color: "var(--tx)",
          }}
        >
          Se connecter.
        </h1>
        <p style={{ marginTop: 8, fontSize: "0.88rem", color: "var(--tx-2)" }}>
          Entre le code affiché sur l&apos;écran Recto.
        </p>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <input
          className="code-input"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 6));
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="AB3XK7"
          maxLength={6}
          autoFocus
          disabled={status === "connecting"}
        />

        {error && (
          <p
            style={{
              fontSize: "0.82rem",
              color: "#c4623e",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        )}

        <button
          className="btn btn-accent"
          onClick={handleConnect}
          disabled={status === "connecting" || code.trim().length < 6}
          style={{ width: "100%", minHeight: 44 }}
        >
          {status === "connecting" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "white",
                  display: "inline-block",
                  animation: "spin 0.75s linear infinite",
                }}
              />
              Connexion…
            </span>
          ) : (
            "Se connecter"
          )}
        </button>
      </div>

      <p
        style={{
          fontSize: "0.76rem",
          color: "var(--tx-3)",
          textAlign: "center",
        }}
      >
        Tu peux aussi rejoindre depuis{" "}
        <span style={{ color: "var(--tx-2)" }}>
          kirossenrecto.vercel.app/verso
        </span>
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
