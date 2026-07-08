import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  Matrix,
  FreeCamera,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  GlowLayer,
  PhotoDome,
  PointerEventTypes,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Texture,
  SceneLoader,
  TransformNode,
  type Mesh,
  type AssetContainer,
  type PointerInfo,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { Player, ARENA_RADIUS } from "./player";
import { ZombieManager } from "./zombies";
import { FireElemental } from "./summon";
import { MeteorStrike } from "./meteor";
import { BulletPool } from "./bullets";
import { InputManager } from "./input";
import { makeSfxPool, playSfx } from "./sfx";
import { mat } from "./factory";
import hissSfxUrl from "../assets/audio/hiss-of-an-aggressive-zombie.mp3?url";
import type {
  GameStats,
  StatsListener,
  GameStatus,
  BubbleListener,
  SpeechBubble,
  SpeakingBubble,
} from "./types";
import skyUrl from "../assets/skybox/textures/Stylized_FieldAtNight_Panorama_002.png?url";
import floorUrl from "../assets/floor_material.glb?url";

const MAX_HEALTH = 100;
const MAX_MANA = 100;
const MANA_REGEN = 9; // per second
const ULT_COST = 60; // mana to cast the Fire Elemental ultimate
const METEOR_COST = 40; // mana for the meteor strike
const ZERO_MOVE = new Vector3(0, 0, 0);
// Dota-2-style high-angle top-down follow camera.
const CAM_OFFSET = new Vector3(0, 27, 15);

export class Game {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private player: Player;
  private zombies: ZombieManager;
  private summon: FireElemental;
  private meteor: MeteorStrike;
  private bullets: BulletPool;
  private input: InputManager;
  private ground!: Mesh;
  private floorContainer: AssetContainer | null = null;
  private moveTarget: Vector3 | null = null;
  private pointerDown = false;
  private clickMarker!: Mesh; // green move arrow
  private targetMarker!: Mesh; // red arrow over a hovered mob
  private markerT = 0;
  private hoverPoint: Vector3 | null = null;
  private hissSfx = makeSfxPool(hissSfxUrl, 1, 0.6);

  private status: GameStatus = "menu";
  private health = MAX_HEALTH;
  private mana = MAX_MANA;
  private score = 0;
  private kills = 0;
  private timeSurvived = 0;
  private hurtFlash = 0;
  private deadTimer = 0;

  private listener?: StatsListener;
  private bubbleListener?: BubbleListener;
  private emitTimer = 0;

