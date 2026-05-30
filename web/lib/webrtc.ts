import { fetchSession, submitAnswer } from "./signaling";
import type { WebClientSettings } from "./webSettings";

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

export type PeerIdentity = { name: string; avatar: string | null };

export type WebVersoCallbacks = {
  onStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
  onInputChannel: (channel: RTCDataChannel) => void;
  onDisplayInfo: (width: number, height: number) => void;
  onIdentity: (identity: PeerIdentity) => void;
};

export class WebVersoConnection {
  private pc: RTCPeerConnection;

  constructor(private cb: WebVersoCallbacks) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.cb.onStream(e.streams[0]);
    };

    // Recto creates the "input" DataChannel; Verso receives it and uses it to
    // send mouse/keyboard events back, and to receive Recto's metadata.
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
      const s = this.pc.iceConnectionState;
      if (s === "connected" || s === "completed") this.cb.onConnected();
      if (s === "disconnected" || s === "failed" || s === "closed")
        this.cb.onDisconnected();
    };
  }

  async connect(code: string, requestedCodec: WebClientSettings["requestedCodec"] = "auto") {
    const session = await fetchSession(code);
    if (!session.offer) throw new Error("Pas d'offre disponible");

    await this.pc.setRemoteDescription(session.offer);

    // Prefer hardware-efficient codecs on the receiving side (influences what Recto sends)
    this.setReceiverCodecPreference(requestedCodec);

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await waitForIceGathering(this.pc);
    const completeAnswer = this.pc.localDescription!;

    await submitAnswer(code, completeAnswer);
  }

  private setReceiverCodecPreference(codec: WebClientSettings["requestedCodec"]) {
    for (const transceiver of this.pc.getTransceivers()) {
      if (transceiver.receiver.track.kind !== "video") continue;
      const caps = RTCRtpReceiver.getCapabilities("video");
      if (!caps) continue;

      const all = caps.codecs;
      const h264hw  = all.filter(c => c.mimeType === "video/H264");
      const h265    = all.filter(c => c.mimeType === "video/H265");
      const av1     = all.filter(c => c.mimeType === "video/AV1");
      const vp9     = all.filter(c => c.mimeType === "video/VP9");
      const rest    = all.filter(c => !["video/H264","video/H265","video/AV1","video/VP9"].includes(c.mimeType));

      let sorted: typeof all;
      switch (codec) {
        case "H264": sorted = [...h264hw, ...h265, ...av1, ...vp9, ...rest]; break;
        case "H265": sorted = [...h265, ...h264hw, ...av1, ...vp9, ...rest]; break;
        case "AV1":  sorted = [...av1, ...h265, ...h264hw, ...vp9, ...rest]; break;
        case "VP9":  sorted = [...vp9, ...h265, ...h264hw, ...av1, ...rest]; break;
        default:     sorted = [...h265, ...av1, ...h264hw, ...vp9, ...rest]; // auto: best efficiency first
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
