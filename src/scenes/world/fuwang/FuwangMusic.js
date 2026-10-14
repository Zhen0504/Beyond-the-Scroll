import { NightMusic } from '../hanxizai/NightMusic.js';
import { fuwangChapterScore } from './musicScore.js';

export class FuwangMusic extends NightMusic {
  constructor(tour) {
    super(tour, {
      storageKey: 'fuwang-music-v1',
      scoreFor: fuwangChapterScore,
      defaultVolume: 0.22,
      masterScale: 0.38,
    });
  }
}
