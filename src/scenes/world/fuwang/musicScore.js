// 卷三原创五声音景：只借用笛、筝的听觉意象，不复原或冒称历史乐曲。
// 音符格式：[拍点, MIDI 音高, 时值（拍）, 可选力度]。
export const FUWANG_MUSIC_SCORE = [
  {
    title: '寒流微光',
    color: '低笛如水，疏筝映出鹿背上的微光',
    bpm: 48,
    lead: 'flute',
    strength: 0.46,
    melody: [[0, 62, 3], [8, 66, 3], [16, 69, 4], [26, 66, 3], [34, 64, 3], [43, 62, 4], [54, 59, 3]],
    answer: [[5, 50, 2], [13, 57, 2], [22, 54, 2], [31, 57, 2], [40, 52, 2], [49, 54, 2], [59, 50, 2]],
    bass: [[0, 50], [16, 54], [32, 47], [48, 50]],
  },
  {
    title: '山誓余音',
    color: '弦声克制，笛音在山石之间一问一答',
    bpm: 50,
    lead: 'zheng',
    strength: 0.5,
    melody: [[0, 57, 2], [5, 62, 2], [11, 64, 2], [17, 62, 3], [25, 59, 2], [32, 62, 2], [39, 66, 2], [47, 64, 3], [56, 62, 3]],
    answer: [[7, 69, 3], [23, 71, 3], [40, 69, 3], [57, 66, 3]],
    bass: [[0, 50], [16, 47], [32, 50], [48, 54]],
  },
  {
    title: '宫阙远闻',
    color: '长音留白，宫阙与告密者在远近之间浮现',
    bpm: 46,
    lead: 'flute',
    strength: 0.43,
    melody: [[0, 59, 4], [10, 62, 3], [20, 66, 4], [31, 64, 3], [40, 62, 4], [51, 57, 4]],
    answer: [[6, 50, 2], [16, 54, 2], [27, 57, 2], [36, 54, 2], [47, 50, 2], [58, 47, 2]],
    bass: [[0, 47], [16, 50], [32, 45], [48, 47]],
  },
  {
    title: '车马入山',
    color: '筝音渐密而不喧闹，笛声掠过山峦',
    bpm: 58,
    lead: 'zheng',
    strength: 0.52,
    melody: [[0, 62, 1.5], [4, 66, 1.5], [8, 69, 2], [13, 66, 1.5], [18, 64, 2], [24, 62, 2], [30, 66, 1.5], [35, 69, 2], [41, 71, 2], [47, 69, 2], [53, 66, 2], [59, 62, 2]],
    answer: [[6, 74, 2.5], [22, 71, 3], [39, 74, 2.5], [55, 69, 3]],
    bass: [[0, 50], [16, 54], [32, 57], [48, 50]],
  },
  {
    title: '鹿鸣陈情',
    color: '笛声平静而清亮，末尾落回一线低弦',
    bpm: 48,
    lead: 'flute',
    strength: 0.47,
    melody: [[0, 62, 4], [9, 66, 3], [18, 69, 4], [29, 71, 3], [38, 69, 4], [49, 64, 4], [59, 62, 3]],
    answer: [[5, 50, 2], [14, 54, 2], [25, 57, 2], [34, 54, 2], [45, 52, 2], [55, 50, 2]],
    bass: [[0, 50], [16, 47], [32, 45], [48, 50]],
  },
];

export function fuwangChapterScore(index) {
  if (!FUWANG_MUSIC_SCORE[index]) index = 0;
  const score = FUWANG_MUSIC_SCORE[index];
  const beat = 60 / score.bpm;
  const events = [];
  const add = (notes, instrument, strength) => {
    notes.forEach(([b, pitch, length = 2, velocity = 1], i) => {
      const human = b === 0 ? 0 : Math.sin(i * 2.17 + index * 0.8) * 0.018;
      events.push({
        time: b * beat + human,
        pitch,
        duration: length * beat,
        instrument,
        strength: strength * velocity * (0.95 + 0.05 * Math.cos(i * 1.31)),
      });
    });
  };
  add(score.melody, score.lead, score.strength);
  add(score.answer, score.lead === 'flute' ? 'zheng' : 'flute', score.lead === 'flute' ? 0.32 : 0.34);
  add(score.bass, 'zheng', 0.32);
  return {
    ...score,
    duration: 64 * beat,
    events: events.sort((a, b) => a.time - b.time),
  };
}
