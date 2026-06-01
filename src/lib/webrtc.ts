import { RealtimeChannel } from "@supabase/supabase-js";
import {
  createSession,
  fetchSession,
  fetchSessionAnswer,
  submitAnswer,
  subscribeToSession,
} from "./signaling";
import { StreamSettings, DEFAULTS } from "./settings";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 8000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    const timer = setTimeout(resolve, timeoutMs);
    const handler = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handler);
  });
}

type CodecCap = { mimeType: string; sdpFmtpLine?: string };

// Returns true for H264 codecs using High (0x64) or Main (0x4d) profile.
// These profiles are the ones browsers map to hardware encoders (NVENC/AMF/QSV).
function isHwFriendlyH264(c: CodecCap): boolean {
  const m = c.sdpFmtpLine?.match(/profile-level-id=([0-9a-fA-F]{6})/i);
  if (!m) return false;
  const profile = parseInt(m[1].slice(0, 2), 16);
  return profile === 0x64 || profile === 0x4d; // High or Main
}

function setCodecPreference(pc: RTCPeerConnection, codec: StreamSettings["codec"]) {
  for (const transceiver of pc.getTransceivers()) {
    if (transceiver.sender.track?.kind !== "video") continue;
    const caps = RTCRtpSender.getCapabilities("video");
    if (!caps) continue;
    const all = caps.codecs;

    const h264hw  = all.filter(c => c.mimeType === "video/H264" && isHwFriendlyH264(c));
    const h264sw  = all.filter(c => c.mimeType === "video/H264" && !isHwFriendlyH264(c));
    const h265    = all.filter(c => c.mimeType === "video/H265");
    const av1     = all.filter(c => c.mimeType === "video/AV1");
    const vp9     = all.filter(c => c.mimeType === "video/VP9");
    const rest    = all.filter(c =>
      !["video/H264", "video/H265", "video/AV1", "video/VP9"].includes(c.mimeType)
    );

    let sorted: typeof all;
    switch (codec) {
      case "H264":
        // Hardware-friendly High/Main profile first, then Baseline, then others
        sorted = [...h264hw, ...h264sw, ...vp9, ...av1, ...h265, ...rest];
        break;
      case "H265":
        sorted = [...h265, ...h264hw, ...h264sw, ...av1, ...vp9, ...rest];
        break;
      case "AV1":
        sorted = [...av1, ...h264hw, ...h265, ...h264sw, ...vp9, ...rest];
        break;
      case "VP9":
        sorted = [...vp9, ...h264hw, ...h264sw, ...av1, ...h265, ...rest];
        break;
      case "auto":
        sorted = [...h264hw, ...h264sw, ...h265, ...av1, ...vp9, ...rest];
        break;
      default:
        sorted = all;
    }

    // Filter out empty lists to avoid passing empty codec arrays
    const filtered = sorted.filter(Boolean);
    if (filtered.length > 0) {
      try { transceiver.setCodecPreferences(filtered); } catch {}
    }
  }
}

async function tuneVideoSender(pc: RTCPeerConnection, settings: StreamSettings) {
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings.length) params.encodings = [{}];
    const enc = params.encodings[0];
    enc.maxFramerate = settings.targetFps;
    enc.scaleResolutionDownBy = 1;
    if (settings.maxBitrateKbps !== null) {
      enc.maxBitrate = settings.maxBitrateKbps * 1000;
      // Absolute 400 kbps floor — NOT a fraction of max. A fractional floor
      // (e.g. 0.1×50 Mbps = 5 Mbps) pins the encoder well above a weak peer's
      // uplink capacity, so it permanently overshoots the link → constant loss →
      // the bandwidth estimator collapses to a few hundred kbps and stays there
      // (blur + freezes). An absolute low floor lets the encoder adapt all the
      // way down to whatever the constrained peer can actually carry.
      (enc as Record<string, unknown>).minBitrate = 400_000;
    } else {
      delete enc.maxBitrate;
      delete (enc as Record<string, unknown>).minBitrate;
    }
    // Keep the FULL resolution under load (drop FPS instead of downscaling).
    // This both keeps text/UI razor-sharp AND makes the encoder spend its bit
    // budget on full-res detail rather than shrinking to 720p — so quality and
    // bitrate utilisation both go up. Only "performance" trades res for fluidity.
    (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
      settings.preset === "performance" ? "maintain-framerate" : "maintain-resolution";
    (enc as Record<string, unknown>).priority = "high";
    (enc as Record<string, unknown>).networkPriority = "high";
    (enc as Record<string, unknown>).scalabilityMode = "L1T1";
    await sender.setParameters(params);
  } catch {}
}

