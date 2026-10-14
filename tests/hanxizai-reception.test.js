import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTERS } from "../src/scenes/world/hanxizai/story.js";
import { REFERENCES } from "../src/scenes/world/hanxizai/history.js";
import {
  LETTERS,
  RECEPTION_TIMELINE,
  TAKEAWAYS,
  collectLetter,
  restoreReception,
} from "../src/scenes/world/hanxizai/reception.js";

test("the reception thread reaches every guided stop and its evidence resolves to sources", () => {
  assert.equal(LETTERS.length, CHAPTERS.length);
  assert.equal(new Set(LETTERS.map((l) => l.id)).size, LETTERS.length);
  LETTERS.forEach((letter, i) => {
    assert.equal(letter.chapter, CHAPTERS[i].id);
    assert.equal(letter.prompts.length, CHAPTERS[i].stops.length);
    assert.ok(letter.prompts.every(Boolean));
    assert.ok(
      letter.observation && letter.boundary && letter.reply && letter.next,
    );
    for (const paragraph of letter.paragraphs) {
      assert.ok(paragraph.text && paragraph.refs.length);
      for (const ref of paragraph.refs)
        assert.ok(REFERENCES[ref]?.url.startsWith("https://"), ref);
    }
  });
  RECEPTION_TIMELINE.forEach((entry) => {
    assert.ok(LETTERS[entry.letter]);
    assert.ok(entry.refs.length);
    entry.refs.forEach((ref) => assert.ok(REFERENCES[ref]?.url, ref));
  });
});

test("reading progress discards malformed or obsolete persisted values", () => {
  for (const value of [null, false, "seal", [], 4])
    assert.deepEqual(restoreReception(value), { read: [], takeaway: null });
  assert.deepEqual(restoreReception({ read: "seal", takeaway: {} }), {
    read: [],
    takeaway: null,
  });
  const restored = restoreReception({
    read: ["rereading", "unknown", "seal", "seal", null],
    takeaway: "evidence",
    other: true,
  });
  assert.deepEqual(restored, {
    read: ["seal", "rereading"],
    takeaway: "evidence",
  });
  for (const takeaway of TAKEAWAYS)
    assert.equal(
      restoreReception({ takeaway: takeaway.id }).takeaway,
      takeaway.id,
    );
});

test("collecting a letter is idempotent and keeps the visitor's chosen reflection", () => {
  const initial = { read: [], takeaway: "care" };
  assert.equal(collectLetter(initial, "obsolete"), initial);
  let progress = initial;
  for (const letter of LETTERS) {
    const next = collectLetter(progress, letter.id);
    assert.notEqual(next, progress);
    assert.equal(collectLetter(next, letter.id), next);
    progress = next;
  }
  assert.equal(progress.read.length, 5);
  assert.equal(progress.takeaway, "care");
  assert.deepEqual(initial, { read: [], takeaway: "care" });
  assert.deepEqual(
    restoreReception(JSON.parse(JSON.stringify(progress))),
    progress,
  );
});
