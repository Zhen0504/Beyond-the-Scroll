import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { CAST } from "../src/scenes/world/hanxizai/cast.js";
import {
  ROOMS,
  SEATS,
  BEDS,
  DRUMS,
} from "../src/scenes/world/hanxizai/layout.js";
import { CHAPTERS } from "../src/scenes/world/hanxizai/story.js";
import { GuidedTour } from "../src/scenes/world/hanxizai/GuidedTour.js";
import {
  ACTION_CYCLES,
  actionFrame,
  stepPaperSpring,
  wrapAngle,
} from "../src/scenes/world/hanxizai/puppetRig.js";

const create = (aspect = 1.5, reducedMotion = false) =>
  new GuidedTour({
    camera: new PerspectiveCamera(48, aspect, 0.1, 100),
    reducedMotion,
  });
const settle = (t) => {
  for (let i = 0; i < 250; i++) t.update(0.02);
};

test("45 complete figures and all registered frames fit their real source and atlas canvas", () => {
  assert.equal(CAST.length, 45);
  assert.equal(new Set(CAST.map((p) => p.id)).size, 45);
  for (const p of CAST) {
    const png = fs.readFileSync(
      new URL(
        `../public/paintings/hanxizai-yeyan/puppets/${p.sheet}`,
        import.meta.url,
      ),
    );
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    for (const f of p.frames ?? [{ rect: p.rect }]) {
      const [x, y, w, h] = f.rect;
      assert.ok(
        x >= 0 && y >= 0 && x + w <= width && y + h <= height,
        `${p.id}: source crop`,
      );
      if (p.frameSize) {
        const [dx, dy] = f.offset;
        assert.ok(
          dx >= 0 &&
            dy >= 0 &&
            dx + w <= p.frameSize[0] &&
            dy + h <= p.frameSize[1],
          `${p.id}: registered crop`,
        );
      }
    }
    const room = ROOMS.find((r) => r.id === p.section);
    assert.ok(p.x >= room.x0 && p.x < room.x1, p.id);
  }
  const count = CAST.reduce((n, p) => n + (p.frames?.length ?? 1), 0),
    cols = Math.ceil(Math.sqrt((count * 512) / 320));
  assert.ok(cols * 320 <= 4096 && Math.ceil(count / cols) * 512 <= 4096);
  assert.equal(CAST.filter((p) => p.id.startsWith("han-")).length, 5);
  assert.equal(CAST.filter((p) => /^wind-[a-e]$/.test(p.id)).length, 5);
});

test("ten role cycles have complete gestures, holds, and a reproducible loop", () => {
  assert.equal(Object.keys(ACTION_CYCLES).length, 10);
  for (const [motion, cycle] of Object.entries(ACTION_CYCLES)) {
    const p = CAST.find((p) => p.motion === motion && p.frames);
    assert.ok(p, motion);
    const total = cycle.reduce((n, c) => n + c[1], 0);
    const seen = new Set();
    let at = 0;
    for (const [frame, duration] of cycle) {
      assert.equal(actionFrame(motion, at + duration / 2), frame);
      assert.ok(frame < p.frames.length);
      at += duration;
    }
    for (let t = 0; t < total; t += 0.02) seen.add(actionFrame(motion, t));
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
    assert.equal(actionFrame(motion, 0.1), actionFrame(motion, total + 0.1));
    assert.equal(actionFrame(motion, -0.5), actionFrame(motion, total - 0.5));
  }
  assert.equal(
    DRUMS.length,
    0,
    "no second drum through the compound paper puppet",
  );
  assert.equal(
    CAST.find((p) => p.id === "han-drum").sheet,
    "drum-cycle-v2.png",
  );
});

