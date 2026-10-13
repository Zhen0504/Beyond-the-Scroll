import { mulberry32 } from '../../utils/math.js';

export function scrollMotionLevel(previous, current, seconds) {
  if (!(seconds > 0)) return 0;
  const speed = (Math.abs(current.open - previous.open) + Math.abs(current.spin - previous.spin) * 0.12) / seconds;
  return Math.min(0.12, speed * 0.14);
}

/** Quiet synthesized silk friction and a short, damped wooden roller sound. */
export class ScrollSound {
  constructor(environment = globalThis) {
    this.env = environment;
    this.voices = new Set();
    this.active = false;
    this.disposed = false;
    this.timer = null;
    this.onVisibility = () => { if (this.env.document?.hidden) this.stop(true); };
    environment.document?.addEventListener('visibilitychange', this.onVisibility);
  }
  unlock() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        const Context = this.env.AudioContext || this.env.webkitAudioContext;
        if (!Context) return;
        this.context = new Context();
        const sampleRate = this.context.sampleRate;
        this.paperBuffer = this.context.createBuffer(1, sampleRate, sampleRate);
        const data = this.paperBuffer.getChannelData(0), random = mulberry32(7219);
        let soft = 0;
        for (let i = 0; i < data.length; i++) {
          const white = random() * 2 - 1;
          soft = soft * 0.93 + white * 0.07;
          data[i] = (soft * 1.7 + white * 0.16) * (0.8 + 0.2 * Math.sin(i / sampleRate * Math.PI * 12));
        }
      }
      void this.context.resume().then(() => {
        if (!this.disposed && this.active && !this.env.document?.hidden) this.startPaper();
      }).catch(() => {});
    } catch { /* Sound is optional; scroll animation must still work. */ }
  }
  now() { return this.env.performance.now() / 1000; }
  begin(state) {
    if (this.disposed) return;
    this.stop(true);
    this.active = true;
    this.previous = { open: state.open, spin: state.spin };
    this.last = this.now();
    if (this.context?.state === 'running' && !this.env.document?.hidden) this.startPaper();
  }
  startPaper() {
    if (this.paper || !this.active || this.disposed) return;
    const source = this.context.createBufferSource();
    source.buffer = this.paperBuffer; source.loop = true;
    const high = this.context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 170;
    const low = this.context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 2100;
    const gain = this.context.createGain(); gain.gain.value = 0;
    source.connect(high); high.connect(low); low.connect(gain); gain.connect(this.context.destination);
    const voice = { source, gain, filters: [high, low] };
    this.paper = voice; this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start();
  }
  update(state) {
    if (!this.active || this.disposed) return;
    if (this.env.document?.hidden) { this.stop(true); return; }
    const now = this.now();
    const level = scrollMotionLevel(this.previous, state, now - this.last);
    this.previous = { open: state.open, spin: state.spin }; this.last = now;
    if (this.context?.state === 'running') {
      this.startPaper();
      this.paper?.gain.gain.setTargetAtTime(level, this.context.currentTime, 0.035);
    }
  }
  tap() {
    if (this.disposed || !this.active || this.env.document?.hidden || this.context?.state !== 'running') return;
    const source = this.context.createOscillator(); source.type = 'triangle';
    const gain = this.context.createGain(), now = this.context.currentTime;
    source.frequency.setValueAtTime(185, now);
    source.frequency.exponentialRampToValueAtTime(95, now + 0.12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    source.connect(gain); gain.connect(this.context.destination);
    const voice = { source, gain, filters: [] };
    this.voices.add(voice); source.onended = () => this.release(voice);
    source.start(now); source.stop(now + 0.2);
  }
  release(voice) {
    voice.source.disconnect(); voice.gain.disconnect(); voice.filters.forEach(f => f.disconnect());
    this.voices.delete(voice); if (this.paper === voice) this.paper = null;
  }
  finishVoices() {
    for (const voice of [...this.voices]) {
      try { voice.source.stop(); } catch { /* A completed short sound may already have stopped. */ }
      this.release(voice);
    }
  }
  stop(immediate = false) {
    this.active = false;
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    if (immediate || !this.context) { this.finishVoices(); return; }
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.025);
    }
    this.timer = this.env.setTimeout(() => { this.timer = null; this.finishVoices(); }, 180);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop(true);
    this.env.document?.removeEventListener('visibilitychange', this.onVisibility);
    void this.context?.close().catch(() => {});
    this.paperBuffer = null;
  }
}
