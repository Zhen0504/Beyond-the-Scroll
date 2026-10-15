// Compile authored note phrases without changing the source score.
export function compileScore(score, index = 0) {
  const beat = 60 / score.bpm;
  const events = [];
  const add = (notes, instrument, strength) =>
    notes.forEach(([b, pitch, length = 2, velocity = 1], i) => {
      // Tiny, deterministic timing and touch differences; no metronomic attacks.
      const human = b === 0 ? 0 : Math.sin(i * 2.37 + index) * 0.022;
      events.push({
        time: b * beat + human,
        pitch,
        duration: length * beat,
        instrument,
        strength: strength * velocity * (0.94 + 0.06 * Math.cos(i * 1.7)),
      });
    });
  add(score.melody, score.lead, score.strength);
  add(
    score.answer,
    score.lead === "flute" ? "zheng" : "flute",
    score.lead === "flute" ? 0.45 : 0.36,
  );
  add(score.bass, "zheng", 0.43);
  return {
    ...score,
    duration: (score.beats ?? 64) * beat,
    events: events.sort((a, b) => a.time - b.time),
  };
}