  private glow!: GlowLayer;
  private torch!: PointLight;
  private torchBase = 1.6;
  private flickerFires: { mesh: Mesh; light: PointLight; base: number }[] = [];
  private speakingBuf: SpeakingBubble[] = [];
  private lastBubbleCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: true,
    });
    this.scene = new Scene(this.engine);
    // Moonlit night mood.
    this.scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.04, 0.06, 0.12);
    this.scene.fogDensity = 0.008;

    this.camera = new FreeCamera("cam", CAM_OFFSET.clone(), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.fov = 0.85;
    this.camera.minZ = 1;
    this.camera.maxZ = 2000; // far enough to contain the skybox dome

    this.setupLights();
    this.buildWorld();
    this.loadFloor();

    // Emissive bloom for bullets, fire, muzzle flash and zombie eyes.
    this.glow = new GlowLayer("glow", this.scene, { blurKernelSize: 32 });
    this.glow.intensity = 0.65;

    this.bullets = new BulletPool(this.scene);
    this.player = new Player(this.scene);
    this.player.setGlow(this.glow);

    // Warm torch riding with the hero — lights up zombies as they close in.
    this.torch = new PointLight("torch", new Vector3(0, 2.6, 0), this.scene);
    this.torch.diffuse = Color3.FromHexString("#ffb15a");
    this.torch.intensity = this.torchBase;
    this.torch.range = 26;
    this.torch.parent = this.player.root;
    const events = {
      onPlayerHit: (dmg: number) => this.damagePlayer(dmg),
      onKill: (pts: number) => {
        this.score += pts;
        this.kills++;
      },
    };
    this.zombies = new ZombieManager(this.scene, events, this.glow);
    this.summon = new FireElemental(this.scene);
    this.meteor = new MeteorStrike(this.scene, this.glow);

    this.input = new InputManager();
    this.input.onPauseToggle = () => this.togglePause();
    this.input.onUltimate = () => this.triggerUltimate();
    this.input.onMeteor = () => this.triggerMeteor();
    this.setupPointerToMove();

    this.engine.runRenderLoop(() => this.frame());
    window.addEventListener("resize", this.onResize);
  }

  /** Dota-style click/hold-to-move: point on the ground and the hero rides there. */
  private setupPointerToMove() {
    this.scene.onPointerObservable.add((pi: PointerInfo) => {
      if (this.status !== "playing") return;
      const type = pi.type;
      if (type === PointerEventTypes.POINTERDOWN) {
        this.pointerDown = true;
        this.pickMove();
      } else if (type === PointerEventTypes.POINTERUP) {
        this.pointerDown = false;
      } else if (type === PointerEventTypes.POINTERMOVE) {
        if (this.pointerDown) this.pickMove();
        this.updateHoverPoint();
      }
    });
  }

  private pickMove() {
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.ground);
    if (pick?.hit && pick.pickedPoint) {
      const t = pick.pickedPoint;
      const r = Math.hypot(t.x, t.z);
      const clamp = r > ARENA_RADIUS ? ARENA_RADIUS / r : 1;
      this.moveTarget = new Vector3(t.x * clamp, 0, t.z * clamp);
      this.markerT = 0; // restart the ping pulse
    }
  }

  /** A downward-pointing arrow marker (Dota-style). */
  private makeArrow(name: string, hex: string): Mesh {
    const a = MeshBuilder.CreateCylinder(
      name,
      { diameterTop: 0, diameterBottom: 0.85, height: 1.3, tessellation: 4 },
      this.scene,
    );
    a.rotation.x = Math.PI; // tip points down at the ground
    const m = new StandardMaterial(name + "Mat", this.scene);
    m.emissiveColor = Color3.FromHexString(hex);
    m.diffuseColor = Color3.FromHexString(hex);
    m.disableLighting = true;
    a.material = m;
    a.isPickable = false;
    a.isVisible = false;
    return a;
  }

  private updateHoverPoint() {
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.ground);
    this.hoverPoint = pick?.hit && pick.pickedPoint ? pick.pickedPoint : null;
  }

  /** Green arrow at the move destination; red arrow over a hovered mob. */
  private updateMarker(dt: number) {
    this.markerT += dt;
    const bob = Math.abs(Math.sin(this.markerT * 4)) * 0.4;

    if (this.status === "playing" && this.moveTarget) {
      this.clickMarker.isVisible = true;
      this.clickMarker.position.set(this.moveTarget.x, 2.2 + bob, this.moveTarget.z);
      this.clickMarker.rotation.y += dt * 2.5;
    } else {
      this.clickMarker.isVisible = false;
    }

    // Red target arrow over the mob under the cursor.
    let mob: Vector3 | null = null;
    if (this.status === "playing" && this.hoverPoint) {
      const n = this.zombies.nearestTo(this.hoverPoint);
      if (n) {
        const dx = n.x - this.hoverPoint.x;
        const dz = n.z - this.hoverPoint.z;
        if (dx * dx + dz * dz < 9) mob = n;
      }
    }
    if (mob) {
      this.targetMarker.isVisible = true;
      this.targetMarker.position.set(mob.x, 5 + bob, mob.z);
      this.targetMarker.rotation.y += dt * 3;
    } else {
      this.targetMarker.isVisible = false;
    }
  }

  private setupLights() {
    // Cool ambient sky fill for a night scene.
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.5;
    hemi.diffuse = Color3.FromHexString("#93aee0");
    hemi.groundColor = Color3.FromHexString("#141a34");
    hemi.specular = Color3.FromHexString("#2a3a66");

    // The moon — cool blue-white key light, high and raking.
    const moon = new DirectionalLight("moon", new Vector3(-0.4, -0.9, 0.3), this.scene);
    moon.intensity = 1.45;
    moon.diffuse = Color3.FromHexString("#aecbff");
    moon.specular = Color3.FromHexString("#e8f0ff");
    moon.position = new Vector3(40, 70, -30);

    // Faint warm fill from the horizon (distant campfires) for contrast.
    const warm = new DirectionalLight("warm", new Vector3(0.5, -0.2, -0.6), this.scene);
    warm.intensity = 0.28;
    warm.diffuse = Color3.FromHexString("#ff9a4c");
    warm.specular = Color3.FromHexString("#ffb15a");
  }

  private buildWorld() {
    // Moonlit night panorama skybox (equirectangular photo dome).
    const dome = new PhotoDome(
      "sky",
      skyUrl,
      { resolution: 32, size: 900 },
      this.scene,
    );
    dome.mesh.isPickable = false;

    // Ground (pickable — Dota-style click-to-move raycasts against it).
    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 400, height: 400, subdivisions: 2 },
      this.scene,
    );
    const gm = new StandardMaterial("groundMat", this.scene);
    gm.diffuseColor = Color3.FromHexString("#141c1a");
    gm.specularColor = new Color3(0.04, 0.05, 0.08);
    ground.material = gm;
    ground.isPickable = true;
    this.ground = ground;

    // Arena ring
    const ring = MeshBuilder.CreateTorus(
      "ring",
      { diameter: ARENA_RADIUS * 2, thickness: 0.4, tessellation: 64 },
      this.scene,
    );
    // Muted, no emissive — a subtle boundary rather than a glowing beam.
    ring.material = mat(this.scene, "ringMat", "#3a3128");
    ring.position.y = 0.2;
    ring.isPickable = false;

    // Dota-style arrow markers: green for the move destination, red over a
    // hovered mob (target).
    this.clickMarker = this.makeArrow("moveArrow", "#43e06b");
    this.targetMarker = this.makeArrow("targetArrow", "#ff3a2a");

    // Scatter decor: tombstones, rocks, campfires
    const decor = new TransformNode("decor", this.scene);
    const stoneMat = mat(this.scene, "stoneMat", "#3d3d47");
    const woodMat = mat(this.scene, "woodMat", "#2a1c10");
    const fireMat = mat(this.scene, "fireMat", "#ff5a1e", { emissive: "#ff5a1e" });

    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * (ARENA_RADIUS - 14);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const kind = Math.random();
      if (kind < 0.5) {
        const s = MeshBuilder.CreateBox(
          "tomb" + i,
          { width: 1, height: 1.6 + Math.random(), depth: 0.35 },
          this.scene,
        );
        s.material = stoneMat;
        s.position.set(x, 0.8, z);
        s.rotation.y = Math.random() * Math.PI;
        s.rotation.z = (Math.random() - 0.5) * 0.3;
        s.parent = decor;
      } else if (kind < 0.8) {
        const rock = MeshBuilder.CreateIcoSphere(
          "rock" + i,
          { radius: 0.6 + Math.random() * 0.8, subdivisions: 1 },
          this.scene,
        );
        rock.material = stoneMat;
        rock.position.set(x, 0.4, z);
        rock.scaling.y = 0.6;
        rock.parent = decor;
      } else {
        const logs = MeshBuilder.CreateCylinder(
          "camp" + i,
          { diameter: 1.2, height: 0.3, tessellation: 6 },
          this.scene,
        );
        logs.material = woodMat;
        logs.position.set(x, 0.15, z);
        logs.parent = decor;
        const fire = MeshBuilder.CreateSphere("fire" + i, { diameter: 0.7 }, this.scene);
        fire.material = fireMat;
        fire.position.set(x, 0.5, z);
        fire.scaling.y = 1.4;
        fire.parent = decor;
        // Give the nearest few campfires a real flickering light.
        if (this.flickerFires.length < 4) {
          const fl = new PointLight("fireLight" + i, new Vector3(x, 1.2, z), this.scene);
          fl.diffuse = Color3.FromHexString("#ff6a1e");
          fl.specular = Color3.FromHexString("#ff8a3c");
          fl.intensity = 0.9;
          fl.range = 16;
          this.flickerFires.push({ mesh: fire, light: fl, base: 0.9 });
        }
      }
    }
    decor.getChildMeshes().forEach((m) => (m.isPickable = false));
  }

  /** Load the tiled PBR floor material from the GLB and apply it to the ground. */
  private async loadFloor() {
    try {
      const c = await SceneLoader.LoadAssetContainerAsync(floorUrl, "", this.scene, null, ".glb");
      this.floorContainer = c; // keep alive so material/textures aren't disposed
      const m = c.materials.find((x) => x instanceof PBRMaterial) as PBRMaterial | undefined;
      if (!m) return;
      const TILE = 42; // ground is 400u; repeat the tile densely
      [m.albedoTexture, m.metallicTexture, m.bumpTexture].forEach((t) => {
        if (t instanceof Texture) {
          t.uScale = TILE;
          t.vScale = TILE;
          t.wrapU = Texture.WRAP_ADDRESSMODE;
          t.wrapV = Texture.WRAP_ADDRESSMODE;
        }
      });
      m.maxSimultaneousLights = 8;
      m.environmentIntensity = 0.4;
      this.ground.material = m;
    } catch (e) {
      console.warn("[W4DA] floor material failed to load:", e);
    }
  }

  onStats(listener: StatsListener) {
    this.listener = listener;
    this.emit();
  }

  onBubbles(listener: BubbleListener) {
    this.bubbleListener = listener;
  }

  /** Call after the canvas changes size (e.g. entering/leaving fullscreen). */
  resize() {
    this.engine.resize();
  }

  start() {
    this.status = "playing";
    playSfx(this.hissSfx); // aggressive zombie hiss as the horde begins
    this.emit();
  }

  private resetState() {
    this.health = MAX_HEALTH;
    this.mana = MAX_MANA;
    this.score = 0;
    this.kills = 0;
    this.timeSurvived = 0;
    this.hurtFlash = 0;
    this.deadTimer = 0;
    this.moveTarget = null;
    this.pointerDown = false;
    this.player.reset();
    this.zombies.reset();
    this.summon.reset();
    this.meteor.reset();
  }

  restart() {
    this.resetState();
    this.status = "playing";
    playSfx(this.hissSfx);
    this.emit();
  }

  /** Called ~2s after death: clears the field and shows the start menu again. */
  returnToMenu() {
    this.resetState();
    this.status = "menu";
    this.emit();
  }

  /** Cast the Fire Elemental ultimate (mana-gated, one at a time). */
  triggerUltimate() {
    if (this.status !== "playing") return;
    if (this.mana < ULT_COST || !this.summon.canCast()) return;
    this.mana -= ULT_COST;
    this.summon.cast(this.player.position);
    this.player.startCast(2); // lock hero into the skill animation during the channel
    this.emit();
  }

  /** Meteor strike skill (mana-gated) — drops onto the nearest zombie / cursor. */
  triggerMeteor() {
    if (this.status !== "playing") return;
    if (this.mana < METEOR_COST || !this.meteor.canCast()) return;
    const point =
      this.zombies.nearestTo(this.player.position) ?? this.hoverPoint ?? this.player.position;
    this.mana -= METEOR_COST;
    this.meteor.cast(point);
    this.emit();
  }

  togglePause() {
    if (this.status === "playing") this.status = "paused";
    else if (this.status === "paused") this.status = "playing";
    this.emit();
  }

  private damagePlayer(dmg: number) {
    if (this.status !== "playing") return;
    this.health = Math.max(0, this.health - dmg);
    this.hurtFlash = 1;
    if (this.health <= 0) {
      this.status = "dead";
      this.deadTimer = 0;
      this.player.setDead();
      this.emit();
    }
  }

  private frame() {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);

    if (this.status === "playing") {
      this.timeSurvived += dt;

      // Movement: keyboard (WASD/arrows) takes priority; otherwise ride toward
      // the last Dota-style click point on the ground.
      const move2 = this.input.getDirection();
      const worldMove = new Vector3(0, 0, 0);
      if (move2.x !== 0 || move2.y !== 0) {
        this.moveTarget = null; // keyboard overrides click destination
        worldMove.set(-move2.x, 0, -move2.y); // left/right inverted per design
      } else if (this.moveTarget) {
        const dx = this.moveTarget.x - this.player.position.x;
        const dz = this.moveTarget.z - this.player.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.6) worldMove.set(dx / d, 0, dz / d);
        else this.moveTarget = null; // arrived
      }
      if (worldMove.lengthSquared() > 1) worldMove.normalize();

      this.mana = Math.min(MAX_MANA, this.mana + MANA_REGEN * dt);
      const target = this.zombies.nearestTo(this.player.position);
      this.player.update(dt, worldMove, target, this.bullets);

      this.bullets.update(dt);
      this.bullets.forEachActive((pos, dmg, kill) => {
        if (this.zombies.hitTest(pos, BulletPool.radius, dmg)) kill();
      });

      this.zombies.update(dt, this.player.position);
      this.summon.update(dt, this.player.position, this.zombies);
      this.meteor.update(dt, this.zombies);

      this.emitTimer += dt;
      if (this.emitTimer > 0.1) {
        this.emitTimer = 0;
        this.emit();
      }
    } else {
      // Menu / pause: keep the hero standing in idle (and grounded), no firing.
      this.player.update(dt, ZERO_MOVE, null, this.bullets);
    }

    if (this.status === "dead") {
      this.deadTimer += dt;
      if (this.deadTimer >= 2) this.returnToMenu();
    }

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.updateMarker(dt);
    this.flicker();
    this.updateCamera(dt);
    this.scene.render();
    this.emitBubbles();
  }

  /** Torch + campfire flicker so the lighting feels alive. */
  private flicker() {
    const now = performance.now() * 0.001;
    this.torch.intensity = this.torchBase * (0.82 + Math.sin(now * 20) * 0.05 + Math.random() * 0.14);
    for (const f of this.flickerFires) {
      const k = 0.7 + Math.sin(now * 12 + f.base) * 0.12 + Math.random() * 0.3;
      f.light.intensity = f.base * k;
      f.mesh.scaling.y = 1.4 * (0.85 + k * 0.25);
      f.mesh.scaling.x = f.mesh.scaling.z = 0.9 + k * 0.15;
    }
  }

  private emitBubbles() {
    if (!this.bubbleListener) return;
    this.zombies.getSpeaking(this.speakingBuf);
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const vp = this.camera.viewport.toGlobal(w, h);
    const bubbles: SpeechBubble[] = [];
    for (const s of this.speakingBuf) {
      const p = Vector3.Project(s.pos, Matrix.Identity(), this.scene.getTransformMatrix(), vp);
      if (p.z < 0 || p.z > 1) continue; // behind camera / clipped
      const nx = p.x / w;
      const ny = p.y / h;
      if (nx < -0.1 || nx > 1.1 || ny < -0.1 || ny > 1.1) continue;
      bubbles.push({ id: s.id, text: s.text, x: nx, y: ny });
    }
    // Skip the React update when there's nothing to show and nothing was shown.
    if (bubbles.length === 0 && this.lastBubbleCount === 0) return;
    this.lastBubbleCount = bubbles.length;
    this.bubbleListener(bubbles);
  }

  private updateCamera(dt: number) {
    const p = this.player.position;
    const desired = new Vector3(
      p.x + CAM_OFFSET.x,
      CAM_OFFSET.y,
      p.z + CAM_OFFSET.z,
    );
    const k = Math.min(1, dt * 6);
    this.camera.position.x += (desired.x - this.camera.position.x) * k;
    this.camera.position.y += (desired.y - this.camera.position.y) * k;
    this.camera.position.z += (desired.z - this.camera.position.z) * k;
    this.camera.setTarget(new Vector3(p.x, p.y + 1.8, p.z));
  }

  private emit() {
    if (!this.listener) return;
    const stats: GameStats = {
      status: this.status,
      health: this.health,
      maxHealth: MAX_HEALTH,
      mana: this.mana,
      maxMana: MAX_MANA,
      score: this.score,
      kills: this.kills,
      wave: this.zombies?.wave ?? 1,
      timeSurvived: this.timeSurvived,
      enemiesAlive: this.zombies?.aliveCount ?? 0,
      ultReady: this.mana >= ULT_COST && (this.summon?.canCast() ?? false),
      meteorReady: this.mana >= METEOR_COST && (this.meteor?.canCast() ?? false),
    };
    this.listener(stats);
  }

  get hurt() {
    return this.hurtFlash;
  }

  private onResize = () => this.engine.resize();

  dispose() {
    window.removeEventListener("resize", this.onResize);
    this.input.dispose();
    this.player.dispose();
    this.zombies.dispose();
    this.summon.dispose();
    this.meteor.dispose();
    this.bullets.dispose();
    this.floorContainer?.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
