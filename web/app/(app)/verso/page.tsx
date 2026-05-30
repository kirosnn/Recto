"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { WebVersoConnection, type PeerIdentity } from "../../../lib/webrtc";
import { createClient } from "../../../lib/supabase-browser";
import { identityFromUser, type Identity } from "../../../lib/identity";
import VideoDisplay from "../../../components/VideoDisplay";
import PeerBadge from "../../../components/PeerBadge";
import BackButton from "../../../components/BackButton";
import StatsOverlay from "../../../components/StatsOverlay";
import { useWebSettings } from "../../../lib/webSettings";

type Status = "idle" | "connecting" | "connected" | "error";

export default function VersoPage() {
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
  const [showStats, setShowStats] = useState(false);
  const conn = useRef<WebVersoConnection | null>(null);
  const { settings } = useWebSettings();
  // Our own Discord identity, sent to Recto once the input channel opens
  const selfIdentity = useRef<Identity | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      selfIdentity.current = identityFromUser(data.user);
    });
  }, []);

  // Announce our identity to Recto as soon as the channel is open
  useEffect(() => {
    if (!inputChannel) return;
    const send = () => {
      const id = selfIdentity.current;
      if (id && inputChannel.readyState === "open") {
        inputChannel.send(
          JSON.stringify({
            type: "identity",
            name: id.name,
            avatar: id.avatar,
          }),
        );
      }
    };
    // Identity travels on the unreliable input channel, so send a few times to
    // beat early packet loss.
    send();
    const t1 = setTimeout(send, 400);
    const t2 = setTimeout(send, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [inputChannel]);

  useEffect(() => () => conn.current?.stop(), []);

  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const handleConnect = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Le code doit faire 6 caractères");
      return;
    }
    // Requested within the click gesture so the browser allows it
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStatus("connecting");
    setError("");

    conn.current = new WebVersoConnection({
      onStream: (s) => setStream(s),
      onConnected: () => setStatus("connected"),
      onDisconnected: () => {
        setStatus("idle");
        setStream(null);
        setInputChannel(null);
        setPeer(null);
        setHideUI(false);
        exitFullscreen();
      },
      onError: (e) => {
        setError(e);
        setStatus("error");
        conn.current = null;
        exitFullscreen();
      },
      onInputChannel: (ch) => setInputChannel(ch),
      onDisplayInfo: (w, h) => setHostSize({ w, h }),
      onIdentity: (id) => setPeer(id),
    });

    try {
      await conn.current.connect(trimmed, settings.requestedCodec, settings.lowLatencyMode);
    } catch (e: unknown) {
      setError((e as Error).message || "Connexion échouée");
      setStatus("error");
      conn.current = null;
    }
  }, [code, settings.requestedCodec]);

  const handleDisconnect = () => {
    conn.current?.stop();
    conn.current = null;
    setStatus("idle");
    setStream(null);
    setInputChannel(null);
    setPeer(null);
    setCode("");
    setHideUI(false);
    exitFullscreen();
  };

  // Toggle stats overlay with Ctrl+Alt+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.code === "KeyS") {
        e.preventDefault();
        setShowStats((v) => !v);
        return;
      }
      if (e.ctrlKey && e.altKey && e.code === "KeyH") {
        e.preventDefault();
        setHideUI((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sync showStats from drawer settings
  useEffect(() => {
    setShowStats(settings.showStats);
  }, [settings.showStats]);

  // Send requested stream settings to Recto as soon as input channel is ready
  useEffect(() => {
    if (!inputChannel) return;
    const sendClientSettings = () => {
      if (inputChannel.readyState === "open") {
        inputChannel.send(JSON.stringify({
          type: "clientSettings",
          maxBitrateKbps: settings.requestedBitrateKbps,
          targetFps: settings.requestedFps,
          codec: settings.requestedCodec,
        }));
      }
    };
    sendClientSettings();
    const t1 = setTimeout(sendClientSettings, 500);
    const t2 = setTimeout(sendClientSettings, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [inputChannel, settings.requestedBitrateKbps, settings.requestedFps, settings.requestedCodec]);

  if (status === "connected" || stream) {
    return (
      <div
        style={{
          position: "relative",
          width: "100vw",
          height: "100dvh",
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
          setLowLatency={(enabled) => conn.current?.setLowLatency(enabled)}
        />
        {conn.current && (
          <StatsOverlay
            getStats={() => conn.current!.getStats()}
            visible={showStats && !hideUI}
          />
        )}
        {peer && !hideUI && (
          <PeerBadge
            peer={peer}
            label="Connecté à"
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              zIndex: 10,
            }}
          />
        )}
        {!hideUI && (
          <button
            onClick={handleDisconnect}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              zIndex: 10,
              padding: "6px 14px",
              borderRadius: "10px",
              background: "rgba(17,17,17,0.82)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f5f1e8",
              fontSize: "0.88rem",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            ✕ Déconnecter
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="main-page recto-form-page"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      <BackButton href="/" />
      <div
        className="recto-form-inner"
        style={{ width: "100%", maxWidth: "360px" }}
      >
        <h1 className="main-intro" style={{ textAlign: "left", marginTop: 0 }}>
          Se connecter.
        </h1>

        <p
          className="main-body"
          style={{ textAlign: "left", marginTop: "10px", width: "100%" }}
        >
          Entre le code affiché sur l&apos;écran Recto.
        </p>

        <div
          style={{
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {/* Code input — font-size 16px minimum évite le zoom iOS */}
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().slice(0, 6));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            placeholder="AB3XK7"
            maxLength={6}
            disabled={status === "connecting"}
            className="verso-code-input"
          />

          {error && (
            <p
              style={{
                fontSize: "0.85rem",
                color: "#c4623e",
                letterSpacing: "-0.01em",
                marginTop: "-2px",
              }}
            >
              {error}
            </p>
          )}

          <button
            onClick={handleConnect}
            disabled={status === "connecting" || code.trim().length < 6}
            className="main-button main-button-primary is-accent"
            style={{
              width: "100%",
              minHeight: "50px",
              opacity:
                status === "connecting" || code.trim().length < 6 ? 0.5 : 1,
            }}
          >
            {status === "connecting" ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: "spin 0.8s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Connexion…
              </>
            ) : (
              "Se connecter"
            )}
          </button>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }

          .verso-code-input {
            width: 100%;
            height: 64px;
            font-family: var(--font-mono);
            font-size: 2rem;
            font-weight: 700;
            letter-spacing: 0.28em;
            text-align: center;
            background: rgba(18,18,18,0.04);
            color: #121212;
            border: 1px solid rgba(18,18,18,0.14);
            border-radius: 14px;
            outline: none;
            transition: border-color 180ms ease, box-shadow 180ms ease;
            -webkit-appearance: none;
          }
          .verso-code-input::placeholder { color: rgba(18,18,18,0.2); letter-spacing: 0.28em; }
          .verso-code-input:focus { border-color: #d97757; box-shadow: 0 0 0 3px rgba(217,119,87,0.12); }
          .verso-code-input:disabled { opacity: 0.5; }

          html[data-theme="dark"] .verso-code-input {
            background: rgba(255,255,255,0.04);
            color: #f5f1e8;
            border-color: rgba(255,255,255,0.12);
          }
          html[data-theme="dark"] .verso-code-input::placeholder { color: rgba(255,255,255,0.18); }

          @media (max-width: 768px) {
            .verso-code-input { height: 72px; font-size: 2.2rem; border-radius: 16px; }
          }
        `}</style>
      </div>
    </div>
  );
}
