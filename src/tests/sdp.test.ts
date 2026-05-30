/**
 * Tests du munging SDP côté Recto : vérifie que le cap de bande passante (b=AS)
 * et les hints de bitrate (x-google-*) sont injectés correctement, uniquement
 * sur la section vidéo et sur les vrais codecs (pas rtx/red/fec, pas l'audio).
 */
import { describe, it, expect } from "vitest";
import { applyBitrateToSdp } from "../lib/webrtc";
import { DEFAULTS } from "../lib/settings";

const SAMPLE_SDP = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "m=video 9 UDP/TLS/RTP/SAVPF 96 97",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:96 H264/90000",
  "a=fmtp:96 profile-level-id=640032;packetization-mode=1",
  "a=rtpmap:97 rtx/90000",
  "a=fmtp:97 apt=96",
].join("\r\n");

describe("applyBitrateToSdp", () => {
  it("injecte b=AS/b=TIAS dans la section vidéo pour un bitrate limité", () => {
    const out = applyBitrateToSdp(SAMPLE_SDP, { ...DEFAULTS, maxBitrateKbps: 50_000 });
    expect(out).toContain("b=AS:50000");
    expect(out).toContain("b=TIAS:50000000");
    // La section audio ne doit pas recevoir de cap vidéo
    const audioBlock = out.split("m=video")[0];
    expect(audioBlock).not.toContain("b=AS:");
  });

  it("ajoute x-google-start-bitrate uniquement sur le codec vidéo réel (pas rtx)", () => {
    const out = applyBitrateToSdp(SAMPLE_SDP, { ...DEFAULTS, maxBitrateKbps: 50_000 });
    expect(out).toContain("a=fmtp:96 profile-level-id=640032;packetization-mode=1;x-google-start-bitrate=");
    expect(out).toContain("x-google-max-bitrate=50000");
    // Le payload rtx (97) ne doit pas être touché
    expect(out).toMatch(/a=fmtp:97 apt=96(\r\n|$)/);
    expect(out).not.toContain("apt=96;x-google");
    // L'audio (opus) ne doit pas être touché
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1");
    expect(out).not.toContain("a=fmtp:111 minptime=10;useinbandfec=1;x-google");
  });

  it("sans cap de bitrate (illimité), pas de b=AS mais un start-bitrate par défaut", () => {
    const out = applyBitrateToSdp(SAMPLE_SDP, { ...DEFAULTS, maxBitrateKbps: null });
    expect(out).not.toContain("b=AS:");
    expect(out).toContain("x-google-start-bitrate=16000");
    expect(out).not.toContain("x-google-max-bitrate");
  });

  it("renvoie un SDP inchangé en cas d'entrée vide ou invalide", () => {
    expect(applyBitrateToSdp("", DEFAULTS)).toBe("");
  });
});
