/**
 * W4DA multiplayer client — thin WebSocket transport to the Rust worker.
 * Disabled by default until the worker is deployed and wired into the game loop.
 */

/** Set VITE_MULTIPLAYER_ENABLED=true at build time to turn networking back on. */
export const MULTIPLAYER_ENABLED =
  import.meta.env.VITE_MULTIPLAYER_ENABLED === "true";

const DEFAULT_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8059/ws";

export interface PlayerState {
  x: number;
  z: number;
  heading?: number;
  hp?: number;
  anim?: string;
}

export interface RemotePlayer extends PlayerState {
  id: string;
  name: string;
}

type Events = {
  welcome: { selfId: string; room: string; capacity: number; players: RemotePlayer[] };
  joined: { id: string; name: string };
  state: RemotePlayer;
  action: { id: string; kind: string; data: unknown };
  left: { id: string };
  roomFull: { capacity: number };
  close: void;
  error: void;
};

type Handler<K extends keyof Events> = (payload: Events[K]) => void;

export class MultiplayerClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers: Record<string, Set<(p: any) => void>> = {};
  /** Latest known state of every other player in the room. */
  readonly players = new Map<string, RemotePlayer>();
  selfId: string | null = null;

  constructor(url: string = DEFAULT_URL) {
    this.url = url;
  }

  on<K extends keyof Events>(event: K, handler: Handler<K>): this {
    (this.handlers[event] ??= new Set()).add(handler as (p: any) => void);
    return this;
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]) {
    this.handlers[event]?.forEach((h) => h(payload));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(room: string, name: string) {
    if (!MULTIPLAYER_ENABLED) return;
    this.disconnect();
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => this.send({ t: "join", room, name }));
    ws.addEventListener("message", (e) => this.handle(String(e.data)));
    ws.addEventListener("close", () => this.emit("close", undefined));
    ws.addEventListener("error", () => this.emit("error", undefined));
  }

  private handle(raw: string) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome":
        this.selfId = m.id;
        this.players.clear();
        for (const p of m.players as RemotePlayer[]) this.players.set(p.id, p);
        this.emit("welcome", { selfId: m.id, room: m.room, capacity: m.capacity, players: m.players });
        break;
      case "joined":
        this.players.set(m.id, { id: m.id, name: m.name, x: 0, z: 0 });
        this.emit("joined", { id: m.id, name: m.name });
        break;
      case "state": {
        const prev = this.players.get(m.id);
        const rp: RemotePlayer = {
          id: m.id,
          name: prev?.name ?? "",
          x: m.x,
          z: m.z,
          heading: m.heading,
          hp: m.hp,
          anim: m.anim,
        };
        this.players.set(m.id, rp);
        this.emit("state", rp);
        break;
      }
      case "action":
        this.emit("action", { id: m.id, kind: m.kind, data: m.data });
        break;
      case "left":
        this.players.delete(m.id);
        this.emit("left", { id: m.id });
        break;
      case "room_full":
        this.emit("roomFull", { capacity: m.capacity });
        break;
    }
  }

  sendState(s: PlayerState) {
    if (!MULTIPLAYER_ENABLED) return;
    this.send({ t: "state", ...s });
  }

  sendAction(kind: string, data: unknown = {}) {
    if (!MULTIPLAYER_ENABLED) return;
    this.send({ t: "action", kind, data });
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.players.clear();
    this.selfId = null;
  }
}