test("paper spring handles wrap, frame stalls, and decays to rest", () => {
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

test("every chapter change gates on the original, cancels travel, and starts at its opening", () => {
  const t = create();
  assert.equal(t.state.phase, "plate");
  const initial = t.camera.position.clone();
  t.move(1);
  assert.equal(t.state.stop, 0);
  assert.ok(t.camera.position.equals(initial));
  for (const c of CHAPTERS) {
    t.openChapter(c.id);
    assert.equal(t.state.phase, "plate");
    assert.equal(t.state.stop, 0);
    assert.equal(t.fade, 1);
    t.enter();
    assert.equal(t.state.phase, "entering");
    settle(t);
    assert.equal(t.state.phase, "scene");
    t.move(1);
    assert.equal(t.state.phase, "travel");
    t.update(0.1);
  }
  t.openChapter("tingyue");
  assert.equal(t.travel, null);
  t.enter();
  settle(t);
  assert.equal(t.state.stop, 0);
  const before = t.getSnapshot();
  t.openChapter("unknown");
  assert.equal(t.getSnapshot(), before);
});

test("all 17 stops and every sampled rail remain in front of actors, clear of furniture", () => {
  assert.equal(
    CHAPTERS.reduce((n, c) => n + c.stops.length, 0),
    17,
  );
  for (const aspect of [1.5, 390 / 844]) {
    const t = create(aspect);
    for (const c of CHAPTERS) {
      t.openChapter(c.id);
      t.enter();
      settle(t);
      for (let i = 0; i < c.stops.length; i++) {
        if (i) t.move(1);
        for (let k = 0; k < 210; k++) {
          t.update(0.02);
          assert.ok(
            t.camera.position.z >= 3,
            "rail stays in front of all props",
          );
          const view = t.target.clone().sub(t.camera.position).normalize();
          assert.ok(
            view.z < -0.9,
            "camera never turns edge-on or behind paper",
          );
        }
        assert.equal(t.state.phase, "scene");
        const s = c.stops[i];
        if (s.actor) {
          const p = CAST.find((p) => p.id === s.actor);
          assert.equal(p.section, c.id);
          assert.ok(s.lines.length >= 2);
          t.camera.updateMatrixWorld();
          const projected = new Vector3(p.x, p.y + p.h * 0.5, p.z).project(
            t.camera,
          );
          assert.ok(
            Math.abs(projected.x) < 0.8 && Math.abs(projected.y) < 0.8,
            `${s.actor} visible at ${aspect}`,
          );
        }
      }
      t.move(1);
      assert.equal(t.state.stop, c.stops.length - 1, "cannot walk off rail");
    }
  }
});

test("pause freezes a journey, resume completes it, painting view interrupts safely", () => {
  const t = create();
  t.enter();
  settle(t);
  t.move(1);
  t.update(0.3);
  t.pause();
  const p = t.camera.position.clone();
  settle(t);
  assert.ok(p.equals(t.camera.position));
  assert.equal(t.state.phase, "paused");
  t.resume();
  settle(t);
  assert.equal(t.state.phase, "scene");
  assert.equal(t.state.stop, 1);
  t.nextLine();
  assert.equal(t.state.line, 1);
  t.move(1);
  t.showPainting();
  assert.equal(t.state.phase, "plate");
  assert.equal(t.travel, null);
  t.enter();
  settle(t);
  assert.equal(t.state.phase, "scene");
  assert.equal(t.state.stop, 2);
});

test("reduced motion and resize keep rail/state consistent, subscribers detach", () => {
  const t = create(0.46, true);
  let calls = 0;
  const unsub = t.subscribe(() => calls++);
  t.enter();
  assert.equal(t.state.phase, "scene");
  t.move(1);
  assert.equal(t.state.phase, "scene");
  assert.equal(t.travel, null);
  const p = t.camera.position.clone();
  settle(t);
  assert.ok(p.equals(t.camera.position));
  t.reducedMotion = false;
  t.move(1);
  t.pause();
  t.camera.aspect = 1.5;
  t.resize();
  t.resume();
  assert.equal(t.state.phase, "scene");
  t.move(-1);
  t.camera.aspect = 0.46;
  t.resize();
  assert.equal(t.state.phase, "scene");
  unsub();
  const count = calls;
  t.showPainting();
  assert.equal(calls, count);
  t.dispose();
});

test("chair fronts clear their paper sitters and occupied couches clear outer silhouettes", () => {
  const ids = [
    "li-jiaming",
    "guest-listen-front",
    "red-guest-dance",
    "han-winds",
    "farewell-seated",
    "winds-clapper",
  ];
  for (let i = 0; i < SEATS.length; i++) {
    const s = SEATS[i],
      p = CAST.find((p) => p.id === ids[i]);
    const extent =
      s.kind === "stool"
        ? 0.3
        : (Math.abs(Math.sin(s.angle ?? 0)) * (s.w ?? 0.67)) / 2 +
          (Math.abs(Math.cos(s.angle ?? 0)) * (s.d ?? 0.59)) / 2;
    assert.ok(
      s.z + extent < p.z - 0.035,
      `${p.id}: furniture crosses paper plane`,
    );
  }
  for (const id of [
    "rest-lady-a",
    "rest-lady-b",
    "rest-lady-c",
    "rest-lady-d",
    "han-rest",
  ]) {
    const p = CAST.find((p) => p.id === id),
      b = BEDS.find((b) => b.id === "rest-couch"),
      half =
        (p.h * (p.frameSize ?? p.rect.slice(2))[0]) /
        (p.frameSize ?? p.rect.slice(2))[1] /
        2;
    assert.ok(
      p.x - half > b.x - b.w / 2 + 0.03 && p.x + half < b.x + b.w / 2 - 0.03,
      id,
    );
  }
});
