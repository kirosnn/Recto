import { vi, beforeEach } from "vitest";

// Mock Tauri API (not available in jsdom)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Global registry so loopback can link the two PeerConnections
const _allPCs: MockRTCPeerConnection[] = [];

export function clearPCRegistry() {
  _allPCs.length = 0;
}

class MockRTCDataChannel {
  readyState: RTCDataChannelState = "connecting";
  label: string;
  _mirror: MockRTCDataChannel | null = null;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;

  constructor(label: string) {
    this.label = label;
  }

  send(data: string | ArrayBuffer) {
    setTimeout(() => this._mirror?.onmessage?.({ data } as MessageEvent), 1);
  }

  close() {
    (this as unknown as { readyState: RTCDataChannelState }).readyState = "closed";
    this.onclose?.({} as Event);
  }
}

class MockRTCPeerConnection {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  iceConnectionState: RTCIceConnectionState = "new";
  // "complete" so waitForIceGathering() resolves immediately without needing
  // real event plumbing (candidates are still emitted via setLocalDescription).
  iceGatheringState: RTCIceGatheringState = "complete";

  addEventListener() {}
  removeEventListener() {}

  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ontrack: ((e: RTCTrackEvent) => void) | null = null;
  ondatachannel: ((e: RTCDataChannelEvent) => void) | null = null;

  _tracks: MediaStreamTrack[] = [];
  private _dataChannels: Map<string, MockRTCDataChannel> = new Map();

  constructor(_config?: RTCConfiguration) {
    _allPCs.push(this);
  }

  addTrack(track: MediaStreamTrack, _stream: MediaStream) {
    this._tracks.push(track);
  }

  createDataChannel(label: string): MockRTCDataChannel {
    const ch = new MockRTCDataChannel(label);
    this._dataChannels.set(label, ch);
    return ch as unknown as MockRTCDataChannel;
  }

  // Minimal transceiver/sender/receiver surface so the real codec-preference and
  // encoder-tuning code paths run under test instead of throwing.
  getTransceivers() {
    const transceivers = this._tracks.map((t) => ({
      sender: { track: t },
      receiver: { track: { kind: t.kind } },
      setCodecPreferences: () => {},
    }));
    // Verso has no local tracks but still receives video — expose a receiver.
    if (!transceivers.some((tr) => tr.receiver.track.kind === "video")) {
      transceivers.push({
        sender: { track: null as unknown as MediaStreamTrack },
        receiver: { track: { kind: "video" } },
        setCodecPreferences: () => {},
      });
    }
    return transceivers;
  }

  getSenders() {
    return this._tracks.map((t) => ({
      track: t,
      getParameters: () => ({ encodings: [{}] }),
      setParameters: async () => {},
    }));
  }

  getReceivers() {
    return [{ track: { kind: "video" } }];
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc;
    // Emit fake ICE candidate then null
    setTimeout(() => {
      this.onicecandidate?.({
        candidate: {
          candidate: "candidate:1 1 UDP 2130706431 127.0.0.1 54321 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
          toJSON: () => ({
            candidate: "candidate:1 1 UDP 2130706431 127.0.0.1 54321 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          }),
        } as unknown as RTCIceCandidate,
      });
      setTimeout(() => this.onicecandidate?.({ candidate: null }), 5);
    }, 2);
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc;

    if (!this.localDescription) return;

    setTimeout(() => {
      // Mark this PC as connected
      (this as unknown as { iceConnectionState: RTCIceConnectionState }).iceConnectionState = "connected";
      this.oniceconnectionstatechange?.();

      // When the offerer (Recto) receives the answer, wire up the loopback
      if (desc.type === "answer") {
        const other = _allPCs.find((p) => p !== this);
        if (!other) return;

        // Mark the answerer (Verso) as connected too
        (other as unknown as { iceConnectionState: RTCIceConnectionState }).iceConnectionState = "connected";
        other.oniceconnectionstatechange?.();

        // Deliver Recto's tracks to Verso via ontrack
        const stream = new MockMediaStream(this._tracks) as unknown as MediaStream;
        this._tracks.forEach((track) => {
          other.ontrack?.({ track, streams: [stream] } as unknown as RTCTrackEvent);
        });

        // Mirror data channels: create paired channels between both PCs
        this._dataChannels.forEach((hostCh, label) => {
          const clientCh = new MockRTCDataChannel(label);
          hostCh._mirror = clientCh;
          clientCh._mirror = hostCh;
          other.ondatachannel?.({ channel: clientCh as unknown as RTCDataChannel } as RTCDataChannelEvent);
          setTimeout(() => {
            (hostCh as unknown as { readyState: string }).readyState = "open";
            (clientCh as unknown as { readyState: string }).readyState = "open";
            hostCh.onopen?.({} as Event);
            clientCh.onopen?.({} as Event);
          }, 10);
        });
      }
    }, 20);
  }

  async addIceCandidate(_candidate: RTCIceCandidateInit) {}

  close() {
    (this as unknown as { iceConnectionState: RTCIceConnectionState }).iceConnectionState = "closed";
    this.oniceconnectionstatechange?.();
  }
}

class MockMediaStream {
  id = crypto.randomUUID();
  private _tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this._tracks = tracks;
  }

  getTracks() { return this._tracks; }
  getVideoTracks() { return this._tracks.filter((t) => t.kind === "video"); }
  getAudioTracks() { return this._tracks.filter((t) => t.kind === "audio"); }
  addTrack(t: MediaStreamTrack) { this._tracks.push(t); }
}

class MockMediaStreamTrack {
  kind: string;
  id = crypto.randomUUID();
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  onended: (() => void) | null = null;

  constructor(kind: "video" | "audio") {
    this.kind = kind;
  }

  stop() {
    (this as unknown as { readyState: MediaStreamTrackState }).readyState = "ended";
    this.onended?.();
  }

  getSettings(): MediaTrackSettings {
    return this.kind === "video"
      ? { width: 1920, height: 1080, frameRate: 60, deviceId: "screen-0" }
      : { sampleRate: 48000, channelCount: 2 };
  }

  getConstraints() { return {}; }
}

vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
vi.stubGlobal("MediaStream", MockMediaStream);
vi.stubGlobal("MediaStreamTrack", MockMediaStreamTrack);
// Codec capability statics — return null so setCodecPreferences is skipped
// gracefully (the loopback tests don't assert on negotiated codecs).
vi.stubGlobal("RTCRtpSender", { getCapabilities: () => null });
vi.stubGlobal("RTCRtpReceiver", { getCapabilities: () => null });

const mockGetDisplayMedia = vi.fn();
vi.stubGlobal("navigator", {
  ...global.navigator,
  mediaDevices: {
    getDisplayMedia: mockGetDisplayMedia,
    getUserMedia: vi.fn(),
  },
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

beforeEach(() => {
  clearPCRegistry();
});

export {
  mockGetDisplayMedia,
  MockRTCPeerConnection,
  MockRTCDataChannel,
  MockMediaStream,
  MockMediaStreamTrack,
};
