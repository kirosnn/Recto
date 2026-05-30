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
        // Prefer hardware-friendly order: H265 > AV1 > H264-HW > VP9
        sorted = [...h265, ...av1, ...h264hw, ...h264sw, ...vp9, ...rest];
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
      (enc as Record<string, unknown>).minBitrate = Math.floor(settings.maxBitrateKbps * 1000 * 0.35);
    } else {
      delete enc.maxBitrate;
      delete (enc as Record<string, unknown>).minBitrate;
    }
    (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
      settings.preset === "quality" ? "maintain-resolution" : "balanced";
    (enc as Record<string, unknown>).priority = "high";
    (enc as Record<string, unknown>).networkPriority = "high";
    (enc as Record<string, unknown>).scalabilityMode = "L1T1";
    await sender.setParameters(params);
  } catch {}
}

function applyContentHint(stream: MediaStream, settings: StreamSettings) {
  const contentHint =
    settings.targetFps >= 60 && (settings.maxBitrateKbps === null || settings.maxBitrateKbps >= 50_000)
      ? "motion"
      : "detail";

  for (const track of stream.getVideoTracks()) {
    try {
      (track as MediaStreamTrack & { contentHint: string }).contentHint = contentHint;
    } catch {}
  }
}

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

  async connect(code: string, requestedCodec: StreamSettings["codec"] = "auto") {
    const session = await fetchSession(code);
    if (!session.offer) throw new Error("Pas d'offre disponible");

    await this.pc.setRemoteDescription(session.offer);
    this.setReceiverCodecPreference(requestedCodec);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceGathering(this.pc);
    const completeAnswer = this.pc.localDescription!;

    await submitAnswer(code, completeAnswer);
  }

  private setReceiverCodecPreference(codec: StreamSettings["codec"]) {
    for (const transceiver of this.pc.getTransceivers()) {
      if (transceiver.receiver.track.kind !== "video") continue;
      const caps = RTCRtpReceiver.getCapabilities("video");
      if (!caps) continue;

      const all = caps.codecs;
      const h264 = all.filter((c) => c.mimeType === "video/H264");
      const h265 = all.filter((c) => c.mimeType === "video/H265");
      const av1 = all.filter((c) => c.mimeType === "video/AV1");
      const vp9 = all.filter((c) => c.mimeType === "video/VP9");
      const rest = all.filter((c) => !["video/H264", "video/H265", "video/AV1", "video/VP9"].includes(c.mimeType));

      let sorted: typeof all;
      switch (codec) {
        case "H264":
          sorted = [...h264, ...h265, ...av1, ...vp9, ...rest];
          break;
        case "H265":
          sorted = [...h265, ...h264, ...av1, ...vp9, ...rest];
          break;
        case "AV1":
          sorted = [...av1, ...h265, ...h264, ...vp9, ...rest];
          break;
        case "VP9":
          sorted = [...vp9, ...h265, ...h264, ...av1, ...rest];
          break;
        default:
          sorted = [...h265, ...av1, ...h264, ...vp9, ...rest];
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
