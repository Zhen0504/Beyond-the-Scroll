/** Equal-power region mixing, using the map's own boundaries. */
export function regionWeights(x, boundaries, halfWidth = 12) {
  const weights = Array(boundaries.length + 1).fill(0);
  for (let i = 0; i < boundaries.length; i++) {
    const edge = boundaries[i];
    if (x < edge - halfWidth) { weights[i] = 1; return weights; }
    if (x < edge + halfWidth) {
      const t = (x - edge + halfWidth) / (2 * halfWidth);
      weights[i] = Math.cos(t * Math.PI / 2);
      weights[i + 1] = Math.sin(t * Math.PI / 2);
      return weights;
    }
  }
  weights[weights.length - 1] = 1;
  return weights;
}

// RMS balancing only attenuates: do not boost quiet passages or change the MP3.
export function playbackLevel(buffer) {
  let energy = 0, count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += 8) { energy += data[i] * data[i]; count++; }
  }
  const rms = Math.sqrt(energy / Math.max(1, count));
  return rms > 0 ? Math.min(1, 0.06 / rms) : 1;
}

// Loop begins after the intro. Its end blends the original tail with the intro,
// so the seam continues into sample `overlap`, rather than repeating the head.
export function makeLoop(context, buffer) {
  const n = buffer.length;
  const overlap = Math.min(Math.round(buffer.sampleRate * 2), Math.floor(n / 4));
  if (overlap < 2) return { buffer, intro: 0 };
  const loop = context.createBuffer(buffer.numberOfChannels, n - overlap, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch), output = loop.getChannelData(ch);
    output.set(input.subarray(overlap, n - overlap));
    for (let i = 0; i < overlap; i++) {
      const angle = i / (overlap - 1) * Math.PI / 2;
      // Conservative headroom during correlated equal-power overlap.
      output[n - 2 * overlap + i] = (input[n - overlap + i] * Math.cos(angle) + input[i] * Math.sin(angle)) / Math.SQRT2;
    }
    // Apply matching headroom to the non-overlap segment.
    for (let i = 0; i < n - 2 * overlap; i++) output[i] /= Math.SQRT2;
  }
  return { buffer: loop, intro: overlap / buffer.sampleRate };
}