// WebRTC starts encoding around ~300 kbps and ramps up slowly via its bandwidth
// estimator, so the first seconds of a stream look blurry even on a fast link.
// We munge the offer SDP to (a) cap the session bandwidth (b=AS/TIAS) and
// (b) tell Chromium's encoder to *start* near the target bitrate
// (x-google-start-bitrate), so quality reaches the target almost immediately.
export function applyBitrateToSdp(sdp: string, settings: StreamSettings): string {
  try {
    const maxKbps = settings.maxBitrateKbps;
    // Start bitrate: scale with the cap so a fast LAN starts sharp, but ceiling
    // it so we never flood a constrained peer on the first frames. A start that's
    // too high (e.g. 60% of a 50 Mbps cap = 30 Mbps) overshoots a weak return
    // link → packet loss → the estimator collapses to a few hundred kbps and
    // recovers only slowly (additive increase) — the spiral that pins the stream
    // at kb-level. 8 Mbps is high enough to look good immediately on any decent
    // link, low enough that the estimator corrects down within a frame or two.
    // Start HIGH so quality (and bitrate utilisation) reach the target fast on a
    // good link. The estimator still corrects down within a frame or two if the
    // link can't sustain it, so the only cost on a weak link is a brief overshoot
    // — while on LAN/localhost it means the stream looks full-quality immediately
    // instead of crawling up from a few Mbps. Capped at 20 Mbps to avoid a huge
    // first-frame burst.
    const startKbps = maxKbps === null
      ? 20_000
      : Math.min(maxKbps, Math.max(4_000, Math.round(maxKbps * 0.7)), 20_000);
    // Absolute floor (not a fraction of max) so the encoder can ride all the way
    // down to a bad link instead of being pinned above its real capacity.
    const minKbps = 400;

    const lines = sdp.split(/\r\n|\n/);

    // First pass: collect payload types that are real video codecs (skip the
    // retransmission / FEC payloads — rtx, red, ulpfec, flexfec).
    const videoPayloads = new Set<string>();
    let scanningVideo = false;
    for (const line of lines) {
      if (line.startsWith("m=")) scanningVideo = line.startsWith("m=video");
      if (!scanningVideo) continue;
      const m = line.match(/^a=rtpmap:(\d+)\s+([^/]+)\//i);
      if (m && !/^(rtx|red|ulpfec|flexfec)$/i.test(m[2])) videoPayloads.add(m[1]);
    }

    const out: string[] = [];
    let inVideo = false;
    let insertedBandwidth = false;
    for (const line of lines) {
      if (line.startsWith("m=")) {
        inVideo = line.startsWith("m=video");
        insertedBandwidth = false;
        out.push(line);
        continue;
      }
      out.push(line);
      // Bandwidth cap goes right after the connection (c=) line of the m=video block.
      if (inVideo && !insertedBandwidth && line.startsWith("c=") && maxKbps !== null) {
        out.push(`b=AS:${maxKbps}`);
        out.push(`b=TIAS:${maxKbps * 1000}`);
        insertedBandwidth = true;
      }
      // Start/min/max hints attach to the codec's own fmtp line.
      if (inVideo && line.startsWith("a=fmtp:")) {
        const pt = line.slice("a=fmtp:".length).split(" ")[0];
        if (videoPayloads.has(pt)) {
          let hints = `x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps}`;
          if (maxKbps !== null) hints += `;x-google-max-bitrate=${maxKbps}`;
          out[out.length - 1] = `${line};${hints}`;
        }
      }
    }
    return out.join("\r\n");
  } catch {
    return sdp;
  }
}

function applyContentHint(stream: MediaStream, settings: StreamSettings) {
  // "detail" keeps text/UI razor-sharp (favors spatial quality); "motion" keeps
  // movement smooth (favors temporal continuity). The quality preset is the only
  // one that trades fluidity for sharpness — everything else prioritizes smooth,
  // stable FPS, which is what feels best for remote control.
  // "detail" favours spatial sharpness (every pixel crisp), "motion" favours
  // temporal smoothness. Since we now keep full resolution under load
  // (maintain-resolution), bias toward "detail" so text/UI stay razor-sharp;
  // only "performance" (which trades resolution for fluidity) prefers "motion".
  const contentHint = settings.preset === "performance" ? "motion" : "detail";

  for (const track of stream.getVideoTracks()) {
    try {
      (track as MediaStreamTrack & { contentHint: string }).contentHint = contentHint;
    } catch {}
  }
}

// ─── TEMP DIAGNOSTIC (à retirer) ───────────────────────────────────────────
// Dumps the latency-critical RTCStats fields as one compact console line.
// `role` distinguishes the two ends; paste both outputs to diagnose where the
// latency / quality budget is going (encode vs decode vs jitter buffer vs link).
function n(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export function logWebRTCDiagnostics(report: RTCStatsReport, role: "RECTO" | "VERSO"): void {
  const stats = report as unknown as Map<string, Record<string, unknown>>;
  let out: Record<string, unknown> | null = null; // outbound video (sender)
  let inb: Record<string, unknown> | null = null; // inbound video (receiver)
  let pair: Record<string, unknown> | null = null;
  let codecMime = "?";

  stats.forEach((s) => {
    if (s.type === "outbound-rtp" && s.kind === "video") out = s;
    else if (s.type === "inbound-rtp" && s.kind === "video") inb = s;
    else if (s.type === "candidate-pair" && (s.nominated || s.selected)) pair = s;
  });

  const codecOwner = (out ?? inb) as Record<string, unknown> | null;
  if (codecOwner?.codecId) {
    const c = stats.get(codecOwner.codecId as string);
    if (c?.mimeType) codecMime = (c.mimeType as string).replace("video/", "");
  }

  const rttMs = pair ? Math.round(n((pair as Record<string, unknown>).currentRoundTripTime) * 1000) : -1;
  const parts: string[] = [`[DIAG ${role}]`, `codec=${codecMime}`, `rtt=${rttMs}ms`];

  if (out) {
    const o = out as Record<string, unknown>;
    const enc = n(o.totalEncodeTime) / Math.max(1, n(o.framesEncoded));
    parts.push(
      `ENC=${o.encoderImplementation ?? "?"}`,
      `res=${n(o.frameWidth)}x${n(o.frameHeight)}`,
      `fps=${Math.round(n(o.framesPerSecond))}`,
      `encTime=${(enc * 1000).toFixed(1)}ms/f`,
      `qLimit=${o.qualityLimitationReason ?? "?"}`,
      `targetKbps=${Math.round(n(o.targetBitrate) / 1000)}`
    );
    if (pair) parts.push(`availOutKbps=${Math.round(n((pair as Record<string, unknown>).availableOutgoingBitrate) / 1000)}`);
  }

  if (inb) {
    const i = inb as Record<string, unknown>;
    const jbDelay = n(i.jitterBufferDelay) / Math.max(1, n(i.jitterBufferEmittedCount));
    const dec = n(i.totalDecodeTime) / Math.max(1, n(i.framesDecoded));
    parts.push(
      `DEC=${i.decoderImplementation ?? "?"}`,
      `res=${n(i.frameWidth)}x${n(i.frameHeight)}`,
      `fps=${Math.round(n(i.framesPerSecond))}`,
      `decTime=${(dec * 1000).toFixed(1)}ms/f`,
      `jitterBuf=${(jbDelay * 1000).toFixed(0)}ms`,
      `freezes=${n(i.freezeCount)}`,
      `frozen=${n(i.totalFreezesDuration).toFixed(1)}s`
    );
  }

  console.log(parts.join(" "));
}
// ───────────────────────────────────────────────────────────────────────────

export type RectoCallbacks = {
  onCode: (code: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
};

export type PeerIdentity = { name: string; avatar: string | null };

export type HwEncoderCaps = {
  gpuName: string;
  vendor: string;
  nvenc: boolean;
  amf: boolean;
  qsv: boolean;
};

export type VersoCallbacks = {
  onStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
  onInputChannel: (channel: RTCDataChannel) => void;
  onDisplayInfo: (width: number, height: number) => void;
  onIdentity: (identity: PeerIdentity) => void;
  onHwCaps?: (caps: HwEncoderCaps) => void;
  onClientSettings?: (s: { maxBitrateKbps: number | null; targetFps: 30 | 60; codec: StreamSettings["codec"] }) => void;
};

export class RectoConnection {
  private pc: RTCPeerConnection;
  private sessionChannel: RealtimeChannel | null = null;
  private inputChannel: RTCDataChannel | null = null;
  public code = "";

  constructor(private cb: RectoCallbacks, private settings: StreamSettings = DEFAULTS) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.inputChannel = this.pc.createDataChannel("input", {
      ordered: false,
      maxRetransmits: 0,
    });

    this.pc.oniceconnectionstatechange = () => {
      if (
        this.pc.iceConnectionState === "connected" ||
        this.pc.iceConnectionState === "completed"
      ) {
        this.cb.onConnected();
        // Small delay: let the DTLS/SRTP handshake complete and the first
        // encoder params be populated before we try to override them.
        setTimeout(() => tuneVideoSender(this.pc, this.settings), 250);
      }
      if (
        this.pc.iceConnectionState === "disconnected" ||
        this.pc.iceConnectionState === "failed" ||
        this.pc.iceConnectionState === "closed"
      ) {
        this.cb.onDisconnected();
      }
    };
  }

  async applySettings(settings: StreamSettings) {
    this.settings = settings;
    if (
      this.pc.iceConnectionState === "connected" ||
      this.pc.iceConnectionState === "completed"
    ) {
      await tuneVideoSender(this.pc, settings);
    }
  }

  async start(stream: MediaStream) {
    applyContentHint(stream, this.settings);
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
    setCodecPreference(this.pc, this.settings.codec);
    await tuneVideoSender(this.pc, this.settings);

    const offer = await this.pc.createOffer();
    if (offer.sdp) offer.sdp = applyBitrateToSdp(offer.sdp, this.settings);
    await this.pc.setLocalDescription(offer);
    await waitForIceGathering(this.pc);
    const completeOffer = this.pc.localDescription!;

    this.code = await createSession(completeOffer);
    this.cb.onCode(this.code);

    const session = await fetchSession(this.code);

    const applyAnswer = async (answer: RTCSessionDescriptionInit) => {
      if (!this.pc.remoteDescription) {
        await this.pc.setRemoteDescription(answer);
      }
    };

    this.sessionChannel = subscribeToSession(session.id, async (update) => {
      if (update.answer) await applyAnswer(update.answer as RTCSessionDescriptionInit);
    });

    const existing = await fetchSessionAnswer(session.id);
    if (existing) await applyAnswer(existing);
  }

  getInputChannel(): RTCDataChannel | null {
    return this.inputChannel;
  }

  getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  sendMeta(data: object) {
    if (this.inputChannel?.readyState === "open") {
      this.inputChannel.send(JSON.stringify(data));
    }
  }

  stop() {
    this.pc.close();
    this.sessionChannel?.unsubscribe();
  }
}

export class VersoConnection {
  private pc: RTCPeerConnection;

  constructor(private cb: VersoCallbacks) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.cb.onStream(e.streams[0]);
    };

    this.pc.ondatachannel = (e) => {
      if (e.channel.label !== "input") return;
      const ch = e.channel;

      ch.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "displayInfo") {
            this.cb.onDisplayInfo(data.width, data.height);
          } else if (data.type === "identity") {
            this.cb.onIdentity({ name: data.name, avatar: data.avatar ?? null });
          } else if (data.type === "hwCaps" && this.cb.onHwCaps) {
            this.cb.onHwCaps({
              gpuName: data.gpuName ?? "",
              vendor: data.vendor ?? "unknown",
              nvenc: !!data.nvenc,
              amf: !!data.amf,
              qsv: !!data.qsv,
            });
          } else if (data.type === "clientSettings" && this.cb.onClientSettings) {
            this.cb.onClientSettings({
              maxBitrateKbps: data.maxBitrateKbps ?? null,
              targetFps: data.targetFps ?? 60,
              codec: data.codec ?? "auto",
            });
          } else if (data.type === "velocityDiag") {
            console.info("[VELOCITY]", data.event, data.payload);
          }
        } catch {}
      };

      if (ch.readyState === "open") {
        this.cb.onInputChannel(ch);
      } else {
        ch.onopen = () => this.cb.onInputChannel(ch);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (
        this.pc.iceConnectionState === "connected" ||
        this.pc.iceConnectionState === "completed"
      ) {
        this.cb.onConnected();
      }
      if (
        this.pc.iceConnectionState === "disconnected" ||
        this.pc.iceConnectionState === "failed" ||
        this.pc.iceConnectionState === "closed"
      ) {
        this.cb.onDisconnected();
      }
    };
  }

  async connect(
    code: string,
    requestedCodec: StreamSettings["codec"] = "auto",
    lowLatency = true
  ) {
    const session = await fetchSession(code);
    if (!session.offer) throw new Error("Pas d'offre disponible");

    await this.pc.setRemoteDescription(session.offer);
    this.setReceiverCodecPreference(requestedCodec);
    // Receivers exist once the remote (offer) description is applied — tune them
    // for low latency before answering so the first decoded frames are immediate.
    this.applyReceiverLatencyHints(lowLatency);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceGathering(this.pc);
    const completeAnswer = this.pc.localDescription!;

    await submitAnswer(code, completeAnswer);
  }

  // Trim the receive-side buffering so input feels responsive. playoutDelayHint
  // and jitterBufferTarget live on RTCRtpReceiver (not the <video> element — a
  // common mistake that silently no-ops). Setting them to 0 tells the engine to
  // render frames as soon as they arrive instead of holding a smoothing buffer.
  setLowLatency(enabled: boolean) {
    this.applyReceiverLatencyHints(enabled);
  }

  private applyReceiverLatencyHints(enabled: boolean) {
    for (const r of this.pc.getReceivers()) {
      if (r.track?.kind !== "video") continue;
      try {
        (r as RTCRtpReceiver & { playoutDelayHint?: number }).playoutDelayHint =
          enabled ? 0 : undefined;
      } catch {}
      try {
        if ("jitterBufferTarget" in r) {
          (r as RTCRtpReceiver & { jitterBufferTarget?: number | null }).jitterBufferTarget =
            enabled ? 0 : null;
        }
      } catch {}
    }
  }

  private setReceiverCodecPreference(codec: StreamSettings["codec"]) {
    for (const transceiver of this.pc.getTransceivers()) {
      if (transceiver.receiver.track.kind !== "video") continue;
      const caps = RTCRtpReceiver.getCapabilities("video");
      if (!caps) continue;

      const all = caps.codecs;
      const h264hw = all.filter((c) => c.mimeType === "video/H264" && isHwFriendlyH264(c));
      const h264sw = all.filter((c) => c.mimeType === "video/H264" && !isHwFriendlyH264(c));
      const h265 = all.filter((c) => c.mimeType === "video/H265");
      const av1 = all.filter((c) => c.mimeType === "video/AV1");
      const vp9 = all.filter((c) => c.mimeType === "video/VP9");
      const rest = all.filter((c) => !["video/H264", "video/H265", "video/AV1", "video/VP9"].includes(c.mimeType));

      let sorted: typeof all;
      switch (codec) {
        case "H264":
          sorted = [...h264hw, ...h264sw, ...h265, ...av1, ...vp9, ...rest];
          break;
        case "H265":
          sorted = [...h265, ...h264hw, ...h264sw, ...av1, ...vp9, ...rest];
          break;
        case "AV1":
          sorted = [...av1, ...h265, ...h264hw, ...h264sw, ...vp9, ...rest];
          break;
        case "VP9":
          sorted = [...vp9, ...h265, ...h264hw, ...h264sw, ...av1, ...rest];
          break;
        default:
          sorted = [...h264hw, ...h264sw, ...h265, ...av1, ...vp9, ...rest];
      }

      try { transceiver.setCodecPreferences(sorted.filter(Boolean)); } catch {}
    }
  }

  getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  stop() {
    this.pc.close();
  }
}
