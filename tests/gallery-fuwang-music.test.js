import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTRY_SCORE, entryScore } from '../src/scenes/entry/EntryMusic.js';
import { FUWANG_SCORE, fuwangScore } from '../src/scenes/world/fuwang/FuwangMusic.js';
import { CHAPTERS } from '../src/scenes/world/fuwang/story.js';

test('画廊与鹿王五折旋律各异，乐句有换气和循环的余地', () => {
  assert.equal(FUWANG_SCORE.length, CHAPTERS.length);
  const written = [...ENTRY_SCORE, ...FUWANG_SCORE];
  assert.equal(new Set(written.map((s) => JSON.stringify(s.melody))).size, 6);
  const pentatonic = new Set([2, 4, 6, 9, 11]);
  for (const score of [entryScore(), ...FUWANG_SCORE.map((_, i) => fuwangScore(i))]) {
    assert.ok(score.duration >= 55 && score.duration <= 75);
    for (const [i, note] of score.events.entries()) {
      assert.ok(Number.isFinite(note.time) && note.time >= 0);
      assert.ok(note.duration > 0 && note.time + note.duration < score.duration);
      assert.ok(note.strength > 0 && note.strength <= 0.7);
      assert.ok(note.pitch >= 45 && note.pitch <= 76 && pentatonic.has(note.pitch % 12));
      assert.ok(['flute', 'zheng'].includes(note.instrument));
      if (i) assert.ok(note.time >= score.events[i - 1].time);
    }
    const flute = score.events.filter((n) => n.instrument === 'flute');
    assert.ok(flute.length);
    flute.forEach((note, i) => {
      const next = flute[i + 1]?.time ?? score.duration + flute[0].time;
      assert.ok(note.time + note.duration + 0.22 < next, `${score.title} 应留出笛声换气`);
    });
  }
});

test('换折及重访不修改乐谱，未知折回到第一折', () => {
  const before = JSON.stringify([ENTRY_SCORE, FUWANG_SCORE]);
  const gallery = entryScore(), cave = fuwangScore(4);
  gallery.events[0].pitch = 0;
  cave.events[0].pitch = 0;
  assert.notEqual(entryScore().events[0].pitch, 0);
  assert.notEqual(fuwangScore(4).events[0].pitch, 0);
  assert.equal(JSON.stringify([ENTRY_SCORE, FUWANG_SCORE]), before);
  for (const invalid of [-1, 5, NaN, undefined, '2']) {
    assert.deepEqual(fuwangScore(invalid), fuwangScore(0));
  }
});
