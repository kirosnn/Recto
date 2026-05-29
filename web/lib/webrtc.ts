import { fetchSession, submitAnswer } from "./signaling";

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

export type WebVersoCallbacks = {
  onStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (err: string) => void;
};

export class WebVersoConnection {
  private pc: RTCPeerConnection;

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

    // Attendre que toutes les candidates ICE soient dans le SDP
    await waitForIceGathering(this.pc);
    const completeAnswer = this.pc.localDescription!;

    await submitAnswer(code, completeAnswer);
  }

  stop() {
    this.pc.close();
  }
}
