export type Codec = "H264" | "H265" | "AV1" | "VP9" | "auto";
export type QualityPreset = "quality" | "balanced" | "performance" | "custom";
export type Resolution = "native" | "1080p" | "1440p" | "4K";

// Bitrate steps in Mbps — each maps to kbps = value * 1000, last = null (unlimited)
export const BITRATE_STEPS_MBPS = [3, 5, 8, 12, 20, 30, 50, 80] as const;

export function bitrateStepToKbps(idx: number): number | null {
  return idx >= BITRATE_STEPS_MBPS.length ? null : BITRATE_STEPS_MBPS[idx] * 1000;
}

export function kbpsToStepIdx(kbps: number | null): number {
  if (kbps === null) return BITRATE_STEPS_MBPS.length;
  const mbps = kbps / 1000;
  const idx = BITRATE_STEPS_MBPS.indexOf(mbps as typeof BITRATE_STEPS_MBPS[number]);
  return idx >= 0 ? idx : BITRATE_STEPS_MBPS.findIndex((v) => v * 1000 >= kbps) || 4;
}

export function bitrateLabel(kbps: number | null): string {
  if (kbps === null) return "Illimité";
  if (kbps >= 1000) return `${kbps / 1000} Mbps`;
  return `${kbps} Kbps`;
}

export interface StreamSettings {
  preset: QualityPreset;
  maxBitrateKbps: number | null; // null = unlimited
  targetFps: number;
  codec: Codec;
  audioEnabled: boolean;
  inputThrottleMs: number; // 0 = no throttle, 16 ≈ 60fps, 33 ≈ 30fps
  virtualGamepadSensitivity: number; // mouse pixels → right-stick axis (default 0.025)
  resolution: Resolution;
}

type PresetValues = Pick<StreamSettings, "maxBitrateKbps" | "targetFps" | "codec">;

export const PRESETS: Record<Exclude<QualityPreset, "custom">, PresetValues> = {
  // 50 Mbps — LAN / fibre très haut débit, 1440p–4K@60fps
  quality:     { maxBitrateKbps: 50_000, targetFps: 60, codec: "H264" },
  // 20 Mbps — fibre standard, 1080p@60fps ou 1440p@60fps
  balanced:    { maxBitrateKbps: 20_000, targetFps: 60, codec: "H264" },
  // 8 Mbps — ADSL / 4G / connexion limitée, 1080p@30fps
  performance: { maxBitrateKbps: 8_000,  targetFps: 30, codec: "H264" },
};

export const DEFAULTS: StreamSettings = {
  preset: "balanced",
  maxBitrateKbps: 20_000,
  targetFps: 60,
  codec: "H264",
  audioEnabled: true,
  inputThrottleMs: 0,
  virtualGamepadSensitivity: 0.025,
  resolution: "native",
};

const STORAGE_KEY = "windirector_settings";

export function loadSettings(): StreamSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export function saveSettings(s: StreamSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
