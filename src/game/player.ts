import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TransformNode,
  SceneLoader,
  AnimationGroup,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { buildBlobShadow } from "./factory";
import { BulletPool } from "./bullets";
import heroUrl from "../assets/hellsing.glb?url";
import shotgunUrl from "../assets/shotgun.glb?url";

const ARENA_RADIUS = 88;
const MOVE_SPEED = 8.5;
const TURN_LERP = 12;
const HERO_HEIGHT = 2.7;

// --- Shotgun feel ---
const FIRE_INTERVAL = 0.5; // slow, punchy
const PELLETS = 8; // buckshot
const SPREAD = 0.32; // cone half-angle (rad)
const AIM_RANGE = 24;

// --- Shotgun placement (tweak to taste; local offsets are in world units) ---
const HERO_FACING_OFFSET = 0; // flip by Math.PI if the hero faces backwards
const SHOTGUN_POS = new Vector3(0.32, 1.45, 0.5); // right hand, chest height, forward
const SHOTGUN_ROT = new Vector3(0, Math.PI / 2, 0);
const SHOTGUN_SCALE = 1.6;
const MUZZLE_HEIGHT = 1.45;
const MUZZLE_FORWARD = 1.15;

export class Player {
  readonly root: TransformNode;
  private scene: Scene;
  readonly pos: Vector3;
  private heading = 0;
  private ready = false;
  private dead = false;
  private rootYOffset = 0;

  private animGroups: AnimationGroup[] = [];
  private current = "";
  private fireTimer = 0;
  private flash: Mesh;
  private flashLife = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode("hero", scene);
    this.pos = new Vector3(0, 0, 0);

    // Muzzle flash (billboarded, emissive — picked up by the glow layer)
    this.flash = MeshBuilder.CreatePlane("muzzleFlash", { size: 1.8 }, scene);
    const fm = new StandardMaterial("flashMat", scene);
    fm.emissiveColor = Color3.FromHexString("#ffd27a");
    fm.disableLighting = true;
    fm.backFaceCulling = false;
    fm.alpha = 0;
    this.flash.material = fm;
    this.flash.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.flash.isPickable = false;
    this.flash.position.y = -50;

