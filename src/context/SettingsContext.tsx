import { createContext, useContext, useState, useCallback } from "react";
import {
  StreamSettings,
  QualityPreset,
  loadSettings,
  saveSettings,
  PRESETS,
} from "../lib/settings";

type Ctx = {
  settings: StreamSettings;
  update: (patch: Partial<StreamSettings>) => void;
  applyPreset: (preset: Exclude<QualityPreset, "custom">) => void;
};

const SettingsCtx = createContext<Ctx>({
  settings: loadSettings(),
  update: () => {},
  applyPreset: () => {},
});

export function useSettings() { return useContext(SettingsCtx); }

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StreamSettings>(loadSettings);

  const update = useCallback((patch: Partial<StreamSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const applyPreset = useCallback((preset: Exclude<QualityPreset, "custom">) => {
    setSettings((prev) => {
      const next = { ...prev, ...PRESETS[preset], preset };
      saveSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsCtx.Provider value={{ settings, update, applyPreset }}>
      {children}
    </SettingsCtx.Provider>
  );
}
