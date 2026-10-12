import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CAST } from "../src/scenes/world/hanxizai/cast.js";
import { BOUNDS, ROOMS, SCREENS } from "../src/scenes/world/hanxizai/layout.js";
import {
  ACTION_CYCLES,
  actionFrame,
  poseAngles,
  rigDefinition,
  skinInfluences,
  stepPaperSpring,
  wrapAngle,
} from "../src/scenes/world/hanxizai/puppetRig.js";

test("all 45 figures reference existing intact sprite bounds and the correct scene", () => {
  assert.equal(CAST.length, 45);
  assert.equal(new Set(CAST.map((p) => p.id)).size, 45);
  for (const p of CAST) {
    const path = new URL(
      `../public/paintings/hanxizai-yeyan/puppets/${p.sheet}`,
      import.meta.url,
    );
    const png = fs.readFileSync(path),
      width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    for (const frame of p.frames ?? [{ rect: p.rect }]) {
      const [x, y, w, h] = frame.rect;
      assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, p.id);
      if (p.frameSize) {
        const [dx, dy] = frame.offset;
        assert.ok(
          dx >= 0 &&
            dy >= 0 &&
            dx + w <= p.frameSize[0] &&
            dy + h <= p.frameSize[1],
          `${p.id} frame is clipped`,
        );
      }
    }
    const r = ROOMS.find((r) => r.id === p.section);
    assert.ok(
      p.x >= r.x0 && p.x < r.x1 && p.z > BOUNDS.minZ && p.z < BOUNDS.maxZ,
      p.id,
    );
  }
  assert.equal(CAST.filter((p) => p.id.startsWith("han-")).length, 5);
  assert.equal(CAST.filter((p) => /^wind-[a-e]$/.test(p.id)).length, 5);
  assert.ok(CAST.find((p) => p.id === "monk").h > 1.7);
});

test("skin weights are normalized and the entire head stays on one rigid bone", () => {
  for (const p of CAST) {
    const nodes = rigDefinition(p.joints),
      aspect = p.rect[2] / p.rect[3];
    assert.equal(nodes.length, 15);
    nodes.forEach((n, i) => assert.ok(n.parent < i));
    for (let y = 0; y <= 1; y += 1 / 48)
      for (let x = 0; x <= 1; x += 1 / 32) {
        const s = skinInfluences([x, y], nodes, aspect);
        assert.ok(
          Math.abs(s.weights.reduce((a, b) => a + b, 0) - 1) < 1e-8,
          p.id,
        );
        assert.ok(
          s.weights.every((w) => Number.isFinite(w) && w >= 0 && w <= 1),
        );
        assert.ok(s.indices.every((i) => i >= 0 && i < 15));
        if (y <= nodes[2].pivot[1] - 0.035) {
          assert.equal(s.indices[0], 2);
          assert.equal(s.weights[0], 1);
        }
      }
  }
});

test("complete pose cycles cover drinking and dancing, hold, and close without changing scale", () => {
  for (const motion of ["drink", "dance"]) {
    const p = CAST.find((p) => p.motion === motion),
      cycle = ACTION_CYCLES[motion];
    const total = cycle.reduce((n, c) => n + c[1], 0);
    assert.equal(p.frames.length, 4);
    assert.equal(actionFrame(motion, 0), actionFrame(motion, total));
    const seen = new Set();
    for (let t = 0; t < total; t += 0.02) seen.add(actionFrame(motion, t));
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
    let at = 0;
    for (const [frame, duration] of cycle) {
      assert.equal(actionFrame(motion, at + duration / 2), frame);
      at += duration;
    }
    assert.equal(actionFrame(motion, -0.5), actionFrame(motion, total - 0.5));
  }
});

test("motions stay bounded, move the intended joints, and keep the root anchored", () => {
  for (const motion of new Set(CAST.map((p) => p.motion)))
    for (let t = 0; t < 12; t += 0.075) {
      const a = poseAngles(motion, t, 0.4);
      assert.equal(a.waist, 0);
      Object.values(a).forEach((v) =>
        assert.ok(Number.isFinite(v) && Math.abs(v) < 0.16),
      );
    }
  assert.notEqual(
    poseAngles("drum", 0.6).leftElbow,
    poseAngles("listen", 0.6).leftElbow,
  );
  assert.notEqual(
    poseAngles("pipa", 0.4).leftWrist,
    poseAngles("listen", 0.4).leftWrist,
  );
});

test("camera-turn spring handles angle wrap, decays, and survives frame stalls", () => {
  assert.ok(Math.abs(wrapAngle(Math.PI * 2 - 0.01) + 0.01) < 1e-10);
  for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.05]) {
    const s = { angle: 0, velocity: 0 };
    let peak = 0;
    for (let i = 0; i < 10 / dt; i++) {
      stepPaperSpring(s, i === 0 ? 0.1 : 0, dt);
      peak = Math.max(peak, Math.abs(s.angle));
    }
    assert.ok(peak > 0.001 && peak <= 0.045);
    assert.ok(Math.abs(s.angle) < 1e-8 && Math.abs(s.velocity) < 1e-7);
  }
  const s = { angle: 0, velocity: 0 };
  for (let i = 0; i < 500; i++) stepPaperSpring(s, 100, 1);
  assert.ok(Number.isFinite(s.angle) && Math.abs(s.angle) <= 0.045);
});

test("screens leave a continuous promenade and the five viewpoints stay in bounds", () => {
  for (const s of SCREENS)
    assert.ok(s.z + (Math.abs(Math.sin(s.angle)) * s.length) / 2 + 0.3 < 2.5);
  for (const r of ROOMS) {
    const [x, z] = r.view;
    assert.ok(
      x > BOUNDS.minX && x < BOUNDS.maxX && z > BOUNDS.minZ && z <= BOUNDS.maxZ,
    );
  }
});
