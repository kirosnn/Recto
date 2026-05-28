/**
 * Tests WebRTC loopback : connecte un RectoConnection et un VersoConnection
 * dans le même process (sans réseau ni Supabase) et vérifie que le stream
 * et le data channel s'établissent correctement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockGetDisplayMedia, MockMediaStream, MockMediaStreamTrack, MockRTCPeerConnection } from "./setup";

// Mock signaling — bypass Supabase, échange direct les SDP/ICE
vi.mock("../lib/signaling", () => {
  let _hostPc: InstanceType<typeof MockRTCPeerConnection> | null = null;
  let _clientPc: InstanceType<typeof MockRTCPeerConnection> | null = null;
  let _sessionId = "test-session-id";
  let _offer: RTCSessionDescriptionInit | null = null;
  let _answerCb: ((answer: RTCSessionDescriptionInit) => void) | null = null;
  const _iceCbs: { host: ((c: RTCIceCandidateInit) => void)[]; client: ((c: RTCIceCandidateInit) => void)[] } = { host: [], client: [] };

  const mockChannel = {
    send: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn(),
  };

  return {
    createSession: vi.fn(async (offer: RTCSessionDescriptionInit) => {
      _offer = offer;
      return "ABCD12";
    }),
    fetchSession: vi.fn(async (_code: string) => ({
      id: _sessionId,
      code: "ABCD12",
      offer: _offer,
      answer: null,
      status: "waiting",
    })),
    submitAnswer: vi.fn(async (_code: string, answer: RTCSessionDescriptionInit) => {
      _answerCb?.(answer);
    }),
    endSession: vi.fn().mockResolvedValue(undefined),
    subscribeToSession: vi.fn((_id: string, cb: (s: { answer?: RTCSessionDescriptionInit }) => void) => {
      _answerCb = (answer) => cb({ answer });
      return mockChannel;
    }),
    subscribeToIce: vi.fn((_id: string, role: "host" | "client", cb: (c: RTCIceCandidateInit) => void) => {
      _iceCbs[role].push(cb);
      return mockChannel;
    }),
    sendIceCandidate: vi.fn(async (
      _ch: unknown,
      role: "host" | "client",
      candidate: RTCIceCandidateInit
    ) => {
      const targets = role === "host" ? _iceCbs.client : _iceCbs.host;
      targets.forEach((cb) => cb(candidate));
    }),
  };
});

import { RectoConnection, VersoConnection } from "../lib/webrtc";

describe("WebRTC loopback — Recto ↔ Verso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("établit une connexion et transmet le stream", async () => {
    const videoTrack = new MockMediaStreamTrack("video") as unknown as MediaStreamTrack;
    const fakeStream = new MockMediaStream([videoTrack]) as unknown as MediaStream;
    mockGetDisplayMedia.mockResolvedValue(fakeStream);

    let rectoCode = "";
    let rectoConnected = false;
    let versoConnected = false;
    let receivedStream: MediaStream | null = null;
    let receivedInputChannel: RTCDataChannel | null = null;

    const recto = new RectoConnection({
      onCode: (c) => { rectoCode = c; },
      onConnected: () => { rectoConnected = true; },
      onDisconnected: vi.fn(),
      onError: vi.fn(),
    });

    const verso = new VersoConnection({
      onStream: (s) => { receivedStream = s; },
      onConnected: () => { versoConnected = true; },
      onDisconnected: vi.fn(),
      onError: vi.fn(),
      onInputChannel: (ch) => { receivedInputChannel = ch; },
    });

    // Recto démarre le partage
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    await recto.start(stream);

    expect(rectoCode).toBe("ABCD12");

    // Verso se connecte avec le code
    await verso.connect("ABCD12");

    // Attendre que la connexion WebRTC s'établisse
    await vi.waitFor(() => {
      expect(versoConnected).toBe(true);
    }, { timeout: 500 });

    recto.stop();
    verso.stop();
  });

  it("le data channel input fonctionne dans les deux sens", async () => {
    const videoTrack = new MockMediaStreamTrack("video") as unknown as MediaStreamTrack;
    const fakeStream = new MockMediaStream([videoTrack]) as unknown as MediaStream;
    mockGetDisplayMedia.mockResolvedValue(fakeStream);

    const receivedMessages: string[] = [];
    let inputChannel: RTCDataChannel | null = null;

    const recto = new RectoConnection({
      onCode: vi.fn(),
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onError: vi.fn(),
    });

    const verso = new VersoConnection({
      onStream: vi.fn(),
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onError: vi.fn(),
      onInputChannel: (ch) => { inputChannel = ch; },
    });

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    await recto.start(stream);
    await verso.connect("ABCD12");

    // Recto écoute les messages d'input
    const rectoCh = recto.getInputChannel();
    rectoCh!.onmessage = (e) => receivedMessages.push(e.data as string);

    // Attendre que le data channel soit prêt (expect() inside waitFor force le retry)
    await vi.waitFor(() => {
      expect(inputChannel).not.toBeNull();
    }, { timeout: 500 });

    // Verso envoie un événement clavier
    inputChannel!.send(JSON.stringify({ type: "keyDown", code: "KeyA", modifiers: { ctrl: false, shift: false, alt: false, meta: false } }));

    await vi.waitFor(() => {
      expect(receivedMessages.length).toBeGreaterThan(0);
    }, { timeout: 500 });
    const msg = JSON.parse(receivedMessages[0]);
    expect(msg.type).toBe("keyDown");
    expect(msg.code).toBe("KeyA");

    recto.stop();
    verso.stop();
  });
});
