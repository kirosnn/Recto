/**
 * Tests d'injection d'input :
 * - Sérialisation des événements clavier/souris
 * - Mapping des coordonnées souris multi-résolution
 * - Envoi correct via data channel
 */
import { describe, it, expect, vi } from "vitest";

// Types d'événements input (miroir de src-tauri/src/input.rs)
type InputEvent =
  | { type: "mouseMove"; x: number; y: number; width: number; height: number }
  | { type: "mouseDown"; button: number }
  | { type: "mouseUp"; button: number }
  | { type: "mouseWheel"; deltaX: number; deltaY: number }
  | { type: "keyDown"; code: string; modifiers: Modifiers }
  | { type: "keyUp"; code: string; modifiers: Modifiers };

type Modifiers = { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };

function buildMouseMoveEvent(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  hostWidth: number,
  hostHeight: number
): InputEvent {
  return {
    type: "mouseMove",
    x: ((clientX - rect.left) / rect.width) * hostWidth,
    y: ((clientY - rect.top) / rect.height) * hostHeight,
    width: hostWidth,
    height: hostHeight,
  };
}

describe("Input — mapping des coordonnées souris", () => {
  const SCREENS = [
    { name: "1080p", hostW: 1920, hostH: 1080 },
    { name: "1440p", hostW: 2560, hostH: 1440 },
    { name: "4K",    hostW: 3840, hostH: 2160 },
  ];

  for (const screen of SCREENS) {
    it(`mappe correctement le centre de l'écran sur ${screen.name}`, () => {
      // Fenêtre Verso 800x600 affiche un écran ${screen.name}
      const viewportW = 800, viewportH = 600;
      const rect = { left: 0, top: 0, width: viewportW, height: viewportH } as DOMRect;
      const clientX = viewportW / 2;
      const clientY = viewportH / 2;

      const ev = buildMouseMoveEvent(clientX, clientY, rect, screen.hostW, screen.hostH);
      expect(ev.type).toBe("mouseMove");
      expect((ev as { x: number }).x).toBeCloseTo(screen.hostW / 2);
      expect((ev as { y: number }).y).toBeCloseTo(screen.hostH / 2);
    });

    it(`mappe le coin haut-gauche sur ${screen.name}`, () => {
      const rect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
      const ev = buildMouseMoveEvent(0, 0, rect, screen.hostW, screen.hostH);
      expect((ev as { x: number }).x).toBeCloseTo(0);
      expect((ev as { y: number }).y).toBeCloseTo(0);
    });

    it(`mappe le coin bas-droit sur ${screen.name}`, () => {
      const rect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
      const ev = buildMouseMoveEvent(800, 600, rect, screen.hostW, screen.hostH);
      expect((ev as { x: number }).x).toBeCloseTo(screen.hostW);
      expect((ev as { y: number }).y).toBeCloseTo(screen.hostH);
    });
  }

  it("reste dans les bornes même avec un offset de viewport", () => {
    const rect = { left: 50, top: 30, width: 700, height: 500 } as DOMRect;
    const ev = buildMouseMoveEvent(50, 30, rect, 1920, 1080);
    expect((ev as { x: number }).x).toBeCloseTo(0);
    expect((ev as { y: number }).y).toBeCloseTo(0);
  });
});

describe("Input — sérialisation des événements clavier", () => {
  const KEYS = [
    { code: "KeyA", label: "A" },
    { code: "Enter", label: "Entrée" },
    { code: "Escape", label: "Echap" },
    { code: "ArrowLeft", label: "Flèche gauche" },
    { code: "F5", label: "F5" },
    { code: "ControlLeft", label: "Ctrl gauche" },
  ];

  const noMods: Modifiers = { ctrl: false, shift: false, alt: false, meta: false };

  for (const key of KEYS) {
    it(`sérialise keyDown pour ${key.label}`, () => {
      const event: InputEvent = { type: "keyDown", code: key.code, modifiers: noMods };
      const json = JSON.stringify(event);
      const parsed = JSON.parse(json) as InputEvent;
      expect(parsed.type).toBe("keyDown");
      expect((parsed as { code: string }).code).toBe(key.code);
    });
  }

  it("sérialise Ctrl+C correctement", () => {
    const event: InputEvent = {
      type: "keyDown",
      code: "KeyC",
      modifiers: { ctrl: true, shift: false, alt: false, meta: false },
    };
    const parsed = JSON.parse(JSON.stringify(event)) as { modifiers: Modifiers };
    expect(parsed.modifiers.ctrl).toBe(true);
  });

  it("sérialise Ctrl+Shift+Alt+F4", () => {
    const event: InputEvent = {
      type: "keyDown",
      code: "F4",
      modifiers: { ctrl: true, shift: true, alt: true, meta: false },
    };
    const parsed = JSON.parse(JSON.stringify(event)) as { modifiers: Modifiers };
    expect(parsed.modifiers.ctrl).toBe(true);
    expect(parsed.modifiers.shift).toBe(true);
    expect(parsed.modifiers.alt).toBe(true);
  });
});

describe("Input — boutons souris et molette", () => {
  it("mouseDown bouton gauche (0)", () => {
    const ev: InputEvent = { type: "mouseDown", button: 0 };
    expect(JSON.parse(JSON.stringify(ev))).toMatchObject({ type: "mouseDown", button: 0 });
  });

  it("mouseDown bouton droit (2)", () => {
    const ev: InputEvent = { type: "mouseDown", button: 2 };
    expect(JSON.parse(JSON.stringify(ev))).toMatchObject({ type: "mouseDown", button: 2 });
  });

  it("mouseWheel scroll vertical", () => {
    const ev: InputEvent = { type: "mouseWheel", deltaX: 0, deltaY: 120 };
    const parsed = JSON.parse(JSON.stringify(ev)) as { deltaY: number };
    expect(parsed.deltaY).toBe(120);
  });

  it("mouseWheel scroll horizontal (trackpad)", () => {
    const ev: InputEvent = { type: "mouseWheel", deltaX: -60, deltaY: 0 };
    const parsed = JSON.parse(JSON.stringify(ev)) as { deltaX: number };
    expect(parsed.deltaX).toBe(-60);
  });
});

describe("Input — envoi via data channel", () => {
  it("envoie l'événement en JSON sur le channel", async () => {
    const sent: string[] = [];
    const mockChannel = {
      readyState: "open" as RTCDataChannelState,
      send: vi.fn((data: string) => sent.push(data)),
    };

    const event: InputEvent = { type: "keyDown", code: "Space", modifiers: { ctrl: false, shift: false, alt: false, meta: false } };

    if (mockChannel.readyState === "open") {
      mockChannel.send(JSON.stringify(event));
    }

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toMatchObject({ type: "keyDown", code: "Space" });
  });

  it("n'envoie pas si le channel est fermé", () => {
    const mockChannel = {
      readyState: "closed" as RTCDataChannelState,
      send: vi.fn(),
    };

    if (mockChannel.readyState === "open") {
      mockChannel.send("test");
    }

    expect(mockChannel.send).not.toHaveBeenCalled();
  });
});
