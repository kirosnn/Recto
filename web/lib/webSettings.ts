"use client";

import { useState, useEffect } from "react";

export interface WebClientSettings {
  /** Mouse move throttle in ms (0 = no throttle). */
  inputThrottleMs: 0 | 16 | 33;
  /** video objectFit mode. */
  displayMode: "contain" | "cover";
  /** Show live WebRTC stats overlay during session. */
  showStats: boolean;
}

export const WEB_DEFAULTS: WebClientSettings = {
  inputThrottleMs: 0,
  displayMode: "contain",
  showStats: false,
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
