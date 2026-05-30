"use client";

import { useState, useEffect } from "react";

export interface WebClientSettings {
  /** Mouse move throttle in ms (0 = no throttle). */
  inputThrottleMs: 0 | 16 | 33;
  /** video objectFit mode. */
  displayMode: "contain" | "cover";
  /** Show live WebRTC stats overlay during session. */
  showStats: boolean;
  /** Ultra-low latency mode: minimal jitter buffer + playout delay. */
  lowLatencyMode: boolean;
  /** Prefer hardware video decoding when available. */
  hardwareDecode: boolean;
  /** Touch drag sensitivity multiplier (1.0 = normal). */
  touchSensitivity: number;
  /** Client-requested max bitrate (kbps). Sent to Recto when connected. */
  requestedBitrateKbps: number | null;
  /** Client-requested target FPS. */
  requestedFps: 30 | 60;
  /** Client-requested codec preference. */
  requestedCodec: "H264" | "H265" | "AV1" | "VP9" | "auto";
}

export const WEB_DEFAULTS: WebClientSettings = {
  inputThrottleMs: 0,
  displayMode: "contain",
  showStats: false,
  lowLatencyMode: true,
  hardwareDecode: true,
  touchSensitivity: 1.0,
  requestedBitrateKbps: null,
  requestedFps: 60,
  requestedCodec: "auto",
};

const KEY = "windirector_web_settings";

function load(): WebClientSettings {
  if (typeof window === "undefined") return WEB_DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...WEB_DEFAULTS, ...JSON.parse(raw) } : WEB_DEFAULTS;
  } catch {
    return WEB_DEFAULTS;
  }
}

function save(s: WebClientSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function useWebSettings() {
  const [settings, setSettings] = useState<WebClientSettings>(WEB_DEFAULTS);

  useEffect(() => {
    setSettings(load());
  }, []);

  function update(patch: Partial<WebClientSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }

  return { settings, update };
}
