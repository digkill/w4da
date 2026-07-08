import {
  Scene,
  Vector3,
  TransformNode,
  SceneLoader,
  AssetContainer,
  AnimationGroup,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Color3,
  Mesh,
  type GlowLayer,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { ARENA_RADIUS } from "./player";
import { makeSfxPool, playSfx } from "./sfx";
import type { EnemyEvents, SpeakingBubble } from "./types";
import screamSfxUrl from "../assets/audio/zombie-scream-sound-with-echo-effect-2.mp3?url";
import woomanUrl from "../assets/wooman_zombie.glb?url";
import zaushaUrl from "../assets/zausha.glb?url";
import baronUrl from "../assets/baron.glb?url";
import ogreUrl from "../assets/big_three_head_ogr.glb?url";

// Both models flip to face along the travel vector without extra offset.
const FACING_OFFSET = 0;
const CONTACT_DIST = 3.0;
const CONTACT_DMG = 12;
const CONTACT_CD = 0.9;
const SPEAK_TIME = 2.6;

const SCREAMS = [
  "w4da!!!",
  "ува дон зелик",
  "оплати страховку",
  "работаю по предоплате",
  "делезный рубь не вворачивается",
];

interface ZType {
  id: number;
  url: string;
  targetH: number;
  hearts: boolean;
  hpBase: number;
  hpWave: number;
  speedBase: number;
  speedWave: number;
  points: number;
  weight: number; // relative spawn frequency
  boss?: boolean;
  // Combat overrides (fall back to the default contact values):
  attackAnim?: string;
  contactDist?: number;
  contactDmg?: number;
  contactCd?: number;
  aoe?: number; // if set, attacks trigger an area shockwave of this radius
}

// The ONLY zombies in the game are these user-supplied GLB models.
const TYPES: ZType[] = [
  { id: 0, url: woomanUrl, targetH: 4.95, hearts: false, hpBase: 140, hpWave: 20, speedBase: 4.4, speedWave: 0.24, points: 14, weight: 8 },
  { id: 1, url: zaushaUrl, targetH: 4.65, hearts: true, hpBase: 120, hpWave: 18, speedBase: 4.8, speedWave: 0.26, points: 16, weight: 8 },
  // Барон Зелик — редкий мини-босс: заметно крупнее и толще по HP.
  { id: 2, url: baronUrl, targetH: 7.4, hearts: false, hpBase: 640, hpWave: 90, speedBase: 3.4, speedWave: 0.2, points: 90, weight: 1, boss: true },
  // Трёхголовый огр — тяжёлый мини-босс: медленный, огромный HP, удар по площади.
  {
    id: 3, url: ogreUrl, targetH: 9.0, hearts: false, hpBase: 1600, hpWave: 140,
    speedBase: 2.5, speedWave: 0.12, points: 150, weight: 1, boss: true,
    attackAnim: "Basic_Jump", contactDist: 5.5, contactDmg: 42, contactCd: 2.1, aoe: 5.5,
  },
];

type ZState = "wake" | "chase" | "attack" | "dead";

interface Zombie {
  typeId: number;
  targetH: number;
  root: TransformNode;
  anims: Map<string, AnimationGroup>;
  current: string;
  hp: number;
  speed: number;
  points: number;
  state: ZState;
  stateT: number;
  hitCd: number;
  speakT: number;
  speakCd: number;
  phrase: string;
  alive: boolean;
  hearts: Mesh[] | null;
  heartAnchor: TransformNode | null;
  heartSeed: number;
}

interface TypeRuntime {
  container: AssetContainer | null;
  scale: number;
  yOffset: number;
  measured: boolean;
}

export class ZombieManager {
  private scene: Scene;
  private events: EnemyEvents;
  private glow: GlowLayer;
  private rt = new Map<number, TypeRuntime>();
  private pool: Zombie[] = [];
  private heartMat: StandardMaterial | null = null;
  private shocks: { mesh: Mesh; life: number; radius: number }[] = [];
  private shockMat: StandardMaterial | null = null;
  private screamSfx = makeSfxPool(screamSfxUrl, 2, 0.55);

  wave = 1;
  private waveTimer = 0;
  private spawnTimer = 2;

  constructor(scene: Scene, events: EnemyEvents, glow: GlowLayer) {
    this.scene = scene;
    this.events = events;
    this.glow = glow;
    TYPES.forEach((t) => this.rt.set(t.id, { container: null, scale: 1, yOffset: 0, measured: false }));
    this.load();
  }

  private async load() {
    await Promise.all(
      TYPES.map(async (t) => {
        try {
          const c = await SceneLoader.LoadAssetContainerAsync(t.url, "", this.scene, null, ".glb");
          this.rt.get(t.id)!.container = c;
        } catch (e) {
          console.warn("[W4DA] zombie model failed to load:", t.url, e);
        }
      }),
    );
  }

  private get loadedTypes() {
    return TYPES.filter((t) => this.rt.get(t.id)!.container);
  }

  get ready() {
    return this.loadedTypes.length > 0;
  }

  get aliveCount() {
    return this.pool.filter((z) => z.alive && z.state !== "dead").length;
  }

  private targetAlive() {
    return Math.min(8 + this.wave * 3, 22);
  }

  // ---- pixel hearts (for zausha) ----
  private ensureHeartMat() {
    if (this.heartMat) return this.heartMat;
    const size = 16;
    const tex = new DynamicTexture("heartTex", { width: size, height: size }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ff4d8d";
    // 8x8 pixel heart, each cell = 2px
    const heart = [
      "01100110",
      "11111111",
      "11111111",
      "11111111",
      "01111110",
      "00111100",
      "00011000",
      "00000000",
    ];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        if (heart[y][x] === "1") ctx.fillRect(x * 2, y * 2, 2, 2);
    tex.update(false);

    const m = new StandardMaterial("heartMat", this.scene);
    m.diffuseTexture = tex;
    m.emissiveColor = Color3.FromHexString("#ff4d8d");
    m.diffuseColor = Color3.FromHexString("#ff4d8d");
    m.useAlphaFromDiffuseTexture = true;
    m.disableLighting = true;
    m.backFaceCulling = false;
    this.heartMat = m;
    return m;
  }

  private createHearts(): { anchor: TransformNode; hearts: Mesh[] } {
    const anchor = new TransformNode("heartAnchor", this.scene);
    const mat = this.ensureHeartMat();
    const hearts: Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const h = MeshBuilder.CreatePlane("heart" + i, { size: 0.55 }, this.scene);
      h.material = mat;
      h.billboardMode = Mesh.BILLBOARDMODE_ALL;
      h.isPickable = false;
      h.parent = anchor;
      hearts.push(h);
    }
    return { anchor, hearts };
  }

  /** Expanding ground shockwave for the ogre's area-of-effect slam. */
  private triggerShock(pos: Vector3, radius: number) {
    let s = this.shocks.find((x) => x.life <= 0);
    if (!s) {
      if (!this.shockMat) {
        const m = new StandardMaterial("shockMat", this.scene);
        m.emissiveColor = Color3.FromHexString("#ff5a1e");
        m.diffuseColor = Color3.FromHexString("#ff5a1e");
        m.disableLighting = true;
        this.shockMat = m;
      }
      const mesh = MeshBuilder.CreateTorus(
        "shock" + this.shocks.length,
        { diameter: 2, thickness: 0.18, tessellation: 40 },
        this.scene,
      );
      mesh.material = this.shockMat;
      mesh.rotation.x = Math.PI / 2;
      mesh.isPickable = false;
      s = { mesh, life: 0, radius: 1 };
      this.shocks.push(s);
    }
    s.mesh.position.set(pos.x, 0.2, pos.z);
    s.radius = radius;
    s.life = 0.5;
    s.mesh.isVisible = true;
  }

  private updateShocks(dt: number) {
    for (const s of this.shocks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.isVisible = false;
        continue;
      }
      const k = 1 - s.life / 0.5; // 0..1
      const sc = 0.4 + k * s.radius; // torus base radius 1 → world radius
      s.mesh.scaling.set(sc, sc, 1);
      s.mesh.visibility = 1 - k; // fade out (drives transparency)
    }
  }

  private setAnim(z: Zombie, name: string, loop: boolean) {
    if (z.current === name) return;
    z.anims.forEach((g) => g.stop());
    const g = z.anims.get(name);
    if (g) g.start(loop, 1.0, g.from, g.to, false);
    z.current = name;
  }

  private pickType(): ZType | null {
    const types = this.loadedTypes;
    if (types.length === 0) return null;
    // Each boss type is limited to one alive at a time and only from wave 2+.
    const eligible = types.filter((t) => {
      if (!t.boss) return true;
      if (this.wave < 2) return false;
      const present = this.pool.some(
        (z) => z.alive && z.state !== "dead" && z.typeId === t.id,
      );
      return !present;
    });
    const total = eligible.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of eligible) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return eligible[eligible.length - 1];
  }

  private spawnOne() {
    const type = this.pickType();
    if (!type) return;
    const rt = this.rt.get(type.id)!;

    let z = this.pool.find((p) => !p.alive && p.typeId === type.id);
    if (!z) {
      const idx = this.pool.length;
      const root = new TransformNode("z" + idx, this.scene);
      const inst = rt.container!.instantiateModelsToScene((n) => n + "_" + idx, false);
      const model = inst.rootNodes[0] as TransformNode;

      if (!rt.measured) {
        const b = model.getHierarchyBoundingVectors(true);
        const h = b.max.y - b.min.y || 1;
        rt.scale = type.targetH / h;
        rt.yOffset = -b.min.y * rt.scale;
        rt.measured = true;
      }
      model.parent = root;
      root.scaling.setAll(rt.scale);

      // Contrast pass: edge outline (silhouette) + emissive lift. Mobs are
      // excluded from the glow layer so the outline pass doesn't conflict with
      // glow (which previously corrupted the skinned textures).
      const outline = type.boss
        ? Color3.FromHexString("#ff3a2a")
        : Color3.FromHexString("#00e0b0");
      model.getChildMeshes().forEach((m) => {
        this.glow.addExcludedMesh(m as Mesh);
        m.renderOutline = true;
        m.outlineColor = outline;
        m.outlineWidth = 0.02;
        const mm = m.material as unknown as {
          emissiveColor?: Color3;
          emissiveIntensity?: number;
        } | null;
        if (mm && mm.emissiveColor) {
          mm.emissiveColor = Color3.FromHexString(type.boss ? "#4a1c18" : "#2c3f4c");
          if ("emissiveIntensity" in mm) mm.emissiveIntensity = 1;
        }
      });

      const anims = new Map<string, AnimationGroup>();
      inst.animationGroups.forEach((g) => {
        g.stop();
        anims.set(g.name.replace(/_\d+$/, ""), g);
      });

      let hearts: Mesh[] | null = null;
      let heartAnchor: TransformNode | null = null;
      if (type.hearts) {
        const hh = this.createHearts();
        hearts = hh.hearts;
        heartAnchor = hh.anchor;
      }

      z = {
        typeId: type.id,
        targetH: type.targetH,
        root,
        anims,
        current: "",
        hp: 0,
        speed: 0,
        points: type.points,
        state: "wake",
        stateT: 0,
        hitCd: 0,
        speakT: 0,
        speakCd: 0,
        phrase: "",
        alive: false,
        hearts,
        heartAnchor,
        heartSeed: Math.random() * 6.28,
      };
      this.pool.push(z);
    }

    const ang = Math.random() * Math.PI * 2;
    const dist = ARENA_RADIUS * (0.72 + Math.random() * 0.25);
    z.root.position.set(Math.cos(ang) * dist, rt.yOffset, Math.sin(ang) * dist);
    z.root.setEnabled(true);
    z.hp = type.hpBase + this.wave * type.hpWave;
    z.speed = type.speedBase + this.wave * type.speedWave + Math.random();
    z.state = "wake";
    z.stateT = 1.2 + Math.random() * 0.5;
    z.hitCd = 0;
    z.speakT = 0;
    z.speakCd = 3 + Math.random() * 8;
    z.phrase = "";
    z.current = "";
    z.alive = true;
    z.heartAnchor?.setEnabled(true);
    this.setAnim(z, "Wake_Up_and_Look_Up", false);
  }

  update(dt: number, playerPos: Vector3) {
    if (!this.ready) return;

    this.waveTimer += dt;
    if (this.waveTimer > 22) {
      this.waveTimer = 0;
      this.wave++;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.aliveCount < this.targetAlive()) {
      this.spawnOne();
      this.spawnTimer = Math.max(0.22, 1.0 - this.wave * 0.05);
    }

    this.updateShocks(dt);

    const t = performance.now() * 0.001;
    let speakers = 0;
    for (const z of this.pool) if (z.alive && z.state !== "dead" && z.speakT > 0) speakers++;

    for (const z of this.pool) {
      if (!z.alive) continue;

      // Floating pixel hearts follow the head.
      if (z.hearts && z.heartAnchor) {
        z.heartAnchor.position.copyFrom(z.root.position);
        const headY = z.targetH * 1.02;
        for (let i = 0; i < z.hearts.length; i++) {
          const a = t * 1.6 + z.heartSeed + (i * Math.PI * 2) / z.hearts.length;
          const r = 1.35;
          z.hearts[i].position.set(
            Math.cos(a) * r,
            headY + Math.sin(t * 3 + i) * 0.25,
            Math.sin(a) * r,
          );
        }
      }

      if (z.state === "dead") {
        z.stateT -= dt;
        if (z.stateT <= 0) this.recycle(z);
        continue;
      }

      const dx = playerPos.x - z.root.position.x;
      const dz = playerPos.z - z.root.position.z;
      const d = Math.hypot(dx, dz) || 1;
      z.root.rotation.y = Math.atan2(dx, dz) + FACING_OFFSET;

      if (z.state === "wake") {
        z.stateT -= dt;
        if (z.stateT <= 0) z.state = "chase";
        continue;
      }

      if (z.speakT > 0) {
        z.speakT -= dt;
        this.setAnim(z, "Zombie_Scream", false);
        if (z.speakT <= 0) z.current = "";
        continue;
      }

      const ty = TYPES[z.typeId];
      const cDist = ty.contactDist ?? CONTACT_DIST;
      if (d <= cDist) {
        z.state = "attack";
        this.setAnim(z, ty.attackAnim ?? "Attack", true);
        z.hitCd -= dt;
        if (z.hitCd <= 0) {
          z.hitCd = ty.contactCd ?? CONTACT_CD;
          this.events.onPlayerHit(ty.contactDmg ?? CONTACT_DMG);
          if (ty.aoe) this.triggerShock(z.root.position, ty.aoe);
        }
      } else {
        z.state = "chase";
        this.setAnim(z, "Unsteady_Walk", true);
        z.root.position.x += (dx / d) * z.speed * dt;
        z.root.position.z += (dz / d) * z.speed * dt;
      }

      z.speakCd -= dt;
      if (z.speakCd <= 0 && speakers < 5 && d < 55) {
        z.speakT = SPEAK_TIME;
        z.speakCd = 7 + Math.random() * 8;
        z.phrase = SCREAMS[Math.floor(Math.random() * SCREAMS.length)];
        speakers++;
        if (TYPES[z.typeId]?.boss) playSfx(this.screamSfx); // baron / ogre roar
      }
    }
  }

  nearestTo(p: Vector3): Vector3 | null {
    let best: Vector3 | null = null;
    let bestD = Infinity;
    for (const z of this.pool) {
      if (!z.alive || z.state === "dead" || z.state === "wake") continue;
      const dx = z.root.position.x - p.x;
      const dz = z.root.position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = z.root.position;
      }
    }
    return best;
  }

  hitTest(point: Vector3, radius: number, dmg: number): boolean {
    for (const z of this.pool) {
      if (!z.alive || z.state === "dead") continue;
      const dx = z.root.position.x - point.x;
      const dz = z.root.position.z - point.z;
      const rr = radius + 1.3;
      if (dx * dx + dz * dz <= rr * rr) {
        z.hp -= dmg;
        if (z.hp <= 0) {
          z.state = "dead";
          z.stateT = 2.4;
          z.speakT = 0;
          z.heartAnchor?.setEnabled(false);
          this.setAnim(z, "Dead", false);
          this.events.onKill(z.points + this.wave);
        }
        return true;
      }
    }
    return false;
  }

  /** Area damage (used by the Fire Elemental ultimate). */
  damageArea(point: Vector3, radius: number, dmg: number) {
    for (const z of this.pool) {
      if (!z.alive || z.state === "dead") continue;
      const dx = z.root.position.x - point.x;
      const dz = z.root.position.z - point.z;
      if (dx * dx + dz * dz <= radius * radius) {
        z.hp -= dmg;
        if (z.hp <= 0) {
          z.state = "dead";
          z.stateT = 2.4;
          z.speakT = 0;
          z.heartAnchor?.setEnabled(false);
          this.setAnim(z, "Dead", false);
          this.events.onKill(z.points + this.wave);
        }
      }
    }
  }

  getSpeaking(out: SpeakingBubble[]): void {
    out.length = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const z = this.pool[i];
      if (!z.alive || z.state === "dead" || z.speakT <= 0) continue;
      out.push({
        id: i,
        text: z.phrase,
        pos: new Vector3(z.root.position.x, z.root.position.y + z.targetH * 1.08, z.root.position.z),
      });
    }
  }

  private recycle(z: Zombie) {
    z.alive = false;
    z.root.setEnabled(false);
    z.root.position.set(0, -200, 0);
    z.anims.forEach((g) => g.stop());
    z.heartAnchor?.setEnabled(false);
    z.current = "";
  }

  reset() {
    this.pool.forEach((z) => this.recycle(z));
    this.wave = 1;
    this.waveTimer = 0;
    this.spawnTimer = 2;
  }

  dispose() {
    this.pool.forEach((z) => {
      z.root.dispose();
      z.heartAnchor?.dispose();
    });
    this.heartMat?.dispose();
    this.shocks.forEach((s) => s.mesh.dispose());
    this.shockMat?.dispose();
    this.rt.forEach((r) => r.container?.dispose());
  }
}
