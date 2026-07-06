import {
  Scene,
  Vector3,
  TransformNode,
  Mesh,
  InstancedMesh,
} from "@babylonjs/core";
import { buildZombiePrototype, buildBlobShadow } from "./factory";
import { ARENA_RADIUS } from "./player";

interface Enemy {
  id: number;
  root: TransformNode;
  inst: InstancedMesh;
  hp: number;
  speed: number;
  phase: number;
  alive: boolean;
  dying: boolean;
  dieT: number;
  hitCd: number;
  speakT: number;
  speakCd: number;
  phrase: string;
}

const CONTACT_DIST = 2.3;
const CONTACT_DMG = 9;
const CONTACT_CD = 0.8;

const PHRASES = [
  "w4da!!!",
  "Давай на тизомирной ноте",
  "делезный рубь не вворачивается",
  "оплати страховку",
  "работаю по предоплате",
  "ува дон зелик",
];
const MAX_SPEAKERS = 5;
const SPEAK_TIME = 2.6;

export interface SpeakingBubble {
  id: number;
  text: string;
  pos: Vector3;
}

export interface EnemyEvents {
  onPlayerHit: (dmg: number) => void;
  onKill: (points: number) => void;
}

export class EnemyManager {
  private scene: Scene;
  private proto: Mesh;
  private blobProto: Mesh;
  private pool: Enemy[] = [];
  private events: EnemyEvents;

  wave = 1;
  private waveTimer = 0;
  private spawnTimer = 0;

  constructor(scene: Scene, events: EnemyEvents) {
    this.scene = scene;
    this.events = events;
    this.proto = buildZombiePrototype(scene);
    this.blobProto = buildBlobShadow(scene, 1.6);
    this.blobProto.isVisible = false;
  }

  get aliveCount() {
    return this.pool.filter((e) => e.alive && !e.dying).length;
  }

  reset() {
    this.pool.forEach((e) => this.recycle(e));
    this.wave = 1;
    this.waveTimer = 0;
    this.spawnTimer = 0;
  }

  private targetAlive() {
    return Math.min(6 + this.wave * 3, 60);
  }

  private enemySpeed() {
    return 4.2 + this.wave * 0.35 + Math.random() * 1.2;
  }

  private enemyHp() {
    return 30 + this.wave * 8;
  }

  private spawnOne() {
    let e = this.pool.find((p) => !p.alive);
    if (!e) {
      const id = this.pool.length;
      const root = new TransformNode("enemy" + id, this.scene);
      const inst = this.proto.createInstance("zInst" + id);
      inst.parent = root;
      inst.isPickable = false;
      const blob = this.blobProto.createInstance("zBlob" + id);
      blob.parent = root;
      blob.isVisible = true;
      e = {
        id,
        root,
        inst,
        hp: 0,
        speed: 0,
        phase: 0,
        alive: false,
        dying: false,
        dieT: 0,
        hitCd: 0,
        speakT: 0,
        speakCd: 0,
        phrase: "",
      };
      this.pool.push(e);
    }
    const ang = Math.random() * Math.PI * 2;
    const dist = ARENA_RADIUS * (0.7 + Math.random() * 0.28);
    e.root.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    e.root.scaling.setAll(0.9 + Math.random() * 0.35);
    e.root.rotation.set(0, 0, 0);
    e.inst.isVisible = true;
    e.hp = this.enemyHp();
    e.speed = this.enemySpeed();
    e.phase = Math.random() * Math.PI * 2;
    e.alive = true;
    e.dying = false;
    e.dieT = 0;
    e.hitCd = 0;
    e.speakT = 0;
    e.speakCd = 2 + Math.random() * 8;
    e.phrase = "";
  }

