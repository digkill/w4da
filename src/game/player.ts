import {
  Scene,
  Vector3,
  Mesh,
  Matrix,
  TransformNode,
  SceneLoader,
  AnimationGroup,
  type Bone,
  type GlowLayer,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { buildBlobShadow } from "./factory";
import { BulletPool } from "./bullets";
import heroUrl from "../assets/hero_hellsing.glb?url";
import shotgunUrl from "../assets/shotgun.glb?url";
import pistolUrl from "../assets/desert_eagle.glb?url";
import muzzleUrl from "../assets/machine_gun_muzzle_flash_test_effect.glb?url";
import { makeSfxPool, playSfx } from "./sfx";
import deagleSfxUrl from "../assets/audio/deagle.mp3?url";
import shotgunSfxUrl from "../assets/audio/quick-reload-cutoff.mp3?url";

// Animation clip names in hero_hellsing.glb (20 clips available):
// 360_Power_Spin_Jump, Agree_Gesture, Alert, Crouch_Walk_with_Torch, Dead,
// Double_kick_forward, Idle_8, Lower_Weapon_Look_Raise, Running, Skill_01..03,
// Two_Handed_Parry, Walk_Forward_While_Shooting, Walk_Forward_with_Bow_Aimed,
// Walking, dying_backwards, run_fast_10_inplace, run_fast_4, ymca_dance.
const ANIM_IDLE = "Idle_8";
const ANIM_RUN = "Running";
const ANIM_SHOOT = "Walk_Forward_While_Shooting";
const ANIM_DEATH = "dying_backwards";
const ANIM_CAST = "Skill_01"; // ultimate channel

const ARENA_RADIUS = 88;
const MOVE_SPEED = 8.5;
const TURN_LERP = 12;
const HERO_HEIGHT = 4.05; // 2.7 × 1.5

// --- Shotgun: short range, wide spread, heavy area damage, fast pellets, 0.5s reload ---
const FIRE_INTERVAL = 0.5; // reload between blasts
const PELLETS = 10; // buckshot
const SPREAD = 0.45; // wide cone half-angle (rad)
const SHOTGUN_RANGE = 11; // short
const SHOTGUN_DMG = 22; // per pellet
const SHOTGUN_BULLET_SPEED = 62; // fast
const SHOTGUN_BULLET_LIFE = 0.24; // short-lived pellets

// --- Desert Eagle: long range, accurate, powerful; 7-round mag + 3s reload ---
const PISTOL_RANGE = 32; // long
const PISTOL_DMG = 40; // hard-hitting
const PISTOL_SPREAD = 0.015; // very accurate
const PISTOL_BULLET_SPEED = 46; // a bit slower than the shotgun
const PISTOL_BULLET_LIFE = 0.9; // long reach
const PISTOL_FIRE_INTERVAL = 0.32; // between rounds in the burst (slower)
const PISTOL_MAG = 7; // rounds per magazine
const PISTOL_RELOAD = 3.0; // seconds to reload

const AIM_RANGE = PISTOL_RANGE; // hero engages within the longer range

// --- Shotgun placement (tweak to taste) ---
const HERO_FACING_OFFSET = 0; // flip by Math.PI if the hero faces backwards
const SHOTGUN_ROT = new Vector3(0, 0, 0); // barrel points forward (away from hero)
const SHOTGUN_SCALE = 1.8; // -25% from 2.4
// Nudge (world units) from the right-hand bone: push forward along the barrel
// so the hand sits on the grip, not on the muzzle.
const SHOTGUN_GRIP = new Vector3(0, 0, 0.95);
// Fallback offset if the hand bone can't be found (parented to the body).
const SHOTGUN_POS = new Vector3(0.55, 2.15, 0.7);

// --- Desert Eagle in the LEFT hand ---
const PISTOL_SCALE = 1.1;
const PISTOL_ROT = new Vector3(0, Math.PI / 2, 0); // 90° turn
const PISTOL_GRIP = new Vector3(0, 0, 0.15);
const MUZZLE_HEIGHT = 2.1;
const MUZZLE_FORWARD = 1.4;

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
  private pistolTimer = 0;
  private pistolAmmo = PISTOL_MAG;
  private pistolReloadTimer = 0;
  private shootHold = 0;
  private castTimer = 0;
  private glow: GlowLayer | null = null;
  private sgFlash: TransformNode | null = null;
  private pistolFlash: TransformNode | null = null;
  private sgFlashT = 0;
  private pistolFlashT = 0;
  private pistolSfx = makeSfxPool(deagleSfxUrl, 4, 0.4);
  private shotgunSfx = makeSfxPool(shotgunSfxUrl, 3, 0.45);
  // Weapons follow their hand bones each frame.
  private gunRoot: TransformNode | null = null;
  private handBone: Bone | null = null;
  private pistolRoot: TransformNode | null = null;
  private leftBone: Bone | null = null;
  private skinned: Mesh | null = null;
  private heroScale = 1;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode("hero", scene);
    this.pos = new Vector3(0, 0, 0);
    this.load();
  }

  /** The scene glow layer — hero meshes are excluded so they never look ghostly. */
  setGlow(glow: GlowLayer) {
    this.glow = glow;
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
      this.heroScale = scale;

      // Hand bones + skinned mesh so the weapons can track the hands.
      const skel = inst.skeletons[0];
      this.handBone =
        skel?.bones.find((bn) => bn.name === "RightHand") ??
        skel?.bones.find((bn) => /right.*hand/i.test(bn.name)) ??
        null;
      this.leftBone =
        skel?.bones.find((bn) => bn.name === "LeftHand") ??
        skel?.bones.find((bn) => /left.*hand/i.test(bn.name)) ??
        null;
      this.skinned = (model.getChildMeshes().find((m) => !!m.skeleton) as Mesh) ?? null;

      // Force the hero fully opaque (some glTF materials import with alpha blend).
      model.getChildMeshes().forEach((m) => {
        m.visibility = 1;
        m.hasVertexAlpha = false;
        // Exclude from the glow layer so the hero never renders washed-out/ghostly.
        this.glow?.addExcludedMesh(m as Mesh);
        const mm = m.material as unknown as {
          alpha?: number;
          transparencyMode?: number | null;
          needDepthPrePass?: boolean;
          forceDepthWrite?: boolean;
          useAlphaFromAlbedoTexture?: boolean;
          albedoTexture?: { hasAlpha: boolean };
          diffuseTexture?: { hasAlpha: boolean };
        } | null;
        if (!mm) return;
        mm.alpha = 1;
        mm.transparencyMode = 0; // OPAQUE
        mm.needDepthPrePass = false;
        mm.forceDepthWrite = true;
        if ("useAlphaFromAlbedoTexture" in mm) mm.useAlphaFromAlbedoTexture = false;
        if (mm.albedoTexture) mm.albedoTexture.hasAlpha = false;
        if (mm.diffuseTexture) mm.diffuseTexture.hasAlpha = false;
      });

      // Ground blob shadow (counter-scaled so it stays a fixed world size)
      const shadow = buildBlobShadow(this.scene, 2.4 / scale);
      shadow.parent = this.root;
      shadow.position.y = (0.02 - this.rootYOffset) / scale; // world y ~0.02 (at feet)

      // Shotgun (static mesh) — held in the hero's right hand, parented to the
      // body (reliable + always visible; bone-attach left it invisible).
      const gun = await SceneLoader.LoadAssetContainerAsync(shotgunUrl, "", this.scene, null, ".glb");
      const gunInst = gun.instantiateModelsToScene((n) => n, false);
      const gunRoot = gunInst.rootNodes[0] as TransformNode;
      const gb = gunRoot.getHierarchyBoundingVectors(true);
      const gunH = Math.max(gb.max.x - gb.min.x, gb.max.y - gb.min.y, gb.max.z - gb.min.z) || 1;
      const gunWorldScale = SHOTGUN_SCALE / gunH; // normalize, then apply desired world size
      gunRoot.parent = this.root;
      gunRoot.scaling.setAll(gunWorldScale / scale);
      gunRoot.position.set(SHOTGUN_POS.x / scale, SHOTGUN_POS.y / scale, SHOTGUN_POS.z / scale);
      gunRoot.rotation = SHOTGUN_ROT.clone();
      this.gunRoot = gunRoot;
      this.hardenWeapon(gunRoot);

      // Desert Eagle (static mesh) — held in the hero's LEFT hand.
      const pistol = await SceneLoader.LoadAssetContainerAsync(pistolUrl, "", this.scene, null, ".glb");
      const pistolInst = pistol.instantiateModelsToScene((n) => n, false);
      const pistolRoot = pistolInst.rootNodes[0] as TransformNode;
      const pb = pistolRoot.getHierarchyBoundingVectors(true);
      const pistolH = Math.max(pb.max.x - pb.min.x, pb.max.y - pb.min.y, pb.max.z - pb.min.z) || 1;
      pistolRoot.parent = this.root;
      pistolRoot.scaling.setAll(PISTOL_SCALE / pistolH / scale);
      pistolRoot.position.set(-0.5 / scale, 2.0 / scale, 0.4 / scale);
      pistolRoot.rotation = PISTOL_ROT.clone();
      this.pistolRoot = pistolRoot;
      this.hardenWeapon(pistolRoot);

      // Muzzle-flash effect (GLB) — a world-space node placed at the barrel tip
      // on each shot. Two copies: shotgun + pistol.
      const flashC = await SceneLoader.LoadAssetContainerAsync(muzzleUrl, "", this.scene, null, ".glb");
      const mkFlash = (idx: number): TransformNode => {
        const fi = flashC.instantiateModelsToScene((n) => n + "_mf" + idx, false);
        const fr = fi.rootNodes[0] as TransformNode;
        const fb = fr.getHierarchyBoundingVectors(true);
        const fh = Math.max(fb.max.x - fb.min.x, fb.max.y - fb.min.y, fb.max.z - fb.min.z) || 1;
        fr.scaling.setAll(1.1 / fh); // ~1.1u flash
        fr.setEnabled(false);
        fr.getChildMeshes().forEach((m) => (m.isPickable = false));
        return fr;
      };
      this.sgFlash = mkFlash(0);
      this.pistolFlash = mkFlash(1);

      this.ready = true;
      this.setAnim(ANIM_IDLE, true);
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
    this.pistolTimer = 0;
    this.pistolAmmo = PISTOL_MAG;
    this.pistolReloadTimer = 0;
    this.castTimer = 0;
    if (this.ready) this.setAnim(ANIM_IDLE, true);
  }

  setDead() {
    if (!this.ready || this.dead) return;
    this.dead = true;
    this.setAnim(ANIM_DEATH, false);
  }

  /** Lock the hero into the skill/cast animation for `duration` seconds. */
  startCast(duration: number) {
    this.castTimer = duration;
    if (this.ready) this.setAnim(ANIM_CAST, true);
  }

  get casting() {
    return this.castTimer > 0;
  }

  private showFlash(node: TransformNode | null, pos: Vector3) {
    if (!node) return;
    node.position.copyFrom(pos);
    node.rotation.y = this.heading;
    node.setEnabled(true);
  }

  /** Force a weapon opaque and keep it out of the glow layer. */
  private hardenWeapon(root: TransformNode) {
    root.getChildMeshes().forEach((m) => {
      this.glow?.addExcludedMesh(m as Mesh);
      const gm = m.material as unknown as { alpha?: number; transparencyMode?: number | null } | null;
      if (gm) {
        gm.alpha = 1;
        gm.transparencyMode = 0;
      }
    });
  }

  /** Pin each weapon to its hand (wrist) bone every frame. */
  private followHand() {
    if (!this.skinned) return;
    this.root.computeWorldMatrix(true);
    const inv = Matrix.Invert(this.root.getWorldMatrix());
    if (this.gunRoot && this.handBone) {
      const w = this.handBone.getAbsolutePosition(this.skinned);
      const l = Vector3.TransformCoordinates(w, inv);
      this.gunRoot.position.set(
        l.x + SHOTGUN_GRIP.x / this.heroScale,
        l.y + SHOTGUN_GRIP.y / this.heroScale,
        l.z + SHOTGUN_GRIP.z / this.heroScale,
      );
    }
    if (this.pistolRoot && this.leftBone) {
      const w = this.leftBone.getAbsolutePosition(this.skinned);
      const l = Vector3.TransformCoordinates(w, inv);
      this.pistolRoot.position.set(
        l.x + PISTOL_GRIP.x / this.heroScale,
        l.y + PISTOL_GRIP.y / this.heroScale,
        l.z + PISTOL_GRIP.z / this.heroScale,
      );
    }
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
  ) {
    // Muzzle-flash effect fade (hide after a brief moment)
    if (this.sgFlashT > 0) {
      this.sgFlashT -= dt;
      if (this.sgFlashT <= 0) this.sgFlash?.setEnabled(false);
    }
    if (this.pistolFlashT > 0) {
      this.pistolFlashT -= dt;
      if (this.pistolFlashT <= 0) this.pistolFlash?.setEnabled(false);
    }

    if (!this.ready || this.dead) {
      this.root.position.set(this.pos.x, this.rootYOffset, this.pos.z);
      return;
    }

    // Ultimate channel: hero is locked into the cast animation, can't move/fire.
    if (this.castTimer > 0) {
      this.castTimer -= dt;
      this.root.position.set(this.pos.x, this.rootYOffset, this.pos.z);
      this.root.rotation.y = this.heading;
      this.followHand();
      this.setAnim(ANIM_CAST, true);
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
    let aimDist = Infinity;
    if (target) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= AIM_RANGE) {
        aim = new Vector3(dx / dist, 0, dz / dist);
        aimDist = dist;
      }
    }
    const faceVec = aim ?? (moving ? worldMove : null);
    if (faceVec) {
      const desired = Math.atan2(faceVec.x, faceVec.z) + HERO_FACING_OFFSET;
      this.heading = lerpAngle(this.heading, desired, TURN_LERP * dt);
    }

    this.root.position.set(this.pos.x, this.rootYOffset, this.pos.z);
    this.root.rotation.y = this.heading;
    this.followHand();

    // Animation state machine. Standing still always shows idle (even while
    // firing); the shooting clip only plays while actually moving.
    if (this.shootHold > 0) this.shootHold -= dt;
    if (!moving) {
      this.setAnim(ANIM_IDLE, true);
    } else if (this.shootHold > 0) {
      this.setAnim(ANIM_SHOOT, true);
    } else {
      this.setAnim(ANIM_RUN, true);
    }

    const fwd = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const baseAngle = aim ? Math.atan2(aim.x, aim.z) : 0;

    // Fire buckshot (shotgun, right hand) — only within its short range.
    this.fireTimer -= dt;
    if (aim && aimDist <= SHOTGUN_RANGE && this.fireTimer <= 0) {
      this.fireTimer = FIRE_INTERVAL;
      const origin = new Vector3(
        this.pos.x + fwd.x * MUZZLE_FORWARD,
        MUZZLE_HEIGHT,
        this.pos.z + fwd.z * MUZZLE_FORWARD,
      );
      for (let i = 0; i < PELLETS; i++) {
        const a = baseAngle + (Math.random() - 0.5) * SPREAD * 2;
        bullets.spawn(
          origin,
          new Vector3(Math.sin(a), 0, Math.cos(a)),
          SHOTGUN_DMG,
          SHOTGUN_BULLET_SPEED,
          SHOTGUN_BULLET_LIFE,
        );
      }
      this.shootHold = FIRE_INTERVAL + 0.08;
      this.setAnim(ANIM_SHOOT, true);
      this.showFlash(this.sgFlash, origin.add(new Vector3(fwd.x * 0.9, 0, fwd.z * 0.9)));
      this.sgFlashT = 0.06;
      playSfx(this.shotgunSfx);
    }

    // Desert Eagle (left hand) — long-range, accurate. 7-round mag + 3s reload.
    this.pistolTimer -= dt;
    if (this.pistolReloadTimer > 0) {
      this.pistolReloadTimer -= dt;
      if (this.pistolReloadTimer <= 0) this.pistolAmmo = PISTOL_MAG;
    } else if (aim && aimDist <= PISTOL_RANGE && this.pistolAmmo > 0 && this.pistolTimer <= 0) {
      this.pistolTimer = PISTOL_FIRE_INTERVAL;
      this.pistolAmmo--;
      // Muzzle is out in front of the hero (not behind).
      const lx = this.pos.x + fwd.x * MUZZLE_FORWARD;
      const lz = this.pos.z + fwd.z * MUZZLE_FORWARD;
      const a = baseAngle + (Math.random() - 0.5) * PISTOL_SPREAD * 2;
      bullets.spawn(
        new Vector3(lx, MUZZLE_HEIGHT, lz),
        new Vector3(Math.sin(a), 0, Math.cos(a)),
        PISTOL_DMG,
        PISTOL_BULLET_SPEED,
        PISTOL_BULLET_LIFE,
      );
      if (this.shootHold <= 0) this.shootHold = PISTOL_FIRE_INTERVAL + 0.05;
      this.showFlash(this.pistolFlash, new Vector3(lx, MUZZLE_HEIGHT, lz));
      this.pistolFlashT = 0.06;
      playSfx(this.pistolSfx);
      if (this.pistolAmmo <= 0) this.pistolReloadTimer = PISTOL_RELOAD; // empty → reload
    }
  }

  dispose() {
    this.root.dispose();
    this.sgFlash?.dispose();
    this.pistolFlash?.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

export { ARENA_RADIUS };
