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
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  type Mesh,
} from "@babylonjs/core";
import { Player, ARENA_RADIUS } from "./player";
import { EnemyManager, type SpeakingBubble } from "./enemies";
import { BulletPool } from "./bullets";
import { InputManager } from "./input";
import { mat } from "./factory";
import type { GameStats, StatsListener, GameStatus, BubbleListener, SpeechBubble } from "./types";

const BULLET_DMG = 16;
const MAX_HEALTH = 100;
const CAM_OFFSET = new Vector3(0, 12, 15);

export class Game {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private player: Player;
  private enemies: EnemyManager;
  private bullets: BulletPool;
  private input: InputManager;

  private status: GameStatus = "menu";
  private health = MAX_HEALTH;
  private score = 0;
  private kills = 0;
  private timeSurvived = 0;
  private hurtFlash = 0;

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
    this.scene.clearColor = new Color4(0.03, 0.03, 0.05, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.05, 0.04, 0.08);
    this.scene.fogDensity = 0.011;

    this.camera = new FreeCamera("cam", CAM_OFFSET.clone(), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.fov = 0.9;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 400;

    this.setupLights();
    this.buildWorld();

    // Emissive bloom for bullets, fire, muzzle flash and zombie eyes.
    this.glow = new GlowLayer("glow", this.scene, { blurKernelSize: 40 });
    this.glow.intensity = 0.9;

    this.bullets = new BulletPool(this.scene);
    this.player = new Player(this.scene);

    // Warm torch riding with the hero — lights up zombies as they close in.
    this.torch = new PointLight("torch", new Vector3(0, 2.6, 0), this.scene);
    this.torch.diffuse = Color3.FromHexString("#ffb15a");
    this.torch.intensity = this.torchBase;
    this.torch.range = 26;
    this.torch.parent = this.player.rig.root;
    this.enemies = new EnemyManager(this.scene, {
      onPlayerHit: (dmg) => this.damagePlayer(dmg),
      onKill: (pts) => {
        this.score += pts;
        this.kills++;
      },
    });

    this.input = new InputManager(canvas);
    this.input.onPauseToggle = () => this.togglePause();

    this.engine.runRenderLoop(() => this.frame());
    window.addEventListener("resize", this.onResize);
  }

  private setupLights() {
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.42;
    hemi.diffuse = Color3.FromHexString("#ffcf9e");
    hemi.groundColor = Color3.FromHexString("#1b1330");
    hemi.specular = Color3.FromHexString("#332211");

    // Warm low sun (key light) — long dramatic shadows/highlights.
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -0.85, 0.35), this.scene);
    sun.intensity = 1.35;
    sun.diffuse = Color3.FromHexString("#ff7a2c");
    sun.specular = Color3.FromHexString("#ffd9a0");
    sun.position = new Vector3(50, 60, -35);

    // Cool blue rim/fill from the opposite side for shape and mood.
    const rim = new DirectionalLight("rim", new Vector3(0.6, -0.3, -0.6), this.scene);
    rim.intensity = 0.5;
    rim.diffuse = Color3.FromHexString("#4a6cff");
    rim.specular = Color3.FromHexString("#8aa0ff");
  }

  private buildWorld() {
    // Ground
    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 260, height: 260, subdivisions: 2 },
      this.scene,
    );
    const gm = new StandardMaterial("groundMat", this.scene);
    gm.diffuseColor = Color3.FromHexString("#1a2416");
    gm.specularColor = new Color3(0, 0, 0);
    ground.material = gm;
    ground.isPickable = false;

    // Arena ring
    const ring = MeshBuilder.CreateTorus(
      "ring",
      { diameter: ARENA_RADIUS * 2, thickness: 0.8, tessellation: 64 },
      this.scene,
    );
    ring.material = mat(this.scene, "ringMat", "#3a2a10", { emissive: "#1a1204" });
    ring.position.y = 0.4;
    ring.isPickable = false;

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
    this.emit();
  }

  restart() {
    this.health = MAX_HEALTH;
    this.score = 0;
    this.kills = 0;
    this.timeSurvived = 0;
    this.hurtFlash = 0;
    this.player.reset();
    this.enemies.reset();
    this.status = "playing";
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
      this.emit();
    }
  }

  private frame() {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);

    if (this.status === "playing") {
      this.timeSurvived += dt;

      const move2 = this.input.getDirection();
      // Left/right inverted per design: negate the horizontal (strafe) axis.
      const worldMove = new Vector3(-move2.x, 0, -move2.y);
      if (worldMove.lengthSquared() > 1) worldMove.normalize();

      const target = this.enemies.nearestTo(this.player.position);
      this.player.update(dt, worldMove, target, this.bullets, () => {});

      this.bullets.update(dt);
      this.bullets.forEachActive((pos, kill) => {
        if (this.enemies.hitTest(pos, BulletPool.radius, BULLET_DMG)) kill();
      });

      this.enemies.update(dt, this.player.position);

      this.emitTimer += dt;
      if (this.emitTimer > 0.1) {
        this.emitTimer = 0;
        this.emit();
      }
    }

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
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
    this.enemies.getSpeaking(this.speakingBuf);
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
      score: this.score,
      kills: this.kills,
      wave: this.enemies?.wave ?? 1,
      timeSurvived: this.timeSurvived,
      enemiesAlive: this.enemies?.aliveCount ?? 0,
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
    this.enemies.dispose();
    this.bullets.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
