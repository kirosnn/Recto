"use client";

import { useEffect, useRef, useState } from "react";

export interface LiveStats {
  codec: string;
  resolution: string;
  bitrateKbps: number;
  fps: number;
  rttMs: number;
  jitterMs: number;
  packetLossRate: number;
  qualityLimit: string;
  decoderImpl: string;
}

interface Props {
  getStats: () => Promise<RTCStatsReport>;
  visible: boolean;
}

function fmt(n: number, dec = 1) {
  return n.toFixed(dec);
}

export default function StatsOverlay({ getStats, visible }: Props) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRef = useRef<{ bytesSent?: number; ts?: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    const collect = async () => {
      let report: RTCStatsReport;
      try { report = await getStats(); } catch { return; }

      let codec = "—", resolution = "—", fps = 0, rttMs = 0, jitterMs = 0;
      let packetLossRate = 0, qualityLimit = "none", decoderImpl = "—";
      let bitrateKbps = 0;
      let bytesReceived = 0;

      report.forEach((s: RTCStats & Record<string, unknown>) => {
        if (s.type === "inbound-rtp" && s.kind === "video") {
          fps           = (s.framesPerSecond as number) || 0;
          jitterMs      = ((s.jitter as number) || 0) * 1000;
          decoderImpl   = (s.decoderImplementation as string) || "—";
          const lost    = (s.packetsLost as number) || 0;
          const recv    = (s.packetsReceived as number) || 0;
          packetLossRate = recv + lost > 0 ? lost / (recv + lost) : 0;
          // Bitrate from bytesReceived delta
          const now     = Date.now();
          const bytes   = (s.bytesReceived as number) || 0;
          if (prevRef.current?.bytesSent && prevRef.current?.ts) {
            const dt = (now - prevRef.current.ts) / 1000;
            bitrateKbps = ((bytes - prevRef.current.bytesSent) * 8) / dt / 1000;
          }
          bytesReceived = bytes;
          prevRef.current = { bytesSent: bytes, ts: now };
          if (s.frameWidth && s.frameHeight)
            resolution = `${s.frameWidth}×${s.frameHeight}`;
        }
        if (s.type === "remote-inbound-rtp" && s.kind === "video") {
          rttMs = ((s.roundTripTime as number) || 0) * 1000;
        }
        if (s.type === "codec" && (s.mimeType as string)?.startsWith("video/")) {
          const fmtp  = (s.sdpFmtpLine as string) || "";
          const m     = fmtp.match(/profile-level-id=([0-9a-fA-F]{6})/i);
          const prof  = m
            ? (parseInt(m[1].slice(0, 2), 16) === 0x64 ? " High" : " Main")
            : "";
          codec = ((s.mimeType as string).replace("video/", "") + prof).trim();
        }
      });

      setStats({ codec, resolution, bitrateKbps, fps, rttMs, jitterMs, packetLossRate, qualityLimit, decoderImpl });
    };

    collect();
    intervalRef.current = setInterval(collect, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [visible, getStats]);

  if (!visible || !stats) return null;

  const loss = (stats.packetLossRate * 100).toFixed(2);
  const br   = stats.bitrateKbps >= 1000
    ? `${fmt(stats.bitrateKbps / 1000, 1)} Mbps`
    : `${fmt(stats.bitrateKbps, 0)} Kbps`;

  const lossColor = parseFloat(loss) < 0.1 ? "#4caf7d"
    : parseFloat(loss) < 1   ? "#e6c84a"
    : "#c4623e";

  const bitrateColor = stats.bitrateKbps > 15_000 ? "#4caf7d"
    : stats.bitrateKbps > 5_000 ? "#e6c84a"
    : "#c4623e";

  const rows: [string, string, string?][] = [
    ["Codec",     stats.codec],
    ["Résolution",stats.resolution],
    ["Bitrate",   br,   bitrateColor],
    ["FPS",       fmt(stats.fps, 0) + " fps"],
    ["RTT",       stats.rttMs > 0 ? fmt(stats.rttMs, 1) + " ms" : "—"],
    ["Jitter",    fmt(stats.jitterMs, 2) + " ms"],
    ["Perte",     loss + "%", lossColor],
    ["Décodeur",  stats.decoderImpl.slice(0, 18)],
  ];

  return (
    <div
      style={{
        position: "absolute", top: 10, left: 10, zIndex: 20,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)",
        borderRadius: 10, padding: "10px 14px",
        border: "1px solid rgba(255,255,255,0.1)",
        pointerEvents: "none", minWidth: 190,
      }}
    >
      <div style={{
        fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em",
        color: "rgba(255,255,255,0.4)", marginBottom: 8,
      }}>
        Stats WebRTC · Ctrl+Alt+S
      </div>
      {rows.map(([label, value, c]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)" }}>{label}</span>
          <span style={{ fontSize: "0.75rem", color: c || "rgba(255,255,255,0.85)", fontFamily: "monospace" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
