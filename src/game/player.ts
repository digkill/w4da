import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
} from "@babylonjs/core";
import { buildHorseRider, buildBlobShadow, type HorseRig } from "./factory";
import { BulletPool } from "./bullets";

const MOVE_SPEED = 11;
const TURN_LERP = 8;
const FIRE_INTERVAL = 0.085;
const AIM_RANGE = 26;
const ARENA_RADIUS = 88;

export class Player {
  readonly rig: HorseRig;
  readonly pos: Vector3;
  private heading = 0;
  private galloping = 0;
  private fireTimer = 0;
  private recoil = 0;
  private flash: Mesh;

  constructor(scene: Scene) {
    this.rig = buildHorseRider(scene);
    this.pos = new Vector3(0, 0, 0);

    const shadow = buildBlobShadow(scene, 3.2);
    shadow.parent = this.rig.root;
    shadow.position.set(0, 0.02, 0);
    shadow.scaling.x = 1.4;

    // Muzzle flash sprite
    this.flash = MeshBuilder.CreatePlane("flash", { size: 1.1 }, scene);
    const fm = new StandardMaterial("flashMat", scene);
    fm.emissiveColor = Color3.FromHexString("#ffd27a");
    fm.disableLighting = true;
    fm.alpha = 0;
    fm.backFaceCulling = false;
    this.flash.material = fm;
    this.flash.parent = this.rig.muzzle;
    this.flash.rotation.y = Math.PI / 2;
    this.flash.isPickable = false;
  }

  get position() {
    return this.pos;
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.fireTimer = 0;
  }

  update(
    dt: number,
    worldMove: Vector3,
    target: Vector3 | null,
    bullets: BulletPool,
    onFire: () => void,
  ) {
    const moving = worldMove.lengthSquared() > 0.001;

    // Move
    if (moving) {
      this.pos.addInPlace(worldMove.scale(MOVE_SPEED * dt));
      // clamp to arena
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > ARENA_RADIUS) {
        this.pos.x = (this.pos.x / r) * ARENA_RADIUS;
        this.pos.z = (this.pos.z / r) * ARENA_RADIUS;
      }
      const desired = Math.atan2(-worldMove.z, worldMove.x);
      this.heading = lerpAngle(this.heading, desired, TURN_LERP * dt);
      this.galloping = Math.min(this.galloping + dt * 4, 1);
    } else {
      this.galloping = Math.max(this.galloping - dt * 4, 0);
    }

    // Gallop bob + leg swing
    const t = performance.now() * 0.001;
    const gait = t * 13;
    const amp = 0.6 * this.galloping;
    this.rig.legs.forEach((leg, i) => {
      const phase = i < 2 ? 0 : Math.PI; // front pair vs back pair
      leg.rotation.z = Math.sin(gait + phase) * amp;
    });
    const bob = Math.abs(Math.sin(gait)) * 0.18 * this.galloping;

    this.rig.root.position.set(this.pos.x, bob, this.pos.z);
    this.rig.root.rotation.y = this.heading;

    // Aim gun at target
    let aimDir: Vector3 | null = null;
    if (target) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= AIM_RANGE) {
        aimDir = new Vector3(dx / dist, 0, dz / dist);
        const worldAim = Math.atan2(-dz, dx);
        this.rig.gun.rotation.y = worldAim - this.heading + this.recoil;
      }
    }
    if (!aimDir) {
      this.rig.gun.rotation.y = this.recoil * 0.5;
    }

    // Fire
    this.recoil *= Math.max(0, 1 - dt * 14);
    this.fireTimer -= dt;
    const fm = this.flash.material as StandardMaterial;
    fm.alpha = Math.max(0, fm.alpha - dt * 12);
    this.flash.scaling.setAll(0.6 + fm.alpha);

    if (aimDir && this.fireTimer <= 0) {
      this.fireTimer = FIRE_INTERVAL;
      this.rig.muzzle.computeWorldMatrix(true);
      const origin = this.rig.muzzle.getAbsolutePosition().clone();
      // slight spread
      const spread = 0.06;
      const dir = new Vector3(
        aimDir.x + (Math.random() - 0.5) * spread,
        0,
        aimDir.z + (Math.random() - 0.5) * spread,
      );
      bullets.spawn(origin, dir);
      this.recoil = 0.12;
      fm.alpha = 0.9;
      onFire();
    }
  }

  dispose() {
    this.rig.root.dispose();
    this.flash.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

export { ARENA_RADIUS };
