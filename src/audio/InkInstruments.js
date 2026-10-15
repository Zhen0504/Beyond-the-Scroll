// Small, self-contained instrument palette. All sound is generated here;
// no recordings, remote downloads, or historical-performance claims.
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const random = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
};

function zhengBuffer(context, pitch) {
  const rate = context.sampleRate,
    f = frequency(pitch);
  const buffer = context.createBuffer(1, Math.ceil(rate * 4.8), rate);
  const out = buffer.getChannelData(0);
  // Independently decaying string modes: bright fingertip, warm sustained body.
  // Slight inharmonicity suggests a long plucked string. Pitch relaxation is
  // applied by the audio source, keeping sample generation off expensive trig loops.
  const modes = [1, 0.51, 0.3, 0.19, 0.12, 0.08, 0.045, 0.028];
  for (let m = 0; m < modes.length; m++) {
    const n = m + 1;
    const hz = f * n * Math.sqrt(1 + 0.000025 * n * n);
    const decay = (1.45 - (pitch - 50) * 0.012) / (1 + m * 0.3);
    const step = Math.exp(-1 / (rate * decay));
    const rotation = (2 * Math.PI * hz) / rate;
    const realStep = Math.cos(rotation) * step;
    const imaginaryStep = Math.sin(rotation) * step;
    let real = 0,
      imaginary = modes[m];
    for (let i = 0; i < out.length; i++) {
      const next = real * realStep + imaginary * imaginaryStep;
      imaginary = imaginary * realStep - real * imaginaryStep;
      real = next;
      out[i] += real;
    }
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] *=
      Math.min(1, i / (rate * 0.006)) *
      Math.min(1, (out.length - 1 - i) / (rate * 0.18));
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < out.length; i++) out[i] *= 0.72 / peak;
  return buffer;
}

export class InkInstruments {
  constructor(context, destination) {
    this.context = context;
    this.buffers = new Map();
    this.voices = new Set();
    this.input = context.createGain();
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4200;
    lowpass.Q.value = 0.3;
    this.input.connect(lowpass);
    lowpass.connect(destination);
    const room = context.createConvolver(),
      wet = context.createGain();
    const impulse = context.createBuffer(
      2,
      context.sampleRate * 1.8,
      context.sampleRate,
    );
    const noise = random(9127);
    for (let c = 0; c < 2; c++) {
      const channel = impulse.getChannelData(c);
      let smooth = 0;
      for (let i = 0; i < channel.length; i++) {
        smooth = smooth * 0.65 + noise() * 0.35;
        channel[i] =
          smooth *
          Math.exp((-i / context.sampleRate) * 4) *
          Math.min(1, i / 600);
      }
    }
    room.buffer = impulse;
    wet.gain.value = 0.13;
    lowpass.connect(room);
    room.connect(wet);
    wet.connect(destination);
    this.nodes = [this.input, lowpass, room, wet];
    this.fluteWave = context.createPeriodicWave(
      new Float32Array(7),
      new Float32Array([0, 1, 0.27, 0.13, 0.055, 0.028, 0.012]),
    );
    this.breath = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const data = this.breath.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = noise();
  }

  play(event, time, destination = this.input) {
    const c = this.context,
      nodes = [],
      sources = [];
    const gain = c.createGain(),
      pan = c.createStereoPanner();
    gain.connect(pan);
    pan.pan.value = event.instrument === "flute" ? 0.16 : -0.13;
    pan.connect(destination);
    nodes.push(gain, pan);
    let end;
    if (event.instrument === "zheng") {
      if (!this.buffers.has(event.pitch))
        this.buffers.set(event.pitch, zhengBuffer(c, event.pitch));
      const source = c.createBufferSource();
      source.buffer = this.buffers.get(event.pitch);
      source.detune.setValueAtTime(3.1, time);
      source.detune.linearRampToValueAtTime(0, time + 0.22);
      gain.gain.value = event.strength * 0.72;
      source.connect(gain);
      source.start(time);
      end = time + source.buffer.duration;
      sources.push(source);
    } else {
      const oscillator = c.createOscillator(),
        vibrato = c.createOscillator();
      const depth = c.createGain(),
        breath = c.createBufferSource();
      const air = c.createBiquadFilter(),
        airGain = c.createGain();
      oscillator.setPeriodicWave(this.fluteWave);
      oscillator.frequency.setValueAtTime(frequency(event.pitch), time);
      oscillator.detune.setValueAtTime(-9, time);
      oscillator.detune.linearRampToValueAtTime(0, time + 0.16);
      vibrato.frequency.value = 4.7;
      depth.gain.setValueAtTime(0, time);
      depth.gain.linearRampToValueAtTime(6, time + 0.65);
      vibrato.connect(depth);
      depth.connect(oscillator.detune);
      breath.buffer = this.breath;
      breath.loop = true;
      air.type = "bandpass";
      air.frequency.value = 1900;
      air.Q.value = 0.65;
      airGain.gain.value = 0.018;
      breath.connect(air);
      air.connect(airGain);
      airGain.connect(gain);
      oscillator.connect(gain);
      const level = event.strength * 0.32;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(level, time + 0.16);
      gain.gain.linearRampToValueAtTime(
        level * 0.85,
        time + event.duration * 0.7,
      );
      gain.gain.linearRampToValueAtTime(0, time + event.duration + 0.22);
      end = time + event.duration + 0.25;
      sources.push(oscillator, vibrato, breath);
      nodes.push(depth, air, airGain);
      sources.forEach((source) => {
        source.start(time);
        source.stop(end);
      });
    }
    nodes.push(...sources);
    const voice = { sources, nodes, end };
    this.voices.add(voice);
    sources[0].onended = () => {
      nodes.forEach((node) => node.disconnect());
      this.voices.delete(voice);
    };
    return voice;
  }

  clear() {
    this.voices.forEach(({ sources, nodes }) => {
      sources.forEach((source) => {
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* Already ended. */
        }
      });
      nodes.forEach((node) => node.disconnect());
    });
    this.voices.clear();
  }

  dispose() {
    this.clear();
    this.nodes.forEach((node) => node.disconnect());
    this.buffers.clear();
  }
}
