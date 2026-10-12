import { chapterScore } from "./musicScore.js";
import { NightInstruments } from "./musicInstruments.js";

const STORAGE = "hanxizai-music-v1";
export const DEFAULT_VOLUME = 0.28;

function soften(param, value, now, seconds = 0.45) {
  // setTargetAtTime preserves continuity, including rapid consecutive changes.
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, seconds);
}

export class NightMusic {
  constructor(tour) {
    this.tour = tour;
    this.listeners = new Set();
    this.retired = new Set();
    this.state = {
      enabled: true,
      volume: DEFAULT_VOLUME,
      status: "waiting",
      chapter: 0,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE));
      if (typeof saved?.enabled === "boolean")
        this.state.enabled = saved.enabled;
      if (Number.isFinite(saved?.volume))
        this.state.volume = Math.max(0, Math.min(1, saved.volume));
    } catch {
      /* Storage is optional. */
    }
    this.active = false;
    this.position = 0;
    this.chapter = tour.state.chapter;
    this.unsubscribe = tour.subscribe(() => this.sync());
    this.onVisibility = () => this.sync();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  publish(patch) {
    if (
      Object.entries(patch).every(([key, value]) => this.state[key] === value)
    )
      return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  save() {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          enabled: this.state.enabled,
          volume: this.state.volume,
        }),
      );
    } catch {
      /* Private browsing may disable storage. */
    }
  }
  shouldPlay() {
    return (
      !this.disposed &&
      this.active &&
      this.unlocked &&
      this.state.enabled &&
      this.state.volume > 0 &&
      !document.hidden &&
      this.tour.state.phase !== "paused"
    );
  }

  // Called directly by entry / sound controls so browser activation is retained.
  activate() {
    if (this.disposed || !this.state.enabled || this.state.volume === 0) return;
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
          this.publish({ status: "unavailable" });
          return;
        }
        this.context = new AudioContext({ latencyHint: "playback" });
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.context.destination);
        this.instruments = new NightInstruments(this.context, this.master);
        this.context.onstatechange = () => {
          if (!this.disposed) this.sync();
        };
      }
      this.unlocked = true;
      this.context
        .resume()
        .then(() => this.sync())
        .catch(() => this.publish({ status: "waiting" }));
    } catch {
      this.publish({ status: "unavailable" });
    }
  }

  setEnabled(enabled) {
    this.publish({ enabled });
    this.save();
    if (enabled) this.activate();
    this.sync();
  }
  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.publish({ volume: Math.max(0, Math.min(1, volume)) });
    this.save();
    this.activate();
    this.sync();
  }
  setReading(reading) {
    this.reading = reading;
    this.sync();
  }
  setActive(active) {
    this.active = active;
    this.sync();
  }

  sync() {
    if (this.disposed) return;
    const chapter = this.tour.state.chapter;
    if (chapter !== this.chapter) {
      this.chapter = chapter;
      this.position = 0;
    }
    const status =
      !this.state.enabled || this.state.volume === 0
        ? "muted"
        : !this.unlocked
          ? this.state.status === "unavailable"
            ? "unavailable"
            : "waiting"
          : !this.shouldPlay()
            ? "paused"
            : this.context?.state === "running"
              ? "playing"
              : "waiting";
    this.publish({ chapter, status });
    if (!this.context) return;
    if (!this.shouldPlay()) {
      this.halt();
      return;
    }
    clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (this.context.state !== "running") {
      // A resumed tab may still need a tap (e.g. after an OS audio interruption).
      // Do not retry indefinitely; activate() is available on the sound control.
      if (!this.resuming && this.context.state === "suspended") {
        this.resuming = true;
        this.context
          .resume()
          .then(() => {
            this.resuming = false;
            if (this.context.state === "running") this.sync();
          })
          .catch(() => {
            this.resuming = false;
            this.publish({ status: "waiting" });
          });
      }
      return;
    }
    if (!this.layer || !this.timer || this.layer.chapter !== chapter)
      this.begin(chapter);
    // The slider's maximum is deliberately capped at an accompaniment level.
    const duck = this.reading
      ? 0.48
      : this.tour.state.phase === "plate"
        ? 0.32
        : 1;
    soften(
      this.master.gain,
      this.state.volume * 0.45 * duck,
      this.context.currentTime,
    );
  }

  begin(chapter) {
    const c = this.context;
    if (this.layer) {
      const previous = this.layer;
      soften(previous.gain.gain, 0, c.currentTime, 0.5);
      this.retired.add(previous);
      previous.expiry = c.currentTime + 3.5;
    }
    const score = chapterScore(chapter),
      gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(this.instruments.input);
    soften(gain.gain, 1, c.currentTime, 0.65);
    const position = this.position % score.duration;
    let cursor = score.events.findIndex((event) => event.time >= position);
    if (cursor < 0) cursor = score.events.length;
    this.layer = {
      chapter,
      score,
      gain,
      start: c.currentTime + 0.12 - position,
      cursor,
    };
    if (!this.timer) this.timer = setInterval(() => this.tick(), 100);
    this.tick();
  }

  tick() {
    if (!this.shouldPlay() || !this.layer || this.context.state !== "running")
      return;
    const now = this.context.currentTime;
    for (const layer of this.retired) {
      if (now >= layer.expiry) {
        layer.gain.disconnect();
        this.retired.delete(layer);
      }
    }
    const layer = this.layer,
      { events, duration } = layer.score;
    // Skip overdue notes after a long foreground stall; never fire a catch-up burst.
    const elapsed = Math.max(0, now - layer.start);
    const cycle = Math.floor(elapsed / duration);
    if (layer.cursor < cycle * events.length)
      layer.cursor = cycle * events.length;
    while (true) {
      const event = events[layer.cursor % events.length];
      const time =
        layer.start +
        Math.floor(layer.cursor / events.length) * duration +
        event.time;
      if (time > now + 0.6) break;
      if (time >= now - 0.04)
        this.instruments.play(event, Math.max(time, now), layer.gain);
      layer.cursor++;
    }
  }

  halt() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      if (this.layer?.chapter === this.chapter)
        this.position =
          Math.max(0, this.context.currentTime - this.layer.start) %
          this.layer.score.duration;
    }
    if (
      this.suspendTimer ||
      this.context.state === "suspended" ||
      this.context.state === "closed"
    )
      return;
    soften(this.master.gain, 0, this.context.currentTime, 0.045);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (this.shouldPlay() || this.disposed) return;
      this.clearLayers();
      this.context.suspend().catch(() => {});
    }, 350);
  }

  clearLayers() {
    this.instruments.clear();
    this.layer?.gain.disconnect();
    this.layer = null;
    this.retired.forEach((layer) => layer.gain.disconnect());
    this.retired.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.suspendTimer);
    this.unsubscribe();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.listeners.clear();
    if (this.context) {
      this.context.onstatechange = null;
      this.clearLayers();
      this.instruments.dispose();
      this.master.disconnect();
      this.context.close().catch(() => {});
    }
  }
}
