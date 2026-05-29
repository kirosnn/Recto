import type { GamepadStateMsg } from "./gamepad";

type VState = Omit<GamepadStateMsg, "type">;

// Keys that the virtual gamepad consumes (not forwarded as keyboard events)
const CONSUMED_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "Space", "KeyZ", "KeyQ", "KeyE",
  "ShiftLeft", "ShiftRight",
  "ControlLeft", "ControlRight",
  "KeyR", "KeyF",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Enter", "Backspace",
]);

function neutral(): VState {
  return {
    a: false, b: false, x: false, y: false,
    lb: false, rb: false, lt: 0, rt: 0,
    back: false, start: false, ls: false, rs: false,
    dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: false,
    leftX: 0, leftY: 0, rightX: 0, rightY: 0,
  };
}

function computeState(held: Set<string>): VState {
  const s = neutral();

  // Left stick (WASD, digital)
  if (held.has("KeyW")) s.leftY -= 1;
  if (held.has("KeyS")) s.leftY += 1;
  if (held.has("KeyA")) s.leftX -= 1;
  if (held.has("KeyD")) s.leftX += 1;
  s.leftX = Math.max(-1, Math.min(1, s.leftX));
  s.leftY = Math.max(-1, Math.min(1, s.leftY));

  // Face buttons
  s.a = held.has("Space");
  s.b = held.has("KeyZ");
  s.x = held.has("KeyQ");
  s.y = held.has("KeyE");

  // Shoulders & triggers
  s.lb = held.has("ShiftLeft") || held.has("ShiftRight");
  s.rb = held.has("ControlLeft") || held.has("ControlRight");
  s.lt = held.has("KeyR") ? 1 : 0;
  s.rt = held.has("KeyF") ? 1 : 0;

  // D-pad
  s.dpadUp    = held.has("ArrowUp");
  s.dpadDown  = held.has("ArrowDown");
  s.dpadLeft  = held.has("ArrowLeft");
  s.dpadRight = held.has("ArrowRight");

  // System
  s.start = held.has("Enter");
  s.back  = held.has("Backspace");

  return s;
}

export class VirtualGamepadEmulator {
  private held = new Set<string>();
  private rafId: number | null = null;
  private accDx = 0;
  private accDy = 0;
  /** Mouse pixels → right-stick axis unit (tunable in settings). */
  sensitivity = 0.025;

  constructor(private send: (msg: GamepadStateMsg) => void) {}

  /** Returns true if the key is consumed by the virtual gamepad. */
  isConsumed(code: string): boolean {
    return CONSUMED_KEYS.has(code);
  }

  keyDown(code: string) {
    this.held.add(code);
  }

  keyUp(code: string) {
    this.held.delete(code);
  }

  /** Feed pointer-locked mouse delta each frame. */
  mouseMove(dx: number, dy: number) {
    this.accDx += dx;
    this.accDy += dy;
  }

  /** Left-click → A, right-click → B while virtual gamepad is active. */
  mouseButton(button: number, pressed: boolean) {
    if (button === 0) pressed ? this.held.add("__mb_a") : this.held.delete("__mb_a");
    if (button === 2) pressed ? this.held.add("__mb_b") : this.held.delete("__mb_b");
  }

  start() {
    const tick = () => {
      const s = computeState(this.held);
      // Right stick from mouse (clamp to ±1, reset accumulator each tick)
      s.rightX = Math.max(-1, Math.min(1, this.accDx * this.sensitivity));
      s.rightY = Math.max(-1, Math.min(1, this.accDy * this.sensitivity));
      this.accDx = 0;
      this.accDy = 0;
      // Override face buttons from mouse clicks
      if (this.held.has("__mb_a")) s.a = true;
      if (this.held.has("__mb_b")) s.b = true;
      this.send({ type: "gamepadState", ...s });
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.held.clear();
    this.accDx = 0;
    this.accDy = 0;
    // Release all buttons on the host
    this.send({ type: "gamepadState", ...neutral() });
  }
}
