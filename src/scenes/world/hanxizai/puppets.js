import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";
import { CAST } from "./cast.js";
import { createPuppetAtlas } from "./puppetPainter.js";
import { actionFrame, stepPaperSpring, wrapAngle } from "./puppetRig.js";

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
  // Articulated gestures are complete registered poses. A rigid card preserves
  // instrument geometry, facial features and the negative space between limbs.
  const geometry = new PlaneGeometry(height * aspect, height);
  geometry.translate(0, height / 2, 0);
  const sourceUVs = geometry.attributes.uv.array.slice();
  const mesh = new Mesh(geometry, material);
  mesh.name = person.id;
  mesh.position.set(person.x, person.y, person.z);
  mesh.frustumCulled = false;
  const puppet = {
    mesh,
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

/** Whole alpha silhouettes and bounded rigid paper inertia; no mesh warping. */
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
      if (!p.mesh.visible) continue;
      if (reducedMotion) {
        p.spring.angle = 0;
        p.spring.velocity = 0;
      }
      const sway = reducedMotion ? 0 : stepPaperSpring(p.spring, impulse, dt);
      applyFrame(
        p,
        reducedMotion || p.cells.length === 1
          ? 0
          : actionFrame(p.person.motion, time, p.phase),
      );
      p.mesh.rotation.y = sway;
      // Quiet figures incline as a single piece, as a held shadow puppet would.
      p.mesh.rotation.z =
        sway * 0.12 +
        (reducedMotion || p.cells.length > 1
          ? 0
          : Math.sin(time * 1.1 + p.phase) * 0.006);
    }
  }
  function dispose() {
    puppets.forEach((p) => {
      p.mesh.geometry.dispose();
    });
    material.dispose();
    atlas.texture.dispose();
  }
  return {
    group,
    puppets,
    cast,
    count: cast.length,
    atlas,
    update,
    dispose,
    setSection(id) {
      puppets.forEach((p) => {
        p.mesh.visible = p.person.section === id;
        p.spring = { angle: 0, velocity: 0 };
      });
      lastYaw = null;
    },
  };
}
