import { RealtimeChannel } from "@supabase/supabase-js";
import {
  createSession,
  fetchSession,
  fetchSessionAnswer,
  submitAnswer,
  subscribeToSession,
} from "./signaling";

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

// Prefer H.264 for hardware-accelerated encoding, then VP9, then others
function setH264Preference(pc: RTCPeerConnection) {
  for (const transceiver of pc.getTransceivers()) {
    if (transceiver.sender.track?.kind !== "video") continue;
    const caps = RTCRtpSender.getCapabilities("video");
    if (!caps) continue;
    const sorted = [
      ...caps.codecs.filter((c) => c.mimeType === "video/H264"),
      ...caps.codecs.filter((c) => c.mimeType === "video/VP9"),
      ...caps.codecs.filter(
        (c) => c.mimeType !== "video/H264" && c.mimeType !== "video/VP9"
      ),
    ];
    try { transceiver.setCodecPreferences(sorted); } catch {}
  }
}

// Tune video sender for low-latency after ICE connects
async function tuneVideoSender(pc: RTCPeerConnection) {
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxFramerate = 60;
    await sender.setParameters(params);
  } catch {}
}

export type RectoCallbacks = {
  onCode: (code: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
};

export type PeerIdentity = { name: string; avatar: string | null };

export type VersoCallbacks = {
  onStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
  onInputChannel: (channel: RTCDataChannel) => void;
  onDisplayInfo: (width: number, height: number) => void;
  onIdentity: (identity: PeerIdentity) => void;
};

export class RectoConnection {
  private pc: RTCPeerConnection;
  private sessionChannel: RealtimeChannel | null = null;
  private inputChannel: RTCDataChannel | null = null;
  public code = "";

  constructor(private cb: RectoCallbacks) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // Unreliable unordered for mouse moves; reliable events like clicks still
    // reach Recto because TCP-like fallback is not used — SCTP partial reliability
    // means each message still delivers, just without head-of-line blocking
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
        tuneVideoSender(this.pc);
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

  async start(stream: MediaStream) {
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
    // Set H.264 preference after tracks are added, before offer
    setH264Preference(this.pc);

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

      // Handle metadata messages sent from Recto → Verso
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

      // Expose channel for sending only once it is actually open
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

  async connect(code: string) {
    const session = await fetchSession(code);
    if (!session.offer) throw new Error("Pas d'offre disponible");

    await this.pc.setRemoteDescription(session.offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceGathering(this.pc);
    const completeAnswer = this.pc.localDescription!;

    await submitAnswer(code, completeAnswer);
  }

  stop() {
    this.pc.close();
  }
}
