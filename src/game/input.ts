import { Vector2 } from "@babylonjs/core";

/**
 * Unified movement input: keyboard (WASD / arrows) merged with an on-screen
 * virtual joystick for touch devices. Exposes a normalized 2D direction where
 * x = strafe (right +), y = forward (+).
 */
export class InputManager {
  private keys = new Set<string>();
  private joyActive = false;
  private joyId = -1;
  private joyOrigin = new Vector2(0, 0);
  private joyVec = new Vector2(0, 0);
  private canvas: HTMLElement;
  public onPauseToggle?: () => void;

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      e.preventDefault();
    }
    if (k === "p" || k === "escape") {
      this.onPauseToggle?.();
      return;
    }
    this.keys.add(k);
  };

  private readonly handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private readonly handlePointerDown = (e: PointerEvent) => {
    // Only left half of the screen drives the joystick; keep it forgiving.
    if (this.joyActive) return;
    this.joyActive = true;
    this.joyId = e.pointerId;
    this.joyOrigin.set(e.clientX, e.clientY);
    this.joyVec.set(0, 0);
  };

  private readonly handlePointerMove = (e: PointerEvent) => {
    if (!this.joyActive || e.pointerId !== this.joyId) return;
    const dx = e.clientX - this.joyOrigin.x;
    const dy = e.clientY - this.joyOrigin.y;
    const max = 70;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max) / max;
    this.joyVec.set((dx / len) * clamped, (dy / len) * clamped);
  };

  private readonly handlePointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.joyId) return;
    this.joyActive = false;
    this.joyId = -1;
    this.joyVec.set(0, 0);
  };

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
  }

  /** Direction in screen space: x right, y forward (up on screen). */
  getDirection(): Vector2 {
    let x = 0;
    let y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;

    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      return new Vector2(x / len, y / len);
    }
    // Joystick: screen-down is negative forward.
    if (this.joyActive) {
      return new Vector2(this.joyVec.x, -this.joyVec.y);
    }
    return new Vector2(0, 0);
  }

  dispose() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
  }
}
