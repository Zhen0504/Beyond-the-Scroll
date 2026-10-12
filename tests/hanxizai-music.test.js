import assert from "node:assert/strict";
import test from "node:test";
import {
  MUSIC_SCORE,
  chapterScore,
} from "../src/scenes/world/hanxizai/musicScore.js";

test("five original scores have distinct melodies, bounded notes and room to breathe", () => {
  assert.equal(MUSIC_SCORE.length, 5);
  assert.equal(
    new Set(MUSIC_SCORE.map((s) => s.melody.map((n) => n[1]).join())).size,
    5,
  );
  const pentatonic = new Set([2, 4, 6, 9, 11]);
  MUSIC_SCORE.forEach((_, chapter) => {
    const score = chapterScore(chapter);
    assert.ok(score.duration >= 48 && score.duration <= 75);
    for (const [i, note] of score.events.entries()) {
      assert.ok(
        Number.isFinite(note.time) &&
          note.time >= 0 &&
          note.time < score.duration,
      );
      assert.ok(note.duration > 0 && note.duration < 6);
      assert.ok(note.strength > 0 && note.strength <= 1);
      assert.ok(
        note.pitch >= 45 && note.pitch <= 76 && pentatonic.has(note.pitch % 12),
      );
      assert.ok(["flute", "zheng"].includes(note.instrument));
      if (i) assert.ok(note.time >= score.events[i - 1].time);
    }
    const breaths = score.events.filter((note) => note.instrument === "flute");
    assert.ok(breaths.length > 0);
    breaths.forEach((note, i) => {
      const next = breaths[i + 1]?.time ?? score.duration + breaths[0].time;
      assert.ok(
        note.time + note.duration + 0.22 < next,
        `${score.title}: leave room for the flute's release and breath`,
      );
    });
  });
});

test("chapter music supports repeated visits without mutating the written score", () => {
  const original = JSON.stringify(MUSIC_SCORE);
  const first = chapterScore(0);
  first.events[0].pitch = 0;
  assert.notEqual(chapterScore(0).events[0].pitch, 0);
  assert.equal(JSON.stringify(MUSIC_SCORE), original);
  assert.deepEqual(chapterScore(99), chapterScore(0));
});
