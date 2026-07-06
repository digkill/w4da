import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  TransformNode,
  Mesh,
} from "@babylonjs/core";

export function mat(
  scene: Scene,
  name: string,
  hex: string,
  opts: { emissive?: string; spec?: number } = {},
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(opts.spec ?? 0.08, opts.spec ?? 0.08, opts.spec ?? 0.08);
  if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
  // Allow several point lights (torch + campfires) to reach a surface at once.
  m.maxSimultaneousLights = 8;
  return m;
}

export interface HorseRig {
  root: TransformNode;
  legs: Mesh[];
  muzzle: TransformNode; // where bullets spawn
  gun: TransformNode;
}

/** Builds the hero: a horse with a machine-gunner rider. Legs are returned for gallop animation. */
export function buildHorseRider(scene: Scene): HorseRig {
  const root = new TransformNode("hero", scene);

  const bodyMat = mat(scene, "horseBody", "#4a3220");
  const darkMat = mat(scene, "horseDark", "#2c1d12");
  const skinMat = mat(scene, "riderSkin", "#c98d5a");
  const clothMat = mat(scene, "riderCloth", "#1f3a5f");
  const metalMat = mat(scene, "gunMetal", "#1a1a1f", { spec: 0.4 });
  const hotMat = mat(scene, "gunHot", "#e0e0e0", { emissive: "#552200" });

  // Horse body
  const body = MeshBuilder.CreateCapsule("hBody", { radius: 0.55, height: 2.2, orientation: Vector3.Right() }, scene);
  body.material = bodyMat;
  body.position.set(0, 1.35, 0);
  body.parent = root;

  const chest = MeshBuilder.CreateSphere("hChest", { diameter: 1.2 }, scene);
  chest.material = bodyMat;
  chest.position.set(0.85, 1.4, 0);
  chest.parent = root;

  // Neck + head
  const neck = MeshBuilder.CreateCylinder("hNeck", { diameterTop: 0.45, diameterBottom: 0.7, height: 1.1 }, scene);
  neck.material = bodyMat;
  neck.position.set(1.35, 1.95, 0);
  neck.rotation.z = Math.PI / 3.2;
  neck.parent = root;

  const head = MeshBuilder.CreateBox("hHead", { width: 0.9, height: 0.5, depth: 0.45 }, scene);
  head.material = bodyMat;
  head.position.set(1.95, 2.35, 0);
  head.rotation.z = -0.25;
  head.parent = root;

  const ear1 = MeshBuilder.CreateCylinder("hEar1", { diameterTop: 0, diameterBottom: 0.16, height: 0.3 }, scene);
  ear1.material = darkMat;
  ear1.position.set(1.7, 2.7, 0.16);
  ear1.parent = root;
  const ear2 = ear1.clone("hEar2")!;
  ear2.position.z = -0.16;

  // Mane + tail
  const mane = MeshBuilder.CreateBox("hMane", { width: 0.12, height: 0.7, depth: 0.5 }, scene);
  mane.material = darkMat;
  mane.position.set(1.15, 2.25, 0);
  mane.rotation.z = Math.PI / 3.2;
  mane.parent = root;

  const tail = MeshBuilder.CreateCylinder("hTail", { diameterTop: 0.08, diameterBottom: 0.3, height: 1.1 }, scene);
  tail.material = darkMat;
  tail.position.set(-1.1, 1.3, 0);
  tail.rotation.z = -Math.PI / 4;
  tail.parent = root;

  // Legs
  const legs: Mesh[] = [];
  const legPos: [number, number][] = [
    [0.7, 0.5],
    [0.7, -0.5],
    [-0.7, 0.5],
    [-0.7, -0.5],
  ];
  for (let i = 0; i < legPos.length; i++) {
    const [x, z] = legPos[i];
    const leg = MeshBuilder.CreateCylinder(`hLeg${i}`, { diameter: 0.26, height: 1.4 }, scene);
    leg.material = i % 2 === 0 ? darkMat : bodyMat;
    leg.setPivotPoint(new Vector3(0, 0.7, 0));
    leg.position.set(x, 0.7, z);
    leg.parent = root;
    legs.push(leg);
  }

  // ---- Rider ----
  const rider = new TransformNode("rider", scene);
  rider.parent = root;
  rider.position.set(0.1, 2.05, 0);

  const torso = MeshBuilder.CreateCapsule("rTorso", { radius: 0.32, height: 1.0 }, scene);
  torso.material = clothMat;
  torso.position.set(0, 0.35, 0);
  torso.parent = rider;

  const rHead = MeshBuilder.CreateSphere("rHead", { diameter: 0.5 }, scene);
  rHead.material = skinMat;
  rHead.position.set(0, 1.0, 0);
  rHead.parent = rider;

  const hat = MeshBuilder.CreateCylinder("rHat", { diameter: 0.62, height: 0.28 }, scene);
  hat.material = mat(scene, "rHat", "#0f0f14");
  hat.position.set(0, 1.28, 0);
  hat.parent = rider;
  const brim = MeshBuilder.CreateCylinder("rBrim", { diameter: 0.85, height: 0.05 }, scene);
  brim.material = hat.material;
  brim.position.set(0, 1.16, 0);
  brim.parent = rider;

  const legL = MeshBuilder.CreateCapsule("rLegL", { radius: 0.16, height: 0.8 }, scene);
  legL.material = mat(scene, "rLegs", "#20242c");
  legL.position.set(-0.05, -0.35, 0.42);
  legL.rotation.x = -0.5;
  legL.parent = rider;
  const legR = legL.clone("rLegR")!;
  legR.position.z = -0.42;
  legR.rotation.x = 0.5;

  // ---- Machine gun ----
  const gun = new TransformNode("gun", scene);
  gun.parent = rider;
  gun.position.set(0.35, 0.55, 0);

  const gunBody = MeshBuilder.CreateBox("gBody", { width: 0.7, height: 0.22, depth: 0.22 }, scene);
  gunBody.material = metalMat;
  gunBody.parent = gun;

  const barrel = MeshBuilder.CreateCylinder("gBarrel", { diameter: 0.12, height: 1.1, tessellation: 8 }, scene);
  barrel.material = metalMat;
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.75, 0, 0);
  barrel.parent = gun;

  const shroud = MeshBuilder.CreateCylinder("gShroud", { diameter: 0.28, height: 0.5, tessellation: 8 }, scene);
  shroud.material = hotMat;
  shroud.rotation.z = Math.PI / 2;
  shroud.position.set(0.55, 0, 0);
  shroud.parent = gun;

  const mag = MeshBuilder.CreateBox("gMag", { width: 0.18, height: 0.5, depth: 0.16 }, scene);
  mag.material = metalMat;
  mag.position.set(0.05, -0.32, 0);
  mag.parent = gun;

  // Rider arms holding the gun
  const arm = MeshBuilder.CreateCapsule("rArm", { radius: 0.12, height: 0.6 }, scene);
  arm.material = clothMat;
  arm.position.set(0.2, 0.5, 0.18);
  arm.rotation.z = -Math.PI / 2.4;
  arm.parent = rider;
  const arm2 = arm.clone("rArm2")!;
  arm2.position.z = -0.18;

  const muzzle = new TransformNode("muzzle", scene);
  muzzle.parent = gun;
  muzzle.position.set(1.35, 0, 0);

  return { root, legs, muzzle, gun };
}

