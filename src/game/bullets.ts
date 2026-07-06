import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  InstancedMesh,
} from "@babylonjs/core";

interface Bullet {
  mesh: InstancedMesh;
  vel: Vector3;
  life: number;
  active: boolean;
}

const SPEED = 60;
const LIFE = 1.4;
const RADIUS = 0.35;

export class BulletPool {
  private proto: Mesh;
  private pool: Bullet[] = [];

  constructor(scene: Scene) {
    const proto = MeshBuilder.CreateCylinder(
      "bulletProto",
      { diameter: 0.14, height: 0.9, tessellation: 6 },
      scene,
    );
    proto.rotation.x = Math.PI / 2; // point along Z, we orient via lookAt
    proto.bakeCurrentTransformIntoVertices();
    const m = new StandardMaterial("bulletMat", scene);
    m.emissiveColor = Color3.FromHexString("#ffcf6b");
    m.diffuseColor = Color3.FromHexString("#ff9a3c");
    m.disableLighting = true;
    proto.material = m;
    proto.isVisible = false;
    proto.isPickable = false;
    this.proto = proto;
  }

  spawn(origin: Vector3, dir: Vector3) {
    let b = this.pool.find((p) => !p.active);
    if (!b) {
      const inst = this.proto.createInstance("bullet" + this.pool.length);
      inst.isPickable = false;
      b = { mesh: inst, vel: new Vector3(), life: 0, active: false };
      this.pool.push(b);
    }
    b.active = true;
    b.life = LIFE;
    b.mesh.isVisible = true;
    b.mesh.position.copyFrom(origin);
    b.vel.copyFrom(dir).normalize().scaleInPlace(SPEED);
    const look = origin.add(b.vel);
    b.mesh.lookAt(look);
  }

  update(dt: number) {
    for (const b of this.pool) {
      if (!b.active) continue;
      b.mesh.position.addInPlace(b.vel.scale(dt));
      b.life -= dt;
      if (b.life <= 0) this.kill(b);
    }
  }

  /** Active bullets for collision tests. */
  forEachActive(cb: (pos: Vector3, kill: () => void) => void) {
    for (const b of this.pool) {
      if (b.active) cb(b.mesh.position, () => this.kill(b));
    }
  }

  static get radius() {
    return RADIUS;
  }

  private kill(b: Bullet) {
    b.active = false;
    b.mesh.isVisible = false;
    b.mesh.position.set(0, -100, 0);
  }

  dispose() {
    this.pool.forEach((b) => b.mesh.dispose());
    this.proto.dispose();
  }
}
