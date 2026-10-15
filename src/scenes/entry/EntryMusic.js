import { SceneMusic } from "../../audio/SceneMusic.js";
import { compileScore } from "../../audio/score.js";

// Original pentatonic composition. No recordings or third-party melodies.
export const ENTRY_SCORE = [{
  title: "展卷听风",
  color: "筝音疏落，笛声轻答",
  bpm: 54, lead: "zheng", strength: 0.66,
  melody: [
    [0, 57, 2], [3, 62, 2], [7, 64, 2], [11, 69, 2],
    [16, 66, 3], [21, 64, 2], [25, 62, 3], [30, 57, 2],
    [34, 62, 2], [38, 66, 2], [42, 69, 3], [47, 64, 2],
    [52, 62, 3], [57, 59, 2], [61, 57, 2],
  ],
  answer: [[5, 74, 3], [23, 71, 3], [39, 69, 3], [55, 74, 3]],
  bass: [[0, 45], [16, 50], [32, 47], [48, 45]],
}];
export const entryScore = () => compileScore(ENTRY_SCORE[0]);

export class EntryMusic extends SceneMusic {
  constructor() {
    const ambience = { state: { chapter: 0, phase: "scene" }, subscribe: () => () => {} };
    super(ambience, { scoreForChapter: entryScore, storageKey: "entry-music-v1", volume: 0.22 });
  }
}