  update(dt: number, playerPos: Vector3) {
    // Wave progression
    this.waveTimer += dt;
    if (this.waveTimer > 22) {
      this.waveTimer = 0;
      this.wave++;
    }
    // Maintain population
    this.spawnTimer -= dt;
    if (this.aliveCount < this.targetAlive() && this.spawnTimer <= 0) {
      this.spawnOne();
      this.spawnTimer = Math.max(0.12, 0.6 - this.wave * 0.03);
    }

    const t = performance.now() * 0.001;
    let speakers = 0;
    for (const e of this.pool) if (e.alive && !e.dying && e.speakT > 0) speakers++;

    for (const e of this.pool) {
      if (!e.alive) continue;

      if (e.dying) {
        e.dieT += dt;
        const k = 1 - e.dieT / 0.45;
        e.root.scaling.setAll(Math.max(0, k) * (0.9 + e.phase * 0));
        e.root.position.y += dt * 3;
        e.root.rotation.y += dt * 12;
        e.inst.scaling.setAll(1);
        if (e.dieT >= 0.45) this.recycle(e);
        continue;
      }

      const dx = playerPos.x - e.root.position.x;
      const dz = playerPos.z - e.root.position.z;
      const d = Math.hypot(dx, dz) || 1;

      if (d > CONTACT_DIST) {
        const nx = dx / d;
        const nz = dz / d;
        e.root.position.x += nx * e.speed * dt;
        e.root.position.z += nz * e.speed * dt;
        e.root.rotation.y = Math.atan2(-nz, nx) - Math.PI / 2;
      }
      // shambling wobble
      e.inst.rotation.z = Math.sin(t * 6 + e.phase) * 0.16;
      e.inst.position.y = Math.abs(Math.sin(t * 5 + e.phase)) * 0.12;

      // contact damage
      e.hitCd -= dt;
      if (d <= CONTACT_DIST && e.hitCd <= 0) {
        e.hitCd = CONTACT_CD;
        this.events.onPlayerHit(CONTACT_DMG);
      }

      // taunts
      if (e.speakT > 0) {
        e.speakT -= dt;
      } else {
        e.speakCd -= dt;
        if (e.speakCd <= 0 && speakers < MAX_SPEAKERS && d < 45) {
          e.speakT = SPEAK_TIME;
          e.speakCd = 7 + Math.random() * 9;
          e.phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
          speakers++;
        }
      }
    }
  }

  /** Currently talking zombies with a world-space anchor above their heads. */
  getSpeaking(out: SpeakingBubble[]): void {
    out.length = 0;
    for (const e of this.pool) {
      if (!e.alive || e.dying || e.speakT <= 0) continue;
      out.push({
        id: e.id,
        text: e.phrase,
        pos: new Vector3(
          e.root.position.x,
          e.root.position.y + 2.4 * e.root.scaling.y,
          e.root.position.z,
        ),
      });
    }
  }

  /** Nearest living, non-dying enemy to a point (for auto-aim). */
  nearestTo(p: Vector3): Vector3 | null {
    let best: Vector3 | null = null;
    let bestD = Infinity;
    for (const e of this.pool) {
      if (!e.alive || e.dying) continue;
      const dx = e.root.position.x - p.x;
      const dz = e.root.position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = e.root.position;
      }
    }
    return best;
  }

  /** Apply bullet damage at a point. Returns true if a bullet should be consumed. */
  hitTest(point: Vector3, radius: number, dmg: number): boolean {
    for (const e of this.pool) {
      if (!e.alive || e.dying) continue;
      // Treat units as vertical cylinders: match on the ground plane only so
      // fast tracers reliably connect regardless of muzzle height.
      const dx = e.root.position.x - point.x;
      const dz = e.root.position.z - point.z;
      const rr = radius + 1.0;
      if (dx * dx + dz * dz <= rr * rr) {
        e.hp -= dmg;
        if (e.hp <= 0) {
          e.dying = true;
          e.dieT = 0;
          this.events.onKill(10 + this.wave);
        }
        return true;
      }
    }
    return false;
  }

  private recycle(e: Enemy) {
    e.alive = false;
    e.dying = false;
    e.speakT = 0;
    e.inst.isVisible = false;
    e.root.position.set(0, -100, 0);
    e.root.scaling.setAll(1);
    e.inst.rotation.z = 0;
    e.inst.position.y = 0;
  }

  dispose() {
    this.pool.forEach((e) => {
      e.inst.dispose();
      e.root.dispose();
    });
    this.proto.dispose();
    this.blobProto.dispose();
  }
}