export class RegionMusic {
  constructor({ urls, boundaries, environment = globalThis }) {
    this.env = environment;
    this.urls = urls;
    this.boundaries = boundaries;
    this.listeners = new Set();
    this.abort = new AbortController();
    this.tracks = urls.map(() => ({ phase: 0, nodes: [], target: 0, silentAt: null }));
    this.weights = regionWeights(-Infinity, boundaries);
    this.disposed = false;
    this.playing = false;
    this.reading = false;
    this.timer = null;
    let prefs = {};
    try { prefs = JSON.parse(environment.localStorage?.getItem('jiangshan-music') || '{}'); } catch { /* storage optional */ }
    this.state = { volume: Number.isFinite(prefs.volume) ? Math.max(0, Math.min(1, prefs.volume)) : 0.35,
      enabled: prefs.enabled !== false, loading: true, failed: [], unavailable: false, blocked: false, region: 0 };
    const AudioContext = environment.AudioContext || environment.webkitAudioContext;
    if (!AudioContext) {
      this.state = { ...this.state, loading: false, unavailable: true };
      return;
    }
    try {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      for (const track of this.tracks) {
        track.gain = this.context.createGain();
        track.gain.gain.value = 0;
        track.level = this.context.createGain();
        track.gain.connect(track.level);
        track.level.connect(this.master);
      }
      this.visibility = () => {
        if (environment.document.hidden) {
          this.clearPause();
          this.master.gain.cancelScheduledValues(this.context.currentTime);
          this.master.gain.setValueAtTime(0, this.context.currentTime);
          this.masterTarget = null;
          this.tracks.forEach(t => this.stopTrack(t));
        } else this.sync();
      };
      environment.document?.addEventListener('visibilitychange', this.visibility);
      this.loadPromise = this.load();
    } catch {
      this.state = { ...this.state, loading: false, unavailable: true };
      void this.context?.close().catch(() => {});
    }
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => fn());
  }
  async load() {
    this.publish({ loading: true });
    await Promise.all(this.tracks.map(async (track, i) => {
      if (track.original) return;
      try {
        const response = await this.env.fetch(this.urls[i], { signal: this.abort.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (this.disposed) return;
        const original = await this.context.decodeAudioData(bytes);
        if (this.disposed) return;
        const loop = makeLoop(this.context, original);
        track.level.gain.value = playbackLevel(original);
        track.original = original;
        track.loop = loop.buffer;
        track.intro = loop.intro;
        track.error = false;
        this.sync();
      } catch { if (!this.disposed) track.error = true; }
    }));
    this.publish({ loading: false, failed: this.tracks.flatMap((t,i) => t.error ? [i] : []) });
  }
  retry = () => {
    if (!this.context || this.disposed || this.state.loading) return;
    this.loadPromise = this.load();
    this.unlock();
  };
  unlock = () => {
    if (!this.context || this.disposed) return;
    // Called directly from the entry click, before requesting pointer lock.
    void this.context.resume().then(() => {
      if (this.disposed) return;
      this.publish({ blocked: this.context.state !== 'running' });
      this.sync();
    }).catch(() => this.publish({ blocked: true }));
  };
  active() {
    return !this.disposed && this.playing && !this.env.document?.hidden && this.context?.state === 'running';
  }
  clearPause() { if (this.timer !== null) this.env.clearTimeout(this.timer); this.timer = null; }
  setPlaying(playing) {
    if (this.disposed || !this.context) return;
    this.playing = playing;
    this.clearPause();
    if (playing) { this.sync(); return; }
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.06);
    this.masterTarget = null;
    this.timer = this.env.setTimeout(() => {
      this.timer = null;
      if (!this.playing && !this.disposed) this.tracks.forEach(t => this.stopTrack(t));
    }, 400);
  }
  save() {
    try { this.env.localStorage?.setItem('jiangshan-music', JSON.stringify({ volume: this.state.volume, enabled: this.state.enabled })); } catch { /* optional */ }
  }
  setVolume = (volume) => {
    if (!Number.isFinite(volume)) return;
    this.publish({ volume: Math.max(0, Math.min(1, volume)) }); this.save(); this.sync();
  };
  setEnabled = (enabled) => { this.publish({ enabled: !!enabled }); this.save(); this.sync(); };
  update(x, reading = false) {
    if (this.disposed || !this.context) return;
    this.weights = regionWeights(x, this.boundaries);
    this.reading = reading;
    const region = this.boundaries.findIndex(edge => x <= edge);
    const index = region < 0 ? this.tracks.length - 1 : region;
    if (index !== this.state.region) this.publish({ region: index });
    this.sync();
  }
  startTrack(track) {
    if (track.nodes.length || !track.original) return;
    const now = this.context.currentTime;
    track.startedAt = now;
    let delay = 0;
    if (track.phase < track.intro) {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = 1 / Math.SQRT2;
      source.buffer = track.original;
      source.connect(gain); gain.connect(track.gain);
      delay = track.intro - track.phase;
      source.start(now, track.phase, delay);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      track.nodes.push(source);
    }
    const source = this.context.createBufferSource();
    source.buffer = track.loop;
    source.loop = true;
    source.connect(track.gain);
    const offset = track.phase < track.intro ? 0 : (track.phase - track.intro) % track.loop.duration;
    source.start(now + delay, offset);
    source.onended = () => source.disconnect();
    track.nodes.push(source);
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(0, now);
    track.target = 0;
  }
  stopTrack(track) {
    if (!track.nodes.length) return;
    track.phase += Math.max(0, this.context.currentTime - track.startedAt);
    if (track.phase >= track.intro) track.phase = track.intro + (track.phase - track.intro) % track.loop.duration;
    for (const node of track.nodes) { try { node.stop(); } catch { /* already ended intro */ } node.disconnect(); }
    track.nodes = [];
    track.target = 0;
    track.gain.gain.cancelScheduledValues(this.context.currentTime);
    track.gain.gain.setValueAtTime(0, this.context.currentTime);
  }
  sync() {
    if (!this.active()) return;
    const now = this.context.currentTime;
    const master = this.state.enabled ? this.state.volume * (this.reading ? 0.65 : 1) : 0;
    if (master !== this.masterTarget) {
      this.masterTarget = master;
      this.master.gain.setTargetAtTime(master, now, 0.2);
    }
    this.tracks.forEach((track,i) => {
      const weight = this.weights[i];
      if (weight > 0 && track.original) {
        this.startTrack(track);
        track.silentAt = null;
      }
      if (weight !== track.target) {
        track.target = weight;
        track.gain.gain.setTargetAtTime(weight, now, 0.15);
      }
      if (weight === 0 && track.nodes.length) {
        track.silentAt ??= now;
        if (now - track.silentAt > 1.2) this.stopTrack(track);
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPause(); this.abort.abort();
    this.env.document?.removeEventListener('visibilitychange', this.visibility);
    if (this.context) {
      this.tracks.forEach(track => { this.stopTrack(track); track.gain?.disconnect(); track.level?.disconnect(); track.original = track.loop = null; });
      this.master?.disconnect();
      void this.context.close().catch(() => {});
    }
    this.listeners.clear();
  }
}


