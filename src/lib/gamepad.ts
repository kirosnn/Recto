export interface GamepadStateMsg {
  type: "gamepadState";
  a: boolean; b: boolean; x: boolean; y: boolean;
  lb: boolean; rb: boolean;
  lt: number; rt: number;
  back: boolean; start: boolean;
  ls: boolean; rs: boolean;
  dpadUp: boolean; dpadDown: boolean; dpadLeft: boolean; dpadRight: boolean;
  leftX: number; leftY: number;
  rightX: number; rightY: number;
}

function dz(v: number, threshold = 0.08): number {
  return Math.abs(v) < threshold ? 0 : v;
}

function gpToMsg(gp: Gamepad): GamepadStateMsg {
  const b = gp.buttons;
  const a = gp.axes;
  const btn = (i: number) => b[i] ?? { pressed: false, value: 0 };
  return {
    type: "gamepadState",
    a:         btn(0).pressed,
    b:         btn(1).pressed,
    x:         btn(2).pressed,
    y:         btn(3).pressed,
    lb:        btn(4).pressed,
    rb:        btn(5).pressed,
    lt:        btn(6).value,
    rt:        btn(7).value,
    back:      btn(8).pressed,
    start:     btn(9).pressed,
    ls:        btn(10).pressed,
    rs:        btn(11).pressed,
    dpadUp:    btn(12).pressed,
    dpadDown:  btn(13).pressed,
    dpadLeft:  btn(14).pressed,
    dpadRight: btn(15).pressed,
    leftX:     dz(a[0] ?? 0),
    leftY:     dz(a[1] ?? 0),
    rightX:    dz(a[2] ?? 0),
    rightY:    dz(a[3] ?? 0),
  };
}

export class GamepadPoller {
  private rafId: number | null = null;
  private prevJson = new Map<number, string>();

  constructor(private send: (msg: GamepadStateMsg) => void) {}

  start() {
    const tick = () => {
      const pads = navigator.getGamepads();
      for (const gp of pads) {
        if (!gp?.connected) continue;
        const msg = gpToMsg(gp);
        const json = JSON.stringify(msg);
        if (this.prevJson.get(gp.index) !== json) {
          this.prevJson.set(gp.index, json);
          this.send(msg);
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.prevJson.clear();
  }
}
