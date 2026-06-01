export type Codec = "H264" | "H265" | "AV1" | "VP9" | "auto";
export type QualityPreset = "quality" | "balanced" | "performance" | "custom";
export type Resolution = "native" | "1080p" | "1440p" | "4K";
export type DisplayMode = "contain" | "cover";

export type StreamEngine = "browser" | "velocity";

export const ENGINE_LABELS: Record<StreamEngine, string> = {
  browser: "Navigateur",
  velocity: "Velocity",
};

export const ENGINE_INFO: Record<StreamEngine, string> = {
  browser:
    "Moteur compatible : capture et encodage via le navigateur. Fonctionne partout, qualité limitée par WebRTC.",
  velocity:
    "Moteur natif (expérimental) : capture DXGI + encodeur matériel + audio Opus. 60 fps, meilleure qualité. App de bureau uniquement.",
};

export type VelocityResolution = "native" | "1080p";

// Bitrate steps in Mbps — each maps to kbps = value * 1000, last = null (unlimited)
export const BITRATE_STEPS_MBPS = [8, 12, 20, 35, 50, 80, 120, 160] as const;

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
  qualityTuningVersion: number;
  engine: StreamEngine;
  preset: QualityPreset;
  maxBitrateKbps: number | null; // null = unlimited
  targetFps: number;
  codec: Codec;
  audioEnabled: boolean;
  inputThrottleMs: number; // 0 = no throttle, 16 ≈ 60fps, 33 ≈ 30fps
  virtualGamepadSensitivity: number; // mouse pixels → right-stick axis (default 0.025)
  resolution: Resolution;
  displayMode: DisplayMode;
  showStats: boolean;
  lowLatencyMode: boolean;
  requestedBitrateKbps: number | null;
  requestedFps: 30 | 60;
  requestedCodec: Codec;
  velocityTargetFps: 30 | 60;
  velocityResolution: VelocityResolution;
  velocityAudioEnabled: boolean;
  velocityMaxBitrateMbps: number | null;
}

type PresetValues = Pick<StreamSettings, "maxBitrateKbps" | "targetFps" | "codec">;

export const PRESETS: Record<Exclude<QualityPreset, "custom">, PresetValues> = {
  quality:     { maxBitrateKbps: 120_000, targetFps: 60, codec: "H264" },
  balanced:    { maxBitrateKbps: 50_000,  targetFps: 60, codec: "H264" },
  performance: { maxBitrateKbps: 20_000,  targetFps: 30, codec: "H264" },
};

export const DEFAULTS: StreamSettings = {
  qualityTuningVersion: 4,
  engine: "browser",
  preset: "quality",
  maxBitrateKbps: 120_000,
  targetFps: 60,
  codec: "H264",
  audioEnabled: true,
  inputThrottleMs: 0,
  virtualGamepadSensitivity: 0.025,
  resolution: "native",
  displayMode: "contain",
  showStats: false,
  lowLatencyMode: true,
  requestedBitrateKbps: 120_000,
  requestedFps: 60,
  requestedCodec: "auto",
  velocityTargetFps: 60,
  velocityResolution: "native",
  velocityAudioEnabled: true,
  velocityMaxBitrateMbps: null,
};

const STORAGE_KEY = "windirector_settings";

export function loadSettings(): StreamSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<StreamSettings>;
      const migrated: Partial<StreamSettings> = { ...stored };

      if ((stored.qualityTuningVersion ?? 0) < 2) {
        if (stored.preset === "quality" && stored.maxBitrateKbps === 50_000) migrated.maxBitrateKbps = 120_000;
        if (stored.preset === "balanced" && stored.maxBitrateKbps === 20_000) migrated.maxBitrateKbps = 50_000;
        if (stored.preset === "performance" && stored.maxBitrateKbps === 8_000) migrated.maxBitrateKbps = 20_000;
        if (stored.requestedBitrateKbps === null || stored.requestedBitrateKbps === undefined) migrated.requestedBitrateKbps = 50_000;
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

      if ((stored.qualityTuningVersion ?? 0) < 4) {
        if (migrated.engine === undefined) migrated.engine = "browser";
        migrated.qualityTuningVersion = 4;
      }

      return { ...DEFAULTS, ...migrated };
    }
  } catch {}
  return { ...DEFAULTS };
}

export function saveSettings(s: StreamSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
