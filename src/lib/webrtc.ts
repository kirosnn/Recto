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

export type RectoCallbacks = {
  onCode: (code: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
};

export type VersoCallbacks = {
  onStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
  onInputChannel: (channel: RTCDataChannel) => void;
};

export class RectoConnection {
  private pc: RTCPeerConnection;
  private sessionChannel: RealtimeChannel | null = null;
  private inputChannel: RTCDataChannel | null = null;
  public code = "";

  constructor(private cb: RectoCallbacks) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.inputChannel = this.pc.createDataChannel("input", { ordered: false });

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === "connected" ||
          this.pc.iceConnectionState === "completed") {
        this.cb.onConnected();
      }
      if (this.pc.iceConnectionState === "disconnected" ||
          this.pc.iceConnectionState === "failed" ||
          this.pc.iceConnectionState === "closed") {
        this.cb.onDisconnected();
      }
    };
  }

  async start(stream: MediaStream) {
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Attendre que toutes les candidates ICE soient dans le SDP
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

    // Fallback si la réponse est arrivée avant l'abonnement
    const existing = await fetchSessionAnswer(session.id);
    if (existing) await applyAnswer(existing);
  }

  getInputChannel(): RTCDataChannel | null {
    return this.inputChannel;
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
      if (e.channel.label === "input") {
        this.cb.onInputChannel(e.channel);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === "connected" ||
          this.pc.iceConnectionState === "completed") {
        this.cb.onConnected();
      }
      if (this.pc.iceConnectionState === "disconnected" ||
          this.pc.iceConnectionState === "failed" ||
          this.pc.iceConnectionState === "closed") {
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

    // Attendre que toutes les candidates ICE soient dans le SDP
    await waitForIceGathering(this.pc);
    const completeAnswer = this.pc.localDescription!;

    await submitAnswer(code, completeAnswer);
  }

  stop() {
    this.pc.close();
  }
}
