import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/useAuth";
import {
  BITRATE_STEPS_MBPS,
  bitrateStepToKbps,
  kbpsToStepIdx,
  bitrateLabel,
  type QualityPreset,
  type Resolution,
} from "../lib/settings";

const PRESET_LABELS: Record<Exclude<QualityPreset, "custom">, { label: string; hint: string }> = {
  quality:     { label: "Qualité",     hint: "LAN · 1440p–4K@60fps · 50 Mbps" },
  balanced:    { label: "Équilibré",   hint: "Fibre · 1080p@60fps · 20 Mbps" },
  performance: { label: "Performance", hint: "ADSL/4G · 1080p@30fps · 8 Mbps" },
};

const RESOLUTION_LABELS: Record<Resolution, string> = {
  native: "Natif",
  "1080p": "1080p",
  "1440p": "1440p",
  "4K": "4K",
};

const CODEC_INFO: Record<string, string> = {
  H264:  "H.264 High Profile — compatible partout, accélération GPU universelle (NVENC/AMF/QSV)",
  H265:  "H.265/HEVC — ~40% moins de bande passante que H264, navigateurs récents",
  AV1:   "AV1 — ultra-efficace, GPU récents (NVIDIA RTX 30xx, AMD RDNA3, Intel Arc)",
  VP9:   "VP9 — compatible tous navigateurs, CPU uniquement",
  auto:  "Le navigateur choisit automatiquement le meilleur codec disponible",
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { settings, update, applyPreset } = useSettings();
  const { user, signOut } = useAuth();

  const name = user?.user_metadata?.full_name
    || user?.user_metadata?.custom_claims?.global_name
    || user?.email?.split("@")[0] || "";
  const avatar = user?.user_metadata?.avatar_url as string | undefined;

  const bitrateIdx = kbpsToStepIdx(settings.maxBitrateKbps);

  return (
    <div style={{ height: "100%", overflowY: "auto", position: "relative" }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="back-btn"
        aria-label="Retour"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "clamp(56px,6vw,72px) clamp(16px,4vw,32px) 48px" }}>

        <h1 className="serif" style={{ fontSize: "clamp(1.8rem,3vw,2.4rem)", letterSpacing: "-0.04em", color: "var(--tx)", marginBottom: "clamp(28px,4vw,40px)" }}>
          Paramètres.
        </h1>

        {/* ─── GÉNÉRAL ───────────────────────────────────────── */}
        <Section label="Général">
          <Row label="Thème" last>
            <div className="pref-options pref-options-inline">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`pref-option pref-option-sm${theme === t ? " is-active" : ""}`}
                  onClick={() => { if (theme !== t) toggle(); }}
                >
                  {t === "dark" ? "Sombre" : "Clair"}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* ─── HÔTE · RECTO ──────────────────────────────────── */}
        <Section label="Hôte · Recto" sub="Paramètres de capture et d'encodage vidéo">

          {/* Preset */}
          <Block label="Profil de qualité">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(PRESET_LABELS) as Exclude<QualityPreset, "custom">[]).map((p) => {
                const { label, hint } = PRESET_LABELS[p];
                const active = settings.preset === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    style={{
                      flex: "1 1 0",
                      minWidth: 100,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: active ? "1px solid transparent" : "1px solid var(--border-2)",
                      background: active
                        ? "linear-gradient(180deg,#505050 0%,#232323 45%,#161616 100%)"
                        : "var(--bg-alt)",
                      color: active ? "#f5f3ee" : "var(--tx)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 160ms ease",
                      boxShadow: active
                        ? "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.36), 0 4px 12px rgba(0,0,0,0.14)"
                        : "none",
                    }}
                  >
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: "0.72rem", color: active ? "rgba(245,243,238,0.6)" : "var(--tx-3)", lineHeight: 1.4 }}>{hint}</div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => update({ preset: "custom" })}
                style={{
                  flex: "1 1 0",
                  minWidth: 80,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: settings.preset === "custom" ? "1px solid transparent" : "1px solid var(--border-2)",
                  background: settings.preset === "custom"
                    ? "linear-gradient(180deg,#505050 0%,#232323 45%,#161616 100%)"
                    : "var(--bg-alt)",
                  color: settings.preset === "custom" ? "#f5f3ee" : "var(--tx)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 160ms ease",
                  boxShadow: settings.preset === "custom"
                    ? "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.36), 0 4px 12px rgba(0,0,0,0.14)"
                    : "none",
                }}
              >
                <div style={{ fontSize: "0.88rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 3 }}>Perso</div>
                <div style={{ fontSize: "0.72rem", color: settings.preset === "custom" ? "rgba(245,243,238,0.6)" : "var(--tx-3)", lineHeight: 1.4 }}>Valeurs manuelles</div>
              </button>
            </div>
          </Block>

          {/* Codec */}
          <Block label="Codec vidéo">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["H264", "H265", "AV1", "VP9", "auto"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`pref-option pref-option-sm${settings.codec === c ? " is-active" : ""}`}
                  onClick={() => update({ codec: c, preset: "custom" })}
                  title={CODEC_INFO[c]}
                >
                  {c === "auto" ? "Auto" : c}
                </button>
              ))}
            </div>
            <p style={{ marginTop: 8, fontSize: "0.76rem", color: "var(--tx-3)", lineHeight: 1.5 }}>
              {CODEC_INFO[settings.codec]}
            </p>
          </Block>

          {/* Bitrate */}
          <Block label={`Bitrate max  ·  ${bitrateLabel(settings.maxBitrateKbps)}`}>
            <input
              type="range"
              className="pref-slider"
              min={0}
              max={BITRATE_STEPS_MBPS.length}
              step={1}
              value={bitrateIdx}
              onChange={(e) => update({ maxBitrateKbps: bitrateStepToKbps(Number(e.target.value)), preset: "custom" })}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <span>3 Mbps</span>
              <span>80 Mbps</span>
              <span>∞</span>
            </div>
          </Block>

          {/* FPS */}
          <Row label="FPS cible">
            <div className="pref-options pref-options-inline">
              {([30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  className={`pref-option pref-option-sm${settings.targetFps === fps ? " is-active" : ""}`}
                  onClick={() => update({ targetFps: fps, preset: "custom" })}
                >
                  {fps}
                </button>
              ))}
            </div>
          </Row>

          {/* Résolution */}
          <Row label="Résolution capture">
            <div className="pref-options pref-options-inline">
              {(Object.keys(RESOLUTION_LABELS) as Resolution[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`pref-option pref-option-sm${settings.resolution === r ? " is-active" : ""}`}
                  onClick={() => update({ resolution: r })}
                >
                  {RESOLUTION_LABELS[r]}
                </button>
              ))}
            </div>
          </Row>

          {/* Audio */}
          <Row label="Audio système" last>
            <button
              type="button"
              className={`pref-toggle-pill${settings.audioEnabled ? " is-on" : ""}`}
              onClick={() => update({ audioEnabled: !settings.audioEnabled })}
              aria-pressed={settings.audioEnabled}
            >
              <span className="pref-toggle-pill-knob" />
            </button>
          </Row>
        </Section>

        {/* ─── CLIENT · VERSO ────────────────────────────────── */}
        <Section label="Client · Verso" sub="Paramètres de contrôle à distance">

          {/* Mouse throttle */}
          <Row label="Latence souris">
            <div className="pref-options pref-options-inline">
              {([
                { label: "Max",   ms: 0 },
                { label: "60fps", ms: 16 },
                { label: "30fps", ms: 33 },
              ] as const).map(({ label, ms }) => (
                <button
                  key={ms}
                  type="button"
                  className={`pref-option pref-option-sm${settings.inputThrottleMs === ms ? " is-active" : ""}`}
                  onClick={() => update({ inputThrottleMs: ms })}
                >
                  {label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Ajustement vidéo">
            <div className="pref-options pref-options-inline">
              {(["contain", "cover"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`pref-option pref-option-sm${settings.displayMode === mode ? " is-active" : ""}`}
                  onClick={() => update({ displayMode: mode })}
                >
                  {mode === "contain" ? "Letterbox" : "Plein"}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Stats overlay">
            <button
              type="button"
              className={`pref-toggle-pill${settings.showStats ? " is-on" : ""}`}
              onClick={() => update({ showStats: !settings.showStats })}
              aria-pressed={settings.showStats}
            >
              <span className="pref-toggle-pill-knob" />
            </button>
          </Row>

          <Row label="Mode ultra basse latence">
            <button
              type="button"
              className={`pref-toggle-pill${settings.lowLatencyMode ? " is-on" : ""}`}
              onClick={() => update({ lowLatencyMode: !settings.lowLatencyMode })}
              aria-pressed={settings.lowLatencyMode}
            >
              <span className="pref-toggle-pill-knob" />
            </button>
          </Row>

          <Block label={`Sensibilité manette virtuelle  ·  ${Math.round(settings.virtualGamepadSensitivity * 1000) / 10}`}>
            <input
              type="range"
              className="pref-slider"
              min={1} max={100} step={1}
              value={Math.round(settings.virtualGamepadSensitivity * 1000)}
              onChange={(e) => update({ virtualGamepadSensitivity: Number(e.target.value) / 1000 })}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <span>Lent</span>
              <span>Rapide</span>
            </div>
          </Block>

          <Block label="Qualité demandée au Recto">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>Codec préféré</span>
                <div className="pref-options pref-options-inline">
                  {(["auto", "H264", "H265", "AV1", "VP9"] as const).map((codec) => (
                    <button
                      key={codec}
                      type="button"
                      className={`pref-option pref-option-sm${settings.requestedCodec === codec ? " is-active" : ""}`}
                      onClick={() => update({ requestedCodec: codec })}
                    >
                      {codec === "auto" ? "Auto" : codec}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}>FPS demandé</span>
                <div className="pref-options pref-options-inline">
                  {([30, 60] as const).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      className={`pref-option pref-option-sm${settings.requestedFps === fps ? " is-active" : ""}`}
                      onClick={() => update({ requestedFps: fps })}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, fontSize: "0.82rem", color: "var(--tx-2)" }}>
                  <span>Bitrate max demandé</span>
                  <span>{bitrateLabel(settings.requestedBitrateKbps)}</span>
                </div>
                <input
                  type="range"
                  className="pref-slider"
                  min={0}
                  max={80}
                  step={1}
                  value={settings.requestedBitrateKbps ? Math.min(80, settings.requestedBitrateKbps / 1000) : 0}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    update({ requestedBitrateKbps: value === 0 ? null : value * 1000 });
                  }}
                />
              </div>
            </div>
          </Block>

          <Block label="Raccourcis en session" last>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["Ctrl+Alt+G", "Activer / désactiver la manette virtuelle"],
                ["Ctrl+Alt+S", "Afficher les stats réseau en temps réel"],
                ["Ctrl+Alt+H", "Masquer / afficher l'interface"],
                ["Échap",      "Libérer la souris"],
              ].map(([keys, desc]) => (
                <div key={keys} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.8rem" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--tx-2)", background: "var(--bg-alt)", padding: "2px 7px", borderRadius: 5, border: "1px solid var(--border-2)", whiteSpace: "nowrap" }}>{keys}</span>
                  <span style={{ color: "var(--tx-3)", textAlign: "right" }}>{desc}</span>
                </div>
              ))}
            </div>
          </Block>
        </Section>

        {/* ─── COMPTE ────────────────────────────────────────── */}
        {user && (
          <Section label="Compte">
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
              {avatar
                ? <img src={avatar} alt={name} className="pref-avatar" style={{ width: 40, height: 40 }} />
                : <div className="pref-avatar pref-avatar-initials" style={{ width: 40, height: 40, fontSize: 16 }}>{name[0]?.toUpperCase()}</div>
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.92rem", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tx)" }}>{name}</div>
                {user.email && <div style={{ fontSize: "0.8rem", color: "var(--tx-3)", marginTop: 1 }}>{user.email}</div>}
              </div>
            </div>
            <div style={{ padding: "12px 18px" }}>
              <button
                type="button"
                className="pref-logout"
                style={{ width: "100%" }}
                onClick={signOut}
              >
                Se déconnecter
              </button>
            </div>
          </Section>
        )}

        {/* version */}
        <p style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--tx-3)", marginTop: 8 }}>
          WinDirector · Recto
        </p>
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────── */

function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--tx-3)" }}>
          {label}
        </span>
        {sub && <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--tx-3)" }}>{sub}</p>}
      </div>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: 16,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "13px 18px",
      borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      <span style={{ fontSize: "0.88rem", color: "var(--tx)", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Block({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "13px 18px",
      borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--tx-2)", marginBottom: 10, letterSpacing: "-0.01em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}
