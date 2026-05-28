/**
 * Tests d'émulation de stream vidéo multi-écran.
 * Simule getDisplayMedia() à différentes résolutions et vérifie
 * que les tracks sont correctement capturées et transmises.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockGetDisplayMedia, MockMediaStream, MockMediaStreamTrack } from "./setup";

// Configs d'écrans réalistes
const DISPLAY_CONFIGS = [
  { name: "1080p", width: 1920, height: 1080, frameRate: 60 },
  { name: "1440p", width: 2560, height: 1440, frameRate: 144 },
  { name: "4K",    width: 3840, height: 2160, frameRate: 60 },
  { name: "Ultrawide 1080p", width: 3440, height: 1440, frameRate: 100 },
  { name: "Dual monitor", width: 3840, height: 1080, frameRate: 60 },
];

function makeDisplayStream(config: { width: number; height: number; frameRate: number }) {
  const videoTrack = new MockMediaStreamTrack("video") as unknown as MediaStreamTrack;
  vi.spyOn(videoTrack, "getSettings").mockReturnValue({
    width: config.width,
    height: config.height,
    frameRate: config.frameRate,
    deviceId: `display-${config.width}x${config.height}`,
  });
  const stream = new MockMediaStream([videoTrack]) as unknown as MediaStream;
  return { stream, videoTrack };
}

describe("Stream emulation — résolutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const config of DISPLAY_CONFIGS) {
    it(`capture ${config.name} (${config.width}x${config.height} @ ${config.frameRate}fps)`, async () => {
      const { stream, videoTrack } = makeDisplayStream(config);
      mockGetDisplayMedia.mockResolvedValue(stream);

      const result = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: config.frameRate } as MediaTrackConstraints,
        audio: false,
      });

      const tracks = result.getVideoTracks();
      expect(tracks).toHaveLength(1);

      const settings = tracks[0].getSettings();
      expect(settings.width).toBe(config.width);
      expect(settings.height).toBe(config.height);
      expect(settings.frameRate).toBe(config.frameRate);
    });
  }

  it("stream s'arrête quand l'utilisateur clique 'Stop sharing'", async () => {
    const { stream, videoTrack } = makeDisplayStream(DISPLAY_CONFIGS[0]);
    mockGetDisplayMedia.mockResolvedValue(stream);

    const onEnded = vi.fn();
    (videoTrack as unknown as { onended: () => void }).onended = onEnded;

    const result = await navigator.mediaDevices.getDisplayMedia({ video: true });
    result.getVideoTracks()[0].stop();

    expect(onEnded).toHaveBeenCalled();
  });

  it("stream avec audio intégré (partage onglet/audio système)", async () => {
    const videoTrack = new MockMediaStreamTrack("video") as unknown as MediaStreamTrack;
    const audioTrack = new MockMediaStreamTrack("audio") as unknown as MediaStreamTrack;
    const stream = new MockMediaStream([videoTrack, audioTrack]) as unknown as MediaStream;
    mockGetDisplayMedia.mockResolvedValue(stream);

    const result = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    expect(result.getVideoTracks()).toHaveLength(1);
    expect(result.getAudioTracks()).toHaveLength(1);
  });

  it("lance une erreur si l'utilisateur refuse la capture", async () => {
    mockGetDisplayMedia.mockRejectedValue(
      Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })
    );

    await expect(
      navigator.mediaDevices.getDisplayMedia({ video: true })
    ).rejects.toMatchObject({ name: "NotAllowedError" });
  });
});
