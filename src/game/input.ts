import { Vector2 } from "@babylonjs/core";

/**
 * Keyboard movement input (WASD / arrows) as a secondary control scheme.
 * Primary control is Dota-style click-to-move, handled in Game via scene picking.
 * Exposes a normalized 2D direction: x = strafe (right +), y = forward (+).
 */
export class InputManager {
  private keys = new Set<string>();
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

  constructor() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  /** Direction in screen space: x right, y forward (up on screen). Zero if idle. */
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
    return new Vector2(0, 0);
  }

  get active() {
    return this.keys.size > 0;
  }

  dispose() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }
}