/**
 * Builds a single "zombie gypsy" mesh (merged for instancing). Colorful ragged
 * clothes, greenish skin, hunched silhouette.
 */
export function buildZombiePrototype(scene: Scene): Mesh {
  const skin = mat(scene, "zSkin", "#7a9e57", { emissive: "#0e1a08" });
  const shirt = mat(scene, "zShirt", "#b3245f");
  const skirt = mat(scene, "zSkirt", "#6a2fb3");
  const scarf = mat(scene, "zScarf", "#e0a83c");

  const torso = MeshBuilder.CreateCapsule("zTorso", { radius: 0.34, height: 1.1 }, scene);
  torso.material = shirt;
  torso.position.set(0, 1.1, 0);

  const belly = MeshBuilder.CreateSphere("zBelly", { diameter: 0.8 }, scene);
  belly.material = skirt;
  belly.position.set(0, 0.55, 0);
  belly.scaling.y = 0.85;

  const head = MeshBuilder.CreateSphere("zHead", { diameter: 0.52 }, scene);
  head.material = skin;
  head.position.set(0.08, 1.75, 0);

  // Glowing eyes (picked up by the scene GlowLayer for a menacing look)
  const eyeMat = mat(scene, "zEye", "#1a0000", { emissive: "#ff2b1a" });
  const eyeL = MeshBuilder.CreateSphere("zEyeL", { diameter: 0.11 }, scene);
  eyeL.material = eyeMat;
  eyeL.position.set(0.32, 1.79, 0.11);
  const eyeR = eyeL.clone("zEyeR")!;
  eyeR.position.z = -0.11;

  const scarfMesh = MeshBuilder.CreateTorus("zScarf", { diameter: 0.5, thickness: 0.14, tessellation: 10 }, scene);
  scarfMesh.material = scarf;
  scarfMesh.position.set(0.05, 1.95, 0);
  scarfMesh.scaling.y = 0.6;

  const armL = MeshBuilder.CreateCapsule("zArmL", { radius: 0.11, height: 0.9 }, scene);
  armL.material = skin;
  armL.position.set(0.35, 1.25, 0.32);
  armL.rotation.x = -0.4;
  armL.rotation.z = -0.9;
  const armR = armL.clone("zArmR")!;
  armR.position.z = -0.32;
  armR.rotation.x = 0.4;

  const legL = MeshBuilder.CreateCapsule("zLegL", { radius: 0.14, height: 0.7 }, scene);
  legL.material = skirt;
  legL.position.set(0, 0.35, 0.18);
  const legR = legL.clone("zLegR")!;
  legR.position.z = -0.18;

  const merged = Mesh.MergeMeshes(
    [torso, belly, head, eyeL, eyeR, scarfMesh, armL, armR, legL, legR],
    true,
    true,
    undefined,
    false,
    true,
  );
  merged!.name = "zombieProto";
  merged!.isVisible = false;
  merged!.isPickable = false;
  return merged!;
}

/** Flat dark disc used as a cheap blob shadow under units. */
export function buildBlobShadow(scene: Scene, diameter: number): Mesh {
  const disc = MeshBuilder.CreateDisc("blob", { radius: diameter / 2, tessellation: 16 }, scene);
  const m = new StandardMaterial("blobMat", scene);
  m.diffuseColor = new Color3(0, 0, 0);
  m.specularColor = new Color3(0, 0, 0);
  m.alpha = 0.28;
  m.disableLighting = true;
  disc.material = m;
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.02;
  disc.isPickable = false;
  return disc;
}
