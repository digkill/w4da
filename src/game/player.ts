import {
  Scene,
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
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
import ukaUrl from "../assets/Una.glb?url";
import valeraUrl from "../assets/Valera.glb?url";
import shotgunUrl from "../assets/shotgun.glb?url";
import pistolUrl from "../assets/desert_eagle.glb?url";
import lmgUrl from "../assets/lmg.glb?url";
import cyberKatanaUrl from "../assets/cyber_katana.glb?url";
import muzzleUrl from "../assets/machine_gun_muzzle_flash_test_effect.glb?url";
import { makeSfxPool, playSfx } from "./sfx";
import deagleSfxUrl from "../assets/audio/deagle.mp3?url";
import shotgunSfxUrl from "../assets/audio/quick-reload-cutoff.mp3?url";
import type { HeroId } from "@/data/heroes";

const ANIM_IDLE = "Idle_8";
const ANIM_RUN = "Running";
const ANIM_SHOOT = "Walk_Forward_While_Shooting";
const ANIM_DEATH = "dying_backwards";
const ANIM_CAST = "Skill_01"; // ultimate channel

type AnimRole =
  | "idle"
  | "move"
  | "moveCombat"
  | "ranged"
  | "melee"
  | "cast"
  | "death"
  | "spawn"
  | "block"
  | "emote";

type AnimationMap = Partial<Record<AnimRole, string[]>>;

interface PlayerConfig {
  id: HeroId;
  modelUrl: string;
  height: number;
  weaponMode: "hunter" | "uka" | "lmg";
  animations: AnimationMap;
}

const HERO_ANIMATION_CLIPS: Record<HeroId, string[]> = {
  wanhells: [
    "360_Power_Spin_Jump",
    "Agree_Gesture",
    "Alert",
    "Crouch_Walk_with_Torch",
    "Dead",
    "Double_kick_forward",
    "Idle_8",
    "Lower_Weapon_Look_Raise",
    "Running",
    "Skill_01",
    "Skill_02",
    "Skill_03",
    "Two_Handed_Parry",
    "Walk_Forward_While_Shooting",
    "Walk_Forward_with_Bow_Aimed",
    "Walking",
    "dying_backwards",
    "run_fast_10_inplace",
    "run_fast_4",
    "ymca_dance",
  ],
  uka: [
    "Attack",
    "Axe_Breathe_and_Look_Around",
    "Axe_Spin_Attack",
    "Block3",
    "Fall_Dead_from_Abdominal_Injury",
    "Idle_3",
    "Jump_Over_Obstacle_2",
    "Reaping_Swing",
    "Running",
    "Skill_02",
    "Walk_Fight_Forward",
    "Walk_Forward_with_Bow_Aimed",
    "Walking_Woman",
    "Walking",
    "Wave_for_Help_2",
    "mage_soell_cast_3",
    "mage_soell_cast_5",
    "mage_soell_cast_7",
  ],
  valera: [
    "Agree_Gesture",
    "Block3",
    "Boxing_Guard_Right_Straight_Kick",
    "Breakdance_1990",
    "Charged_Ground_Slam",
    "Dead",
    "Elbow_Strike",
    "Female_Throwing_Stance_Charge",
    "Idle_10",
    "Punch_Combo_2",
    "Punch_Combo",
    "Running",
    "Skill_01",
    "Skill_02",
    "Walking",
  ],
};

const PLAYER_CONFIGS: Record<HeroId, PlayerConfig> = {
  wanhells: {
    id: "wanhells",
    modelUrl: heroUrl,
    height: 4.05,
    weaponMode: "hunter",
    animations: {
      idle: [ANIM_IDLE, "Alert"],
      move: [ANIM_RUN, "run_fast_4", "Walking"],
      moveCombat: [ANIM_SHOOT, "Walk_Forward_with_Bow_Aimed", "Crouch_Walk_with_Torch"],
      ranged: ["Lower_Weapon_Look_Raise", ANIM_SHOOT],
      melee: ["Double_kick_forward", "360_Power_Spin_Jump"],
      cast: [ANIM_CAST, "Skill_02", "Skill_03"],
      death: [ANIM_DEATH, "Dead"],
      spawn: ["Alert", "Agree_Gesture"],
      block: ["Two_Handed_Parry"],
      emote: ["ymca_dance", "Agree_Gesture"],
    },
  },
  uka: {
    id: "uka",
    modelUrl: ukaUrl,
    height: 4.05,
    weaponMode: "uka",
    animations: {
      idle: ["Idle_3", "Axe_Breathe_and_Look_Around"],
      move: ["Running", "Walking_Woman", "Walking"],
      moveCombat: ["Walk_Fight_Forward", "Walk_Forward_with_Bow_Aimed"],
      ranged: ["Walk_Forward_with_Bow_Aimed"],
      melee: ["Attack", "Reaping_Swing", "Axe_Spin_Attack"],
      cast: ["Skill_02", "mage_soell_cast_3", "mage_soell_cast_5", "mage_soell_cast_7"],
      death: ["Fall_Dead_from_Abdominal_Injury"],
      spawn: ["Wave_for_Help_2"],
      block: ["Block3"],
    },
  },
  valera: {
    id: "valera",
    modelUrl: valeraUrl,
    height: 4.15,
    weaponMode: "lmg",
    animations: {
      idle: ["Idle_10"],
      move: ["Running", "Walking"],
      moveCombat: ["Running", "Walking"],
      ranged: ["Female_Throwing_Stance_Charge", "Skill_01"],
      melee: ["Punch_Combo", "Punch_Combo_2", "Elbow_Strike", "Boxing_Guard_Right_Straight_Kick"],
      cast: ["Charged_Ground_Slam", "Skill_02"],
      death: ["Dead"],
      spawn: ["Agree_Gesture"],
      block: ["Block3"],
      emote: ["Breakdance_1990", "Agree_Gesture"],
    },
  },
};

const ARENA_RADIUS = 88;
const MOVE_SPEED = 8.5;
const TURN_LERP = 12;

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

// --- Uka: katana cleave + sniper rifle ---
const KATANA_RANGE = 6.0;
const KATANA_RADIUS = 3.8;
const KATANA_DMG = 95;
const KATANA_INTERVAL = 0.58;
const KATANA_FORWARD = 2.6;
const SNIPER_RANGE = 58;
const SNIPER_DMG = 175;
const SNIPER_SPREAD = 0.004;
const SNIPER_BULLET_SPEED = 84;
const SNIPER_BULLET_LIFE = 0.86;
const SNIPER_FIRE_INTERVAL = 1.15;

// --- Valera: light machine gun, sustained automatic fire ---
const LMG_RANGE = 38;
const LMG_DMG = 15;
const LMG_SPREAD = 0.075;
const LMG_BULLET_SPEED = 58;
const LMG_BULLET_LIFE = 0.72;
const LMG_FIRE_INTERVAL = 0.09;
const LMG_SCALE = 2.65;

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

const KATANA_GRIP = new Vector3(0.1, -0.12, 0.72);
const CYBER_KATANA_SCALE = 3.5;
const SNIPER_GRIP = new Vector3(-0.16, 0.04, 0.42);
const LMG_GRIP = new Vector3(0.02, -0.04, 0.82);
const LMG_POS = new Vector3(0.45, 2.05, 0.7);

export class Player {
  readonly root: TransformNode;
  private scene: Scene;
  readonly pos: Vector3;
  private heroId: HeroId = "wanhells";
  private config: PlayerConfig = PLAYER_CONFIGS.wanhells;
  private loadSeq = 0;
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
  private actionLockT = 0;
  private castTimer = 0;
  private glow: GlowLayer | null = null;
  private sgFlash: TransformNode | null = null;
  private pistolFlash: TransformNode | null = null;
  private sgFlashT = 0;
  private pistolFlashT = 0;
  private slashFx: Mesh | null = null;
  private slashFxT = 0;
  private pistolSfx = makeSfxPool(deagleSfxUrl, 4, 0.4);
  private shotgunSfx = makeSfxPool(shotgunSfxUrl, 3, 0.45);
  // Weapons follow their hand bones each frame.
  private gunRoot: TransformNode | null = null;
  private handBone: Bone | null = null;
  private pistolRoot: TransformNode | null = null;
  private leftBone: Bone | null = null;
  private skinned: Mesh | null = null;
  private heroScale = 1;
  private rightGrip = SHOTGUN_GRIP.clone();
  private leftGrip = PISTOL_GRIP.clone();

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

  setHero(heroId: HeroId) {
    if (this.heroId === heroId) return;
    this.heroId = heroId;
    this.config = PLAYER_CONFIGS[heroId];
    this.resetCombat();
    this.disposeLoadout();
    this.load();
  }

  private resetCombat() {
    this.fireTimer = 0;
    this.pistolTimer = 0;
    this.pistolAmmo = PISTOL_MAG;
    this.pistolReloadTimer = 0;
    this.shootHold = 0;
    this.actionLockT = 0;
    this.castTimer = 0;
    this.sgFlashT = 0;
    this.pistolFlashT = 0;
    this.slashFxT = 0;
  }

  private disposeLoadout() {
    this.ready = false;
    this.animGroups.forEach((g) => g.stop());
    this.animGroups = [];
    this.current = "";
    this.handBone = null;
    this.leftBone = null;
    this.skinned = null;
    this.gunRoot = null;
    this.pistolRoot = null;
    this.sgFlash?.dispose();
    this.pistolFlash?.dispose();
    this.slashFx?.dispose();
    this.sgFlash = null;
    this.pistolFlash = null;
    this.slashFx = null;
    this.root.getChildren().forEach((n) => n.dispose());
  }

  private async load() {
    const seq = ++this.loadSeq;
    const config = this.config;
    try {
      // Hero
      const hero = await SceneLoader.LoadAssetContainerAsync(config.modelUrl, "", this.scene, null, ".glb");
      if (seq !== this.loadSeq) {
        hero.dispose();
        return;
      }
      const inst = hero.instantiateModelsToScene((n) => n, false);
      const model = inst.rootNodes[0] as TransformNode;
      const b = model.getHierarchyBoundingVectors(true);
      const h = b.max.y - b.min.y || 1;
      const scale = config.height / h;
      model.parent = this.root;
      this.root.scaling.setAll(scale);
      // feet on the ground
      this.rootYOffset = -b.min.y * scale;

      this.animGroups = inst.animationGroups;
      this.animGroups.forEach((g) => g.stop());
      this.heroScale = scale;
      this.reportAnimationScan(config);

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

      await this.loadWeapons(config, scale, seq);
      if (seq !== this.loadSeq) return;

      // Muzzle-flash effect (GLB) — a world-space node placed at the barrel tip
      // on each shot. Two copies: shotgun + pistol.
      const flashC = await SceneLoader.LoadAssetContainerAsync(muzzleUrl, "", this.scene, null, ".glb");
      if (seq !== this.loadSeq) {
        flashC.dispose();
        return;
      }
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
      this.slashFx = createSlashFx(this.scene);

      this.ready = true;
      if (!this.startAction("spawn", 0.7, false, false)) this.playRole("idle", true);
    } catch (e) {
      console.warn("[W4DA] hero/weapons failed to load:", e);
    }
  }

  private reportAnimationScan(config: PlayerConfig) {
    const actual = new Set(this.animGroups.map((g) => g.name.replace(/_\d+$/, "")));
    const expected = HERO_ANIMATION_CLIPS[config.id];
    const missingFromScan = expected.filter((name) => !actual.has(name));
    if (missingFromScan.length) {
      console.debug("[W4DA] animation scan mismatch:", config.id, missingFromScan);
    }
  }

  private async loadWeapons(config: PlayerConfig, scale: number, seq: number) {
    if (config.weaponMode === "hunter") {
      this.rightGrip = SHOTGUN_GRIP.clone();
      this.leftGrip = PISTOL_GRIP.clone();

      // Shotgun (static mesh) — held in the hero's right hand, parented to the
      // body (reliable + always visible; bone-attach left it invisible).
      const gun = await SceneLoader.LoadAssetContainerAsync(shotgunUrl, "", this.scene, null, ".glb");
      if (seq !== this.loadSeq) {
        gun.dispose();
        return;
      }
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
      if (seq !== this.loadSeq) {
        pistol.dispose();
        return;
      }
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
      return;
    }

    if (config.weaponMode === "lmg") {
      this.rightGrip = LMG_GRIP.clone();
      this.leftGrip = new Vector3(0, 0, 0);

      const gun = await SceneLoader.LoadAssetContainerAsync(lmgUrl, "", this.scene, null, ".glb");
      if (seq !== this.loadSeq) {
        gun.dispose();
        return;
      }
      const gunInst = gun.instantiateModelsToScene((n) => n, false);
      const gunRoot = gunInst.rootNodes[0] as TransformNode;
      const gb = gunRoot.getHierarchyBoundingVectors(true);
      const gunH = Math.max(gb.max.x - gb.min.x, gb.max.y - gb.min.y, gb.max.z - gb.min.z) || 1;
      gunRoot.parent = this.root;
      gunRoot.scaling.setAll(LMG_SCALE / gunH / scale);
      gunRoot.position.set(LMG_POS.x / scale, LMG_POS.y / scale, LMG_POS.z / scale);
      gunRoot.rotation.set(0, 0, 0);
      this.gunRoot = gunRoot;
      this.hardenWeapon(gunRoot);
      return;
    }

    this.rightGrip = KATANA_GRIP.clone();
    this.leftGrip = SNIPER_GRIP.clone();

    const katana = await SceneLoader.LoadAssetContainerAsync(cyberKatanaUrl, "", this.scene, null, ".glb");
    if (seq !== this.loadSeq) {
      katana.dispose();
      return;
    }
    const katanaInst = katana.instantiateModelsToScene((n) => n, false);
    const katanaModel = katanaInst.rootNodes[0] as TransformNode;
    const kb = katanaModel.getHierarchyBoundingVectors(true);
    const katanaH = Math.max(kb.max.x - kb.min.x, kb.max.y - kb.min.y, kb.max.z - kb.min.z) || 1;
    const center = kb.min.add(kb.max).scale(0.5);
    const katanaRoot = new TransformNode("ukaCyberKatana", this.scene);
    katanaModel.parent = katanaRoot;
    katanaModel.position.subtractInPlace(center);
    katanaRoot.parent = this.root;
    katanaRoot.scaling.setAll(CYBER_KATANA_SCALE / katanaH / scale);
    katanaRoot.position.set(0.55 / scale, 2.0 / scale, 0.72 / scale);
    katanaRoot.rotation.set(0.25, 0, -0.12);
    this.gunRoot = katanaRoot;
    this.tintCyberKatana(katanaRoot);
    this.hardenWeapon(katanaRoot);

    const sniperRoot = createSniper(this.scene);
    sniperRoot.parent = this.root;
    sniperRoot.scaling.setAll(1 / scale);
    sniperRoot.position.set(-0.38 / scale, 2.0 / scale, 0.48 / scale);
    sniperRoot.rotation.set(-0.03, 0, 0.06);
    this.pistolRoot = sniperRoot;
    this.hardenWeapon(sniperRoot);
  }

  get position() {
    return this.pos;
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.dead = false;
    this.resetCombat();
    if (this.ready && !this.startAction("spawn", 0.7, false, false)) this.playRole("idle", true);
  }

  setDead() {
    if (!this.ready || this.dead) return;
    this.dead = true;
    this.playRole("death", false, true);
  }

  /** Lock the hero into the skill/cast animation for `duration` seconds. */
  startCast(duration: number) {
    this.castTimer = duration;
    if (this.ready) this.playRole("cast", true, true);
  }

  get casting() {
    return this.castTimer > 0;
  }

  playHitReaction() {
    if (!this.ready || this.dead || this.casting) return;
    this.startAction("block", 0.35, false, false);
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

  private tintCyberKatana(root: TransformNode) {
    const redMaterial = new StandardMaterial("ukaCyberKatanaRedMat", this.scene);
    redMaterial.diffuseColor = Color3.FromHexString("#ff1738");
    redMaterial.emissiveColor = Color3.FromHexString("#ff002b");
    redMaterial.specularColor = Color3.FromHexString("#ffb1bc");
    redMaterial.disableLighting = true;
    redMaterial.maxSimultaneousLights = 8;

    const darkMaterial = new StandardMaterial("ukaCyberKatanaDarkMat", this.scene);
    darkMaterial.diffuseColor = Color3.FromHexString("#18070c");
    darkMaterial.emissiveColor = Color3.FromHexString("#5c0011");
    darkMaterial.specularColor = Color3.FromHexString("#ff7285");
    darkMaterial.maxSimultaneousLights = 8;

    root.getChildMeshes().forEach((mesh, index) => {
      mesh.material = index % 3 === 0 ? darkMaterial : redMaterial;
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
        l.x + this.rightGrip.x / this.heroScale,
        l.y + this.rightGrip.y / this.heroScale,
        l.z + this.rightGrip.z / this.heroScale,
      );
    }
    if (this.pistolRoot && this.leftBone) {
      const w = this.leftBone.getAbsolutePosition(this.skinned);
      const l = Vector3.TransformCoordinates(w, inv);
      this.pistolRoot.position.set(
        l.x + this.leftGrip.x / this.heroScale,
        l.y + this.leftGrip.y / this.heroScale,
        l.z + this.leftGrip.z / this.heroScale,
      );
    }
  }

  private findAnim(base: string): AnimationGroup | undefined {
    return (
      this.animGroups.find((g) => g.name === base) ??
      this.animGroups.find((g) => g.name.includes(base))
    );
  }

  private resolveAnim(role: AnimRole, allowIdleFallback = true): string | null {
    const candidates = this.config.animations[role] ?? [];
    for (const name of candidates) {
      if (this.findAnim(name)) return name;
    }
    if (!allowIdleFallback || role === "idle") return null;
    const idle = this.config.animations.idle ?? [];
    for (const name of idle) {
      if (this.findAnim(name)) return name;
    }
    return null;
  }

  private playRole(role: AnimRole, loop: boolean, restart = false, allowIdleFallback = true) {
    const name = this.resolveAnim(role, allowIdleFallback);
    if (!name) return false;
    this.setAnim(name, loop, restart);
    return true;
  }

  private startAction(role: AnimRole, duration: number, loop: boolean, allowIdleFallback = true) {
    if (!this.playRole(role, loop, true, allowIdleFallback)) return false;
    this.actionLockT = Math.max(this.actionLockT, duration);
    return true;
  }

  private setAnim(base: string, loop: boolean, restart = false) {
    if (!restart && this.current === base) return;
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
    damageArea?: (point: Vector3, radius: number, dmg: number) => void,
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
    if (this.slashFxT > 0) {
      this.slashFxT -= dt;
      if (this.slashFx) {
        this.slashFx.visibility = Math.max(0, this.slashFxT / 0.18);
        if (this.slashFxT <= 0) this.slashFx.isVisible = false;
      }
    }
    if (this.actionLockT > 0) this.actionLockT = Math.max(0, this.actionLockT - dt);

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
      this.playRole("cast", true);
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
      const aimRange =
        this.config.weaponMode === "uka"
          ? SNIPER_RANGE
          : this.config.weaponMode === "lmg"
            ? LMG_RANGE
            : AIM_RANGE;
      if (dist <= aimRange) {
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

    const fwd = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const baseAngle = aim ? Math.atan2(aim.x, aim.z) : 0;

    if (this.config.weaponMode === "uka") {
      this.updateUkaCombat(dt, aim, aimDist, baseAngle, fwd, bullets, damageArea);
    } else if (this.config.weaponMode === "lmg") {
      this.updateLmgCombat(dt, aim, aimDist, baseAngle, fwd, bullets);
    } else {
      this.updateHunterCombat(dt, aim, aimDist, baseAngle, fwd, bullets);
    }

    this.updateBaseAnimation(dt, moving);
  }

  private updateBaseAnimation(dt: number, moving: boolean) {
    if (this.shootHold > 0) this.shootHold = Math.max(0, this.shootHold - dt);
    if (this.actionLockT > 0) return;

    if (this.shootHold > 0) {
      this.playRole(moving ? "moveCombat" : "ranged", true);
    } else if (moving) {
      this.playRole("move", true);
    } else {
      this.playRole("idle", true);
    }
  }

  private updateHunterCombat(
    dt: number,
    aim: Vector3 | null,
    aimDist: number,
    baseAngle: number,
    fwd: Vector3,
    bullets: BulletPool,
  ) {
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
      if (this.pistolAmmo <= 0) this.pistolReloadTimer = PISTOL_RELOAD; // empty -> reload
    }
  }

  private updateLmgCombat(
    dt: number,
    aim: Vector3 | null,
    aimDist: number,
    baseAngle: number,
    fwd: Vector3,
    bullets: BulletPool,
  ) {
    this.fireTimer -= dt;
    if (!aim || aimDist > LMG_RANGE || this.fireTimer > 0) return;

    this.fireTimer = LMG_FIRE_INTERVAL;
    const origin = new Vector3(
      this.pos.x + fwd.x * MUZZLE_FORWARD,
      MUZZLE_HEIGHT,
      this.pos.z + fwd.z * MUZZLE_FORWARD,
    );
    const a = baseAngle + (Math.random() - 0.5) * LMG_SPREAD * 2;
    bullets.spawn(
      origin,
      new Vector3(Math.sin(a), 0, Math.cos(a)),
      LMG_DMG,
      LMG_BULLET_SPEED,
      LMG_BULLET_LIFE,
    );
    this.shootHold = LMG_FIRE_INTERVAL + 0.08;
    this.showFlash(this.sgFlash, origin.add(new Vector3(fwd.x * 0.9, 0, fwd.z * 0.9)));
    this.sgFlashT = 0.04;
    playSfx(this.pistolSfx);
  }

  private updateUkaCombat(
    dt: number,
    aim: Vector3 | null,
    aimDist: number,
    baseAngle: number,
    fwd: Vector3,
    bullets: BulletPool,
    damageArea?: (point: Vector3, radius: number, dmg: number) => void,
  ) {
    this.fireTimer -= dt;
    if (aim && aimDist <= KATANA_RANGE && this.fireTimer <= 0) {
      this.fireTimer = KATANA_INTERVAL;
      const center = new Vector3(
        this.pos.x + fwd.x * KATANA_FORWARD,
        1.0,
        this.pos.z + fwd.z * KATANA_FORWARD,
      );
      damageArea?.(center, KATANA_RADIUS, KATANA_DMG);
      this.shootHold = KATANA_INTERVAL + 0.12;
      this.startAction("melee", KATANA_INTERVAL, false);
      this.showSlash(center);
      playSfx(this.shotgunSfx);
    }

    this.pistolTimer -= dt;
    if (aim && aimDist <= SNIPER_RANGE && this.pistolTimer <= 0) {
      this.pistolTimer = SNIPER_FIRE_INTERVAL;
      const lx = this.pos.x + fwd.x * MUZZLE_FORWARD;
      const lz = this.pos.z + fwd.z * MUZZLE_FORWARD;
      const a = baseAngle + (Math.random() - 0.5) * SNIPER_SPREAD * 2;
      bullets.spawn(
        new Vector3(lx, MUZZLE_HEIGHT, lz),
        new Vector3(Math.sin(a), 0, Math.cos(a)),
        SNIPER_DMG,
        SNIPER_BULLET_SPEED,
        SNIPER_BULLET_LIFE,
      );
      if (this.shootHold <= 0) this.shootHold = SNIPER_FIRE_INTERVAL * 0.5;
      this.showFlash(this.pistolFlash, new Vector3(lx, MUZZLE_HEIGHT, lz));
      this.pistolFlashT = 0.08;
      playSfx(this.pistolSfx);
    }
  }

  private showSlash(pos: Vector3) {
    if (!this.slashFx) return;
    this.slashFx.position.copyFrom(pos);
    this.slashFx.rotation.y = this.heading;
    this.slashFx.visibility = 1;
    this.slashFx.isVisible = true;
    this.slashFxT = 0.18;
  }

  dispose() {
    this.root.dispose();
    this.sgFlash?.dispose();
    this.pistolFlash?.dispose();
    this.slashFx?.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

function weaponMat(scene: Scene, name: string, color: string, emissive?: string) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(color);
  m.specularColor = new Color3(0.35, 0.35, 0.35);
  if (emissive) m.emissiveColor = Color3.FromHexString(emissive);
  m.maxSimultaneousLights = 8;
  return m;
}

function createSniper(scene: Scene): TransformNode {
  const root = new TransformNode("ukaSniper", scene);
  const metal = weaponMat(scene, "ukaSniperMetalMat", "#10141b");
  const trim = weaponMat(scene, "ukaSniperTrimMat", "#334353");
  const lens = weaponMat(scene, "ukaSniperLensMat", "#60d5ff", "#0f5066");

  const body = MeshBuilder.CreateBox("ukaSniperBody", { width: 0.26, height: 0.22, depth: 1.2 }, scene);
  body.material = metal;
  body.position.set(0, 0, 0.2);
  body.parent = root;

  const barrel = MeshBuilder.CreateCylinder("ukaSniperBarrel", { diameter: 0.08, height: 1.8, tessellation: 10 }, scene);
  barrel.material = metal;
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 1.55);
  barrel.parent = root;

  const stock = MeshBuilder.CreateBox("ukaSniperStock", { width: 0.34, height: 0.24, depth: 0.6 }, scene);
  stock.material = trim;
  stock.position.set(0, -0.02, -0.64);
  stock.parent = root;

  const scope = MeshBuilder.CreateCylinder("ukaSniperScope", { diameter: 0.16, height: 0.76, tessellation: 12 }, scene);
  scope.material = lens;
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.24, 0.26);
  scope.parent = root;

  const mag = MeshBuilder.CreateBox("ukaSniperMag", { width: 0.18, height: 0.44, depth: 0.16 }, scene);
  mag.material = trim;
  mag.position.set(0, -0.32, 0.12);
  mag.parent = root;

  return root;
}

function createSlashFx(scene: Scene): Mesh {
  const slash = MeshBuilder.CreateTorus(
    "ukaSlashFx",
    { diameter: KATANA_RADIUS * 1.75, thickness: 0.08, tessellation: 48 },
    scene,
  );
  const m = weaponMat(scene, "ukaSlashFxMat", "#8ff1ff", "#60e6ff");
  m.alpha = 0.62;
  slash.material = m;
  slash.rotation.x = Math.PI / 2;
  slash.scaling.z = 0.22;
  slash.isPickable = false;
  slash.isVisible = false;
  return slash;
}

export { ARENA_RADIUS };
