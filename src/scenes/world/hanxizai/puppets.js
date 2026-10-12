import {
  Bone,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  PlaneGeometry,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { CAST } from "./cast.js";
import { createPuppetAtlas } from "./puppetPainter.js";
import {
  actionFrame,
  poseAngles,
  rigDefinition,
  skinInfluences,
  stepPaperSpring,
  wrapAngle,
} from "./puppetRig.js";

export function buildCast() {
  return CAST;
}

function applyFrame(p, index) {
  if (p.frame === index) return;
  p.frame = index;
  const cell = p.cells[index],
    uv = p.mesh.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const x = p.sourceUVs[i * 2],
      y = p.sourceUVs[i * 2 + 1];
    uv.setXY(
      i,
      cell.u0 + x * (cell.u1 - cell.u0),
      cell.v0 + y * (cell.v1 - cell.v0),
    );
  }
  uv.needsUpdate = true;
}

function makePuppet(person, cell, material) {
  const aspect = cell.bounds.w / cell.bounds.h,
    height = person.h;
  const local = ([x, y]) =>
    new Vector3((x - 0.5) * height * aspect, (1 - y) * height, 0);
  const nodes = rigDefinition(person.joints);
  // Shared vertices are essential: separately triangulated body cells developed
  // visible cracks when the elbows turned. The face remains a rigid head region.
  const geometry = new PlaneGeometry(height * aspect, height, 32, 48);
  geometry.translate(0, height / 2, 0);
  const sourceUVs = geometry.attributes.uv.array.slice(),
    indices = [],
    weights = [];
  for (let i = 0; i < geometry.attributes.uv.count; i++) {
    const point = [sourceUVs[i * 2], 1 - sourceUVs[i * 2 + 1]];
    const skin = skinInfluences(point, nodes, aspect);
    indices.push(...skin.indices);
    weights.push(...skin.weights);
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, material);
  const bones = nodes.map((n) => {
    const b = new Bone();
    b.name = n.name;
    return b;
  });
  nodes.forEach((n, i) => {
    bones[i].position.copy(local(n.pivot));
    if (n.parent >= 0) {
      bones[i].position.sub(local(nodes[n.parent].pivot));
      bones[n.parent].add(bones[i]);
    }
  });
  mesh.add(bones[0]);
  mesh.bind(new Skeleton(bones));
  mesh.name = person.id;
  mesh.position.set(person.x, person.y, person.z);
  mesh.frustumCulled = false;
  const puppet = {
    mesh,
    bones,
    nodes,
    person,
    sourceUVs,
    cells: cell.frames,
    frame: -1,
    phase: person.x * 1.73,
    spring: { angle: 0, velocity: 0 },
  };
  applyFrame(puppet, 0);
  return puppet;
}

/** Complete alpha silhouettes, fifteen joints, bounded paper inertia.
 * Large gestures use registered whole-character poses; small joint motion
 * gives sleeves and heads life between poses, without exposing cut surfaces. */
export function createPuppetFigures({ spriteImages, walkMap, cast = CAST }) {
  const atlas = createPuppetAtlas(spriteImages, cast);
  const material = new MeshBasicMaterial({
    map: atlas.texture,
    side: DoubleSide,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
  const group = new Group();
  group.name = "夜宴 · 关节纸偶";
  const puppets = cast.map((p, i) => makePuppet(p, atlas.cells[i], material));
  puppets.forEach((p) => {
    group.add(p.mesh);
    walkMap?.addCircle(
      p.person.x,
      p.person.z,
      0.22,
      -0.1,
      p.person.y + p.person.h,
    );
  });
  let time = 0,
    lastYaw = null;
  function update(dt, camera, { reducedMotion = false } = {}) {
    const yaw = camera?.rotation.y ?? 0;
    const impulse = lastYaw === null ? 0 : wrapAngle(yaw - lastYaw);
    lastYaw = yaw;
    if (!reducedMotion) time += Math.min(dt, 0.05);
    for (const p of puppets) {
      if (reducedMotion) {
        p.spring.angle = 0;
        p.spring.velocity = 0;
      }
      const sway = reducedMotion ? 0 : stepPaperSpring(p.spring, impulse, dt);
      const a = reducedMotion ? {} : poseAngles(p.person.motion, time, p.phase);
      p.bones.forEach((b, i) => {
        b.rotation.z =
          (a[p.nodes[i].name] ?? 0) +
          sway * (i === 1 ? 0.35 : i === 2 ? 0.55 : 0);
      });
      applyFrame(
        p,
        reducedMotion ? 0 : actionFrame(p.person.motion, time, p.phase),
      );
      p.mesh.rotation.y = sway;
      p.mesh.rotation.z = sway * 0.12;
    }
  }
  function dispose() {
    puppets.forEach((p) => {
      p.mesh.geometry.dispose();
      p.mesh.skeleton.dispose();
    });
    material.dispose();
    atlas.texture.dispose();
  }
  return { group, puppets, cast, count: cast.length, atlas, update, dispose };
}
