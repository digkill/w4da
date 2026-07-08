import {
  Scene,
  Vector3,
  TransformNode,
  SceneLoader,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TrailMesh,
  type GlowLayer,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { ZombieManager } from "./zombies";
import { makeSfxPool, playSfx } from "./sfx";
import meteorUrl from "../assets/meteor.glb?url";
import impactSfxUrl from "../assets/audio/udar-o-zemlyu--oglushitelnyiy-vzryiv.mp3?url";

const FALL_SPEED = 55;
const START_HEIGHT = 48;
const IMPACT_Y = 0.6;
const RADIUS = 7;
const DAMAGE = 260;

interface Meteor {
  root: TransformNode;
  trail: TrailMesh | null;
  target: Vector3;
  active: boolean;
}

export class MeteorStrike {
  private scene: Scene;
  private glow: GlowLayer;
  private proto: TransformNode | null = null;
  private protoScale = 1;
  private pool: Meteor[] = [];
  private explosions: { mesh: Mesh; life: number }[] = [];
  private boomMat: StandardMaterial | null = null;
  private impactSfx = makeSfxPool(impactSfxUrl, 3, 0.8);
  private ready = false;

  constructor(scene: Scene, glow: GlowLayer) {
    this.scene = scene;
    this.glow = glow;
    this.load();
  }

  private async load() {
    try {
      const c = await SceneLoader.LoadAssetContainerAsync(meteorUrl, "", this.scene, null, ".glb");
      const inst = c.instantiateModelsToScene((n) => n, false);
      const model = inst.rootNodes[0] as TransformNode;
      const b = model.getHierarchyBoundingVectors(true);
      const h = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 1;
      this.protoScale = 3 / h; // ~3u fiery rock
      // Make it glow.
      model.getChildMeshes().forEach((m) => {
        const mm = m.material as unknown as { emissiveColor?: Color3 } | null;
        if (mm) mm.emissiveColor = Color3.FromHexString("#ff6a1e");
      });
      model.setEnabled(false);
      this.proto = model;
      this.ready = true;
    } catch (e) {
      console.warn("[W4DA] meteor failed to load:", e);
    }
  }

  canCast() {
    return this.ready;
  }

  cast(target: Vector3) {
    if (!this.proto) return;
    let m = this.pool.find((p) => !p.active);
    if (!m) {
      const root = this.proto.clone("meteor" + this.pool.length, null) as TransformNode;
      root.setEnabled(true);
      root.scaling.setAll(this.protoScale);
      root.getChildMeshes().forEach((cm) => this.glow.addExcludedMesh(cm as Mesh)); // avoid double-bloom clutter
      m = { root, trail: null, target: new Vector3(), active: false };
      this.pool.push(m);
    }
    m.target.set(target.x, 0, target.z);
    m.root.position.set(target.x, START_HEIGHT, target.z);
    m.root.setEnabled(true);
    m.active = true;
    // Fiery trail behind the falling rock.
    m.trail?.dispose();
    const gen = m.root.getChildMeshes().find((x) => x instanceof Mesh) as Mesh | undefined;
    if (gen) {
      const trail = new TrailMesh("meteorTrail", gen, this.scene, 1.2, 30, true);
      const tm = new StandardMaterial("meteorTrailMat", this.scene);
      tm.emissiveColor = Color3.FromHexString("#ff8a2a");
      tm.disableLighting = true;
      trail.material = tm;
      m.trail = trail;
    }
  }

  update(dt: number, zombies: ZombieManager) {
    for (const m of this.pool) {
      if (!m.active) continue;
      m.root.position.y -= FALL_SPEED * dt;
      m.root.rotation.y += dt * 6;
      m.root.rotation.x += dt * 4;
      if (m.root.position.y <= IMPACT_Y) {
        // Impact: area damage + explosion flash.
        zombies.damageArea(m.target, RADIUS, DAMAGE);
        this.boom(m.target);
        playSfx(this.impactSfx); // deafening ground impact
        m.active = false;
        m.root.setEnabled(false);
        m.root.position.y = -200;
        m.trail?.dispose();
        m.trail = null;
      }
    }
    // Explosions
    for (const e of this.explosions) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const k = 1 - e.life / 0.4;
      e.mesh.scaling.setAll(0.5 + k * RADIUS);
      e.mesh.visibility = 1 - k;
      if (e.life <= 0) e.mesh.isVisible = false;
    }
  }

  private boom(pos: Vector3) {
    let e = this.explosions.find((x) => x.life <= 0);
    if (!e) {
      if (!this.boomMat) {
        const bm = new StandardMaterial("boomMat", this.scene);
        bm.emissiveColor = Color3.FromHexString("#ff7a1e");
        bm.disableLighting = true;
        this.boomMat = bm;
      }
      const mesh = MeshBuilder.CreateSphere("boom" + this.explosions.length, { diameter: 2, segments: 10 }, this.scene);
      mesh.material = this.boomMat;
      mesh.isPickable = false;
      e = { mesh, life: 0 };
      this.explosions.push(e);
    }
    e.mesh.position.set(pos.x, 1, pos.z);
    e.mesh.isVisible = true;
    e.life = 0.4;
  }

  reset() {
    this.pool.forEach((m) => {
      m.active = false;
      m.root.setEnabled(false);
      m.root.position.y = -200;
      m.trail?.dispose();
      m.trail = null;
    });
    this.explosions.forEach((e) => {
      e.life = 0;
      e.mesh.isVisible = false;
    });
  }

  dispose() {
    this.pool.forEach((m) => {
      m.trail?.dispose();
      m.root.dispose();
    });
    this.explosions.forEach((e) => e.mesh.dispose());
    this.boomMat?.dispose();
    this.proto?.dispose();
  }
}
