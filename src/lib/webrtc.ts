import { RealtimeChannel } from "@supabase/supabase-js";
import {
  createSession,
  fetchSession,
  submitAnswer,
  subscribeToSession,
  subscribeToIce,
  sendIceCandidate,
} from "./signaling";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

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
  private iceChannel: RealtimeChannel | null = null;
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

    this.code = await createSession(offer);
    this.cb.onCode(this.code);

    const session = await fetchSession(this.code);

    // Buffer candidates until the Realtime WebSocket is connected
    const pending: RTCIceCandidateInit[] = [];
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) pending.push(candidate.toJSON());
    };

    const { channel, ready } = subscribeToIce(session.id, "host", async (candidate) => {
      try { await this.pc.addIceCandidate(candidate); } catch {}
    });
    this.iceChannel = channel;

    await ready;
    for (const c of pending) sendIceCandidate(channel, "host", c);
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate && this.iceChannel) sendIceCandidate(this.iceChannel, "host", candidate.toJSON());
    };

    this.sessionChannel = subscribeToSession(session.id, async (update) => {
      if (update.answer && !this.pc.remoteDescription) {
        await this.pc.setRemoteDescription(update.answer);
      }
    });
  }

  getInputChannel(): RTCDataChannel | null {
    return this.inputChannel;
  }

  stop() {
    this.pc.close();
    this.iceChannel?.unsubscribe();
    this.sessionChannel?.unsubscribe();
  }
}

export class VersoConnection {
  private pc: RTCPeerConnection;
  private iceChannel: RealtimeChannel | null = null;

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

    const pendingV: RTCIceCandidateInit[] = [];
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) pendingV.push(candidate.toJSON());
    };

    const { channel: iceChV, ready: readyV } = subscribeToIce(session.id, "client", async (candidate) => {
      try { await this.pc.addIceCandidate(candidate); } catch {}
    });
    this.iceChannel = iceChV;

    await readyV;
    for (const c of pendingV) sendIceCandidate(iceChV, "client", c);
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate && this.iceChannel) sendIceCandidate(this.iceChannel, "client", candidate.toJSON());
    };

    await submitAnswer(code, answer);
  }

  stop() {
    this.pc.close();
    this.iceChannel?.unsubscribe();
  }
}
