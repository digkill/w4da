import {
  Scene,
  Vector3,
  TransformNode,
  SceneLoader,
  AssetContainer,
  AnimationGroup,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { ARENA_RADIUS } from "./player";
import type { EnemyEvents, SpeakingBubble } from "./enemies";
import womanUrl from "../assets/wooman_zombie.glb?url";

// The model's default forward axis after glTF import. She was walking
// backwards with a Math.PI offset, so face straight along the travel vector.
const FACING_OFFSET = 0;
const TARGET_HEIGHT = 3.4; // taller than the primitive horde — an "elite"
const CONTACT_DIST = 3.0;
const CONTACT_DMG = 16;
const CONTACT_CD = 1.1;
const SPEAK_TIME = 2.6;

const SCREAMS = ["w4da!!!", "ува дон зелик", "оплати страховку", "работаю по предоплате"];

type WState = "wake" | "chase" | "attack" | "dead";

interface Woman {
  root: TransformNode;
  model: TransformNode;
  anims: Map<string, AnimationGroup>;
  current: string;
  hp: number;
  speed: number;
  state: WState;
  stateT: number;
  hitCd: number;
  speakT: number;
  speakCd: number;
  phrase: string;
  alive: boolean;
}

export class WomanZombieManager {
  private scene: Scene;
  private events: EnemyEvents;
  private container: AssetContainer | null = null;
  private ready = false;
  private pool: Woman[] = [];
  private scale = 1;
  private yOffset = 0;
  private measured = false;

  private spawnTimer = 3;

  constructor(scene: Scene, events: EnemyEvents) {
    this.scene = scene;
    this.events = events;
    this.load();
  }

  private async load() {
    try {
      this.container = await SceneLoader.LoadAssetContainerAsync(
        womanUrl,
        "",
        this.scene,
        null,
        ".glb",
      );
      this.ready = true;
    } catch (e) {
      console.warn("[W4DA] woman zombie model failed to load:", e);
    }
  }

  get aliveCount() {
    return this.pool.filter((w) => w.alive && w.state !== "dead").length;
  }

  private maxWomen(wave: number) {
    return Math.min(1 + Math.floor(wave / 2), 4);
  }

  private setAnim(w: Woman, name: string, loop: boolean) {
    if (w.current === name) return;
    w.anims.forEach((g) => g.stop());
    const g = w.anims.get(name);
    if (g) g.start(loop, 1.0, g.from, g.to, false);
    w.current = name;
  }

  private spawnOne(wave: number) {
    if (!this.container) return;
    let w = this.pool.find((p) => !p.alive);
    if (!w) {
      const root = new TransformNode("woman" + this.pool.length, this.scene);
      const inst = this.container.instantiateModelsToScene(
        (n) => n + "_w" + this.pool.length,
        false,
      );
      const model = inst.rootNodes[0] as TransformNode;

      if (!this.measured) {
        const b = model.getHierarchyBoundingVectors(true);
        const h = b.max.y - b.min.y || 1;
        this.scale = TARGET_HEIGHT / h;
        this.yOffset = -b.min.y * this.scale;
        this.measured = true;
      }

      model.parent = root;
      root.scaling.setAll(this.scale);

      const anims = new Map<string, AnimationGroup>();
      inst.animationGroups.forEach((g) => {
        g.stop();
        anims.set(g.name.replace(/_w\d+$/, ""), g);
      });

      w = {
        root,
        model,
        anims,
        current: "",
        hp: 0,
        speed: 0,
        state: "wake",
        stateT: 0,
        hitCd: 0,
        speakT: 0,
        speakCd: 0,
        phrase: "",
        alive: false,
      };
      this.pool.push(w);
    }

    const ang = Math.random() * Math.PI * 2;
    const dist = ARENA_RADIUS * (0.75 + Math.random() * 0.22);
    w.root.position.set(Math.cos(ang) * dist, this.yOffset, Math.sin(ang) * dist);
    w.root.setEnabled(true);
    w.hp = 150 + wave * 22;
    w.speed = 3.4 + wave * 0.22;
    w.state = "wake";
    w.stateT = 1.4;
    w.hitCd = 0;
    w.speakT = 0;
    w.speakCd = 4 + Math.random() * 7;
    w.phrase = "";
    w.current = "";
    w.alive = true;
    this.setAnim(w, "Wake_Up_and_Look_Up", false);
  }

  update(dt: number, playerPos: Vector3, wave: number) {
    if (!this.ready) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.aliveCount < this.maxWomen(wave)) {
      this.spawnOne(wave);
      this.spawnTimer = 5 + Math.random() * 4;
    }

    for (const w of this.pool) {
      if (!w.alive) continue;

      if (w.state === "dead") {
        w.stateT -= dt;
        if (w.stateT <= 0) {
          w.alive = false;
          w.root.setEnabled(false);
          w.root.position.set(0, -200, 0);
          w.anims.forEach((g) => g.stop());
        }
        continue;
      }

      const dx = playerPos.x - w.root.position.x;
      const dz = playerPos.z - w.root.position.z;
      const d = Math.hypot(dx, dz) || 1;
      w.root.rotation.y = Math.atan2(dx, dz) + FACING_OFFSET;

      if (w.state === "wake") {
        w.stateT -= dt;
        if (w.stateT <= 0) w.state = "chase";
        continue;
      }

      // Screaming a taunt (briefly interrupts the walk).
      if (w.speakT > 0) {
        w.speakT -= dt;
        this.setAnim(w, "Zombie_Scream", false);
        if (w.speakT <= 0) w.current = ""; // force re-pick next frame
        continue;
      }

      if (d <= CONTACT_DIST) {
        w.state = "attack";
        this.setAnim(w, "Attack", true);
        w.hitCd -= dt;
        if (w.hitCd <= 0) {
          w.hitCd = CONTACT_CD;
          this.events.onPlayerHit(CONTACT_DMG);
        }
      } else {
        w.state = "chase";
        this.setAnim(w, "Unsteady_Walk", true);
        const nx = dx / d;
        const nz = dz / d;
        w.root.position.x += nx * w.speed * dt;
        w.root.position.z += nz * w.speed * dt;
      }

      // Taunt trigger
      w.speakCd -= dt;
      if (w.speakCd <= 0 && d < 50) {
        w.speakT = SPEAK_TIME;
        w.speakCd = 8 + Math.random() * 8;
        w.phrase = SCREAMS[Math.floor(Math.random() * SCREAMS.length)];
      }
    }
  }

  nearestTo(p: Vector3): Vector3 | null {
    let best: Vector3 | null = null;
    let bestD = Infinity;
    for (const w of this.pool) {
      if (!w.alive || w.state === "dead" || w.state === "wake") continue;
      const dx = w.root.position.x - p.x;
      const dz = w.root.position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = w.root.position;
      }
    }
    return best;
  }

  hitTest(point: Vector3, radius: number, dmg: number): boolean {
    for (const w of this.pool) {
      if (!w.alive || w.state === "dead") continue;
      const dx = w.root.position.x - point.x;
      const dz = w.root.position.z - point.z;
      const rr = radius + 1.3;
      if (dx * dx + dz * dz <= rr * rr) {
        w.hp -= dmg;
        if (w.hp <= 0) {
          w.state = "dead";
          w.stateT = 2.4;
          w.speakT = 0;
          this.setAnim(w, "Dead", false);
          this.events.onKill(60); // elite bonus
        }
        return true;
      }
    }
    return false;
  }

  appendSpeaking(out: SpeakingBubble[]): void {
    for (const w of this.pool) {
      if (!w.alive || w.state === "dead" || w.speakT <= 0) continue;
      out.push({
        id: 100000 + this.pool.indexOf(w), // avoid id clash with primitive horde
        text: w.phrase,
        pos: new Vector3(
          w.root.position.x,
          w.root.position.y + TARGET_HEIGHT * 1.05,
          w.root.position.z,
        ),
      });
    }
  }

  reset() {
    for (const w of this.pool) {
      w.alive = false;
      w.root.setEnabled(false);
      w.root.position.set(0, -200, 0);
      w.anims.forEach((g) => g.stop());
      w.current = "";
    }
    this.spawnTimer = 3;
  }

  dispose() {
    this.pool.forEach((w) => w.root.dispose());
    this.container?.dispose();
  }
}
