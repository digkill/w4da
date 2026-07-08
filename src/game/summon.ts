import {
  Scene,
  Vector3,
  TransformNode,
  SceneLoader,
  AnimationGroup,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { ZombieManager } from "./zombies";
import { makeSfxPool, playSfx } from "./sfx";
import ringUrl from "../assets/magic_ring.glb?url";
import appearSfxUrl from "../assets/audio/ognennyiy-shar--yarkiy.mp3?url";
import roarSfxUrl from "../assets/audio/fireball-erupted.mp3?url";

const CAST_TIME = 2; // seconds — summon channel
const DURATION = 15; // elemental lifetime
const ELEM_HEIGHT = 5.2;
const ELEM_SPEED = 6;
const ATTACK_RANGE = 3.2;
const AOE_RADIUS = 4.2;
const AOE_DMG = 55; // per tick
const AOE_INTERVAL = 0.5;
const FACING_OFFSET = 0;

type State = "idle" | "casting" | "active";

export class FireElemental {
  private scene: Scene;

  private elemRoot: TransformNode | null = null;
  private elemAnims: AnimationGroup[] = [];
  private elemCurrent = "";
  private elemScale = 1;
  private elemYOffset = 0;

  private ring: TransformNode | null = null;
  private ringAnims: AnimationGroup[] = [];

  private appearSfx = makeSfxPool(appearSfxUrl, 2, 0.7);
  private roarSfx = makeSfxPool(roarSfxUrl, 2, 0.5);
  private state: State = "idle";
  private timer = 0;
  private aoeTimer = 0;
  private roarTimer = 0;
  private heroPos = new Vector3();
  private ready = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.load();
  }

  private async load() {
    try {
      // Fire Elemental (gltf + external textures served from /public).
      const elem = await SceneLoader.LoadAssetContainerAsync("/fire-elemental/", "elemental.gltf", this.scene);
      const inst = elem.instantiateModelsToScene((n) => n, false);
      const model = inst.rootNodes[0] as TransformNode;
      const b = model.getHierarchyBoundingVectors(true);
      const h = b.max.y - b.min.y || 1;
      this.elemScale = ELEM_HEIGHT / h;
      this.elemYOffset = -b.min.y * this.elemScale;
      const root = new TransformNode("elemental", this.scene);
      model.parent = root;
      root.scaling.setAll(this.elemScale);
      root.setEnabled(false);
      this.elemRoot = root;
      this.elemAnims = inst.animationGroups;
      this.elemAnims.forEach((g) => g.stop());

      // Magic ring cast effect.
      const ring = await SceneLoader.LoadAssetContainerAsync(ringUrl, "", this.scene, null, ".glb");
      const rInst = ring.instantiateModelsToScene((n) => n, false);
      const rRoot = rInst.rootNodes[0] as TransformNode;
      const rb = rRoot.getHierarchyBoundingVectors(true);
      const rw = Math.max(rb.max.x - rb.min.x, rb.max.z - rb.min.z) || 1;
      const rRootNode = new TransformNode("magicRing", this.scene);
      rRoot.parent = rRootNode;
      rRootNode.scaling.setAll(6 / rw); // ~6u ring around the hero
      rRootNode.setEnabled(false);
      this.ring = rRootNode;
      this.ringAnims = rInst.animationGroups;

      this.ready = true;
    } catch (e) {
      console.warn("[W4DA] fire elemental / ring failed to load:", e);
    }
  }

  /** Can a new ultimate be cast right now? */
  canCast() {
    return this.ready && this.state === "idle";
  }

  get busy() {
    return this.state !== "idle";
  }

  cast(heroPos: Vector3) {
    if (!this.canCast()) return;
    this.state = "casting";
    this.timer = CAST_TIME;
    this.heroPos.copyFrom(heroPos);
    if (this.ring) {
      this.ring.position.set(heroPos.x, 0.1, heroPos.z);
      this.ring.setEnabled(true);
      this.ringAnims.forEach((g) => g.start(true));
    }
  }

  private setElemAnim(base: string, loop: boolean) {
    if (this.elemCurrent === base) return;
    this.elemAnims.forEach((g) => g.stop());
    const g =
      this.elemAnims.find((x) => x.name === base) ??
      this.elemAnims.find((x) => x.name.includes(base));
    if (g) g.start(loop, 1, g.from, g.to, false);
    this.elemCurrent = base;
  }

  update(dt: number, heroPos: Vector3, zombies: ZombieManager) {
    if (this.state === "casting") {
      this.timer -= dt;
      if (this.ring) this.ring.position.set(heroPos.x, 0.1, heroPos.z);
      if (this.timer <= 0) {
        // Finish channel → spawn the elemental.
        if (this.ring) {
          this.ring.setEnabled(false);
          this.ringAnims.forEach((g) => g.stop());
        }
        if (this.elemRoot) {
          this.elemRoot.position.set(heroPos.x + 3, this.elemYOffset, heroPos.z);
          this.elemRoot.setEnabled(true);
          this.elemCurrent = "";
          this.setElemAnim("Idle 01", true);
          playSfx(this.appearSfx); // fiery ball — the elemental appears
        }
        this.state = "active";
        this.timer = DURATION;
        this.aoeTimer = 0;
        this.roarTimer = 2.5;
      }
      return;
    }

    if (this.state === "active" && this.elemRoot) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.elemRoot.setEnabled(false);
        this.elemAnims.forEach((g) => g.stop());
        this.state = "idle";
        return;
      }

      // Periodic roar while alive.
      this.roarTimer -= dt;
      if (this.roarTimer <= 0) {
        this.roarTimer = 3 + Math.random() * 2;
        playSfx(this.roarSfx);
      }

      const p = this.elemRoot.position;
      const target = zombies.nearestTo(p);
      if (target) {
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        this.elemRoot.rotation.y = Math.atan2(dx, dz) + FACING_OFFSET;
        if (d > ATTACK_RANGE) {
          this.setElemAnim("Running", true);
          p.x += (dx / d) * ELEM_SPEED * dt;
          p.z += (dz / d) * ELEM_SPEED * dt;
        } else {
          this.setElemAnim("Atack 01", true);
          this.aoeTimer -= dt;
          if (this.aoeTimer <= 0) {
            this.aoeTimer = AOE_INTERVAL;
            zombies.damageArea(p, AOE_RADIUS, AOE_DMG);
          }
        }
      } else {
        this.setElemAnim("Idle 01", true);
      }
    }
  }

  reset() {
    if (this.elemRoot) {
      this.elemRoot.setEnabled(false);
      this.elemAnims.forEach((g) => g.stop());
    }
    if (this.ring) {
      this.ring.setEnabled(false);
      this.ringAnims.forEach((g) => g.stop());
    }
    this.state = "idle";
    this.timer = 0;
  }

  dispose() {
    this.elemRoot?.dispose();
    this.ring?.dispose();
  }
}
