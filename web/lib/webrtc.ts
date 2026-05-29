import { fetchSession, submitAnswer, subscribeToIce, sendClientIce } from "./signaling";
import { RealtimeChannel } from "@supabase/supabase-js";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type WebVersoCallbacks = {
  onStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
};

export class WebVersoConnection {
  private pc: RTCPeerConnection;
  private iceChannel: RealtimeChannel | null = null;

  constructor(private cb: WebVersoCallbacks) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.cb.onStream(e.streams[0]);
    };

    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      if (s === "connected" || s === "completed") this.cb.onConnected();
      if (s === "disconnected" || s === "failed" || s === "closed")
        this.cb.onDisconnected();
    };
  }

  async connect(code: string) {
    const session = await fetchSession(code);
    if (!session.offer) throw new Error("Pas d'offre disponible");

    await this.pc.setRemoteDescription(session.offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const pending: RTCIceCandidateInit[] = [];
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) pending.push(candidate.toJSON());
    };

    const { channel, ready } = subscribeToIce(session.id, async (candidate) => {
      try { await this.pc.addIceCandidate(candidate); } catch {}
    });
    this.iceChannel = channel;

    await ready;
    for (const c of pending) sendClientIce(channel, c);
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate && this.iceChannel) sendClientIce(this.iceChannel, candidate.toJSON());
    };

    await submitAnswer(code, answer);
  }

  sendInput(event: object) {
    // Web Verso: input via data channel si disponible
    // Dans cette version web on n'injecte pas l'input (read-only par défaut)
    // Un futur data channel pourrait être ajouté ici
  }

  stop() {
    this.pc.close();
    this.iceChannel?.unsubscribe();
  }
}
