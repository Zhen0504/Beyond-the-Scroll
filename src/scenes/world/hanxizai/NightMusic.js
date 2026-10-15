import { SceneMusic } from "../../../audio/SceneMusic.js";
import { chapterScore } from "./musicScore.js";

export const DEFAULT_VOLUME = 0.28;

export class NightMusic extends SceneMusic {
  constructor(tour) {
    super(tour, {
      scoreForChapter: chapterScore,
      storageKey: "hanxizai-music-v1",
      volume: DEFAULT_VOLUME,
    });
  }
}
