"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type QualityPreset,
  type Codec,
  type Resolution,
  type DisplayMode,
  type StreamEngine,
  PRESETS,
} from "../../src/lib/settings";

export interface WebClientSettings {
  qualityTuningVersion: number;
  // Engine selector. On the web, Velocity (native) is never usable — the field
  // exists for parity and to display the disabled choice, but stays "browser".
  engine: StreamEngine;
  preset: QualityPreset;
  maxBitrateKbps: number | null;
  targetFps: number;
  codec: Codec;
  audioEnabled: boolean;
  resolution: Resolution;
  inputThrottleMs: 0 | 16 | 33;
  displayMode: DisplayMode;
  showStats: boolean;
  lowLatencyMode: boolean;
  virtualGamepadSensitivity: number;
  requestedBitrateKbps: number | null;
  requestedFps: 30 | 60;
  requestedCodec: Codec;
  hardwareDecode: boolean;
  touchSensitivity: number;
}

export const WEB_DEFAULTS: WebClientSettings = {
  qualityTuningVersion: 4,
  engine: "browser",
  preset: "quality",
  maxBitrateKbps: 120_000,
  targetFps: 60,
  codec: "H264",
  audioEnabled: true,
  resolution: "native",
  inputThrottleMs: 0,
  displayMode: "contain",
  showStats: false,
  lowLatencyMode: true,
  virtualGamepadSensitivity: 0.025,
  requestedBitrateKbps: 120_000,
  requestedFps: 60,
  requestedCodec: "auto",
  hardwareDecode: true,
  touchSensitivity: 1.0,
};

const KEY = "windirector_web_settings";

function load(): WebClientSettings {
  if (typeof window === "undefined") return WEB_DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return WEB_DEFAULTS;

    const stored = JSON.parse(raw) as Partial<WebClientSettings>;
    const migrated: Partial<WebClientSettings> = { ...stored };
    if ((stored.qualityTuningVersion ?? 0) < 2) {
      if (stored.requestedBitrateKbps === null || stored.requestedBitrateKbps === undefined) {
        migrated.requestedBitrateKbps = 50_000;
      }
      migrated.qualityTuningVersion = 2;
    }

    if ((stored.qualityTuningVersion ?? 0) < 3) {
      if (
        (migrated.preset ?? stored.preset) === "balanced" &&
        (migrated.maxBitrateKbps ?? stored.maxBitrateKbps) === 50_000 &&
        (migrated.requestedBitrateKbps ?? stored.requestedBitrateKbps) === 50_000
      ) {
        migrated.preset = "quality";
        migrated.maxBitrateKbps = 120_000;
        migrated.requestedBitrateKbps = 120_000;
        migrated.resolution = "native";
      }
      migrated.qualityTuningVersion = 3;
    }

    // v4: engine selector (web always stays browser).
    if ((stored.qualityTuningVersion ?? 0) < 4) {
      migrated.engine = "browser";
      migrated.qualityTuningVersion = 4;
    }

    return { ...WEB_DEFAULTS, ...migrated };
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

  const applyPreset = useCallback((preset: Exclude<QualityPreset, "custom">) => {
    setSettings((prev) => {
      const next = { ...prev, ...PRESETS[preset], preset };
      save(next);
      return next;
    });
  }, []);

  return { settings, update, applyPreset };
}