    this.load();
  }

  private async load() {
    try {
      // Hero
      const hero = await SceneLoader.LoadAssetContainerAsync(heroUrl, "", this.scene, null, ".glb");
      const inst = hero.instantiateModelsToScene((n) => n, false);
      const model = inst.rootNodes[0] as TransformNode;
      const b = model.getHierarchyBoundingVectors(true);
      const h = b.max.y - b.min.y || 1;
      const scale = HERO_HEIGHT / h;
      model.parent = this.root;
      this.root.scaling.setAll(scale);
      // feet on the ground
      this.rootYOffset = -b.min.y * scale;

      this.animGroups = inst.animationGroups;
      this.animGroups.forEach((g) => g.stop());

      // Ground blob shadow (counter-scaled so it stays a fixed world size)
      const shadow = buildBlobShadow(this.scene, 2.4 / scale);
      shadow.parent = this.root;
      shadow.position.y = (0.02 - this.rootYOffset) / scale; // world y ~0.02 (at feet)

      // Shotgun (static mesh) — held in front, counter-scaled off the hero scale
      const gun = await SceneLoader.LoadAssetContainerAsync(shotgunUrl, "", this.scene, null, ".glb");
      const gunInst = gun.instantiateModelsToScene((n) => n, false);
      const gunRoot = gunInst.rootNodes[0] as TransformNode;
      const gb = gunRoot.getHierarchyBoundingVectors(true);
      const gunH = Math.max(gb.max.x - gb.min.x, gb.max.y - gb.min.y, gb.max.z - gb.min.z) || 1;
      const gunWorldScale = SHOTGUN_SCALE / gunH; // normalize then apply desired size
      gunRoot.parent = this.root;
      gunRoot.scaling.setAll(gunWorldScale / scale);
      gunRoot.position.set(SHOTGUN_POS.x / scale, SHOTGUN_POS.y / scale, SHOTGUN_POS.z / scale);
      gunRoot.rotation = SHOTGUN_ROT.clone();

      this.ready = true;
      this.setAnim("Idle_5", true);
    } catch (e) {
      console.warn("[W4DA] hero/shotgun failed to load:", e);
    }
  }

  get position() {
    return this.pos;
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.dead = false;
    this.fireTimer = 0;
    if (this.ready) this.setAnim("Idle_5", true);
  }

  setDead() {
    if (!this.ready || this.dead) return;
    this.dead = true;
    this.setAnim("dying_backwards", false);
  }

  private findAnim(base: string): AnimationGroup | undefined {
    return (
      this.animGroups.find((g) => g.name === base) ??
      this.animGroups.find((g) => g.name.includes(base))
    );
  }

  private setAnim(base: string, loop: boolean) {
    if (this.current === base) return;
    this.animGroups.forEach((g) => g.stop());
    const g = this.findAnim(base);
    if (g) g.start(loop, 1.0, g.from, g.to, false);
    this.current = base;
  }

  update(
    dt: number,
    worldMove: Vector3,
    target: Vector3 | null,
    bullets: BulletPool,
    onFire: () => void,
  ) {
    // Flash fade regardless of state
    const fm = this.flash.material as StandardMaterial;
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      fm.alpha = Math.max(0, this.flashLife / 0.06);
      this.flash.scaling.setAll(1 + (1 - fm.alpha) * 0.6);
    }

    if (!this.ready || this.dead) {
      this.root.position.set(this.pos.x, this.rootYOffset, this.pos.z);
      return;
    }

    const moving = worldMove.lengthSquared() > 0.001;
    if (moving) {
      this.pos.addInPlace(worldMove.scale(MOVE_SPEED * dt));
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > ARENA_RADIUS) {
        this.pos.x = (this.pos.x / r) * ARENA_RADIUS;
        this.pos.z = (this.pos.z / r) * ARENA_RADIUS;
      }
    }

    // Aim/facing: face the target when there is one, otherwise face movement.
    let aim: Vector3 | null = null;
    if (target) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= AIM_RANGE) aim = new Vector3(dx / dist, 0, dz / dist);
    }
    const faceVec = aim ?? (moving ? worldMove : null);
    if (faceVec) {
      const desired = Math.atan2(faceVec.x, faceVec.z) + HERO_FACING_OFFSET;
      this.heading = lerpAngle(this.heading, desired, TURN_LERP * dt);
    }

    this.root.position.set(this.pos.x, this.rootYOffset, this.pos.z);
    this.root.rotation.y = this.heading;

    // Animation state machine
    if (moving && aim) this.setAnim("Run_and_Shoot", true);
    else if (moving) this.setAnim("Running", true);
    else if (aim) this.setAnim("Alert", true);
    else this.setAnim("Idle_5", true);

    // Fire buckshot
    this.fireTimer -= dt;
    if (aim && this.fireTimer <= 0) {
      this.fireTimer = FIRE_INTERVAL;
      const fwd = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      const origin = new Vector3(
        this.pos.x + fwd.x * MUZZLE_FORWARD,
        MUZZLE_HEIGHT,
        this.pos.z + fwd.z * MUZZLE_FORWARD,
      );
      const baseAngle = Math.atan2(aim.x, aim.z);
      for (let i = 0; i < PELLETS; i++) {
        const a = baseAngle + (Math.random() - 0.5) * SPREAD * 2;
        bullets.spawn(origin, new Vector3(Math.sin(a), 0, Math.cos(a)));
      }
      // Muzzle flash
      this.flash.position.set(origin.x + fwd.x * 0.3, origin.y, origin.z + fwd.z * 0.3);
      fm.alpha = 1;
      this.flashLife = 0.06;
      onFire();
    }
  }

  dispose() {
    this.root.dispose();
    this.flash.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

export { ARENA_RADIUS };
