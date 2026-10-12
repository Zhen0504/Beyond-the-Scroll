import { Vector3 } from "three";
import { CHAPTERS } from "./story.js";

const ease = (t) => t * t * (3 - 2 * t);
/** An authored front-side camera rail. Chapter changes always stop at the scroll. */
export class GuidedTour {
  constructor({ camera, onChapter, reducedMotion = false }) {
    this.camera = camera;
    this.onChapter = onChapter;
    this.reducedMotion = reducedMotion;
    this.listeners = new Set();
    this.target = new Vector3();
    this.state = { chapter: 0, stop: 0, line: 0, phase: "plate" };
    this.travel = null;
    this.fade = 1;
    this.applyStop();
    this.onChapter?.(CHAPTERS[0]);
  }
  getSnapshot = () => this.state;
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  publish(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  get chapter() {
    return CHAPTERS[this.state.chapter];
  }
  get stop() {
    return this.chapter.stops[this.state.stop];
  }
  pose(stop) {
    const position = new Vector3().fromArray(stop.camera);
    const target = new Vector3().fromArray(stop.target);
    // Portrait shots concentrate on the current actor instead of shrinking a whole room.
    if (this.camera.aspect < 1 && !stop.actor) {
      const focus = this.chapter.stops[1];
      position.fromArray(focus.camera);
      position.z += 1.65;
      target.fromArray(focus.target);
    }
    if (this.camera.aspect < 1) position.z += 0.8;
    return { position, target };
  }
  applyStop() {
    const pose = this.pose(this.stop);
    this.camera.position.copy(pose.position);
    this.target.copy(pose.target);
    this.camera.lookAt(this.target);
  }
  openChapter(id) {
    const chapter = CHAPTERS.findIndex((c) => c.id === id);
    if (chapter < 0) return;
    this.travel = null;
    this.fade = 1;
    this.publish({ chapter, stop: 0, line: 0, phase: "plate" });
    this.onChapter?.(this.chapter);
    this.applyStop();
  }
  showPainting() {
    this.travel = null;
    this.fade = 1;
    this.publish({ phase: "plate" });
    this.applyStop();
  }
  enter() {
    if (this.state.phase !== "plate") return;
    this.fade = this.reducedMotion ? 0 : 1;
    this.publish({ phase: this.reducedMotion ? "scene" : "entering" });
  }
  move(delta) {
    if (this.state.phase !== "scene") return;
    const next = this.state.stop + Math.sign(delta);
    if (next < 0 || next >= this.chapter.stops.length) return;
    this.travel = {
      from: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      ...this.pose(this.chapter.stops[next]),
      elapsed: 0,
    };
    this.travel.duration = Math.min(
      3.6,
      1.4 + this.travel.from.distanceTo(this.travel.position) * 0.2,
    );
    this.publish({ stop: next, line: 0, phase: "travel" });
    if (this.reducedMotion) this.finishTravel();
  }
  finishTravel() {
    this.travel = null;
    this.applyStop();
    this.publish({ phase: "scene" });
  }
  nextLine() {
    if (this.state.phase !== "scene" || !this.stop.lines.length) return;
    this.publish({ line: (this.state.line + 1) % this.stop.lines.length });
  }
  pause() {
    if (!["scene", "travel", "entering"].includes(this.state.phase)) return;
    this.resumePhase = this.state.phase;
    this.publish({ phase: "paused" });
  }
  resume() {
    if (this.state.phase === "paused")
      this.publish({ phase: this.resumePhase ?? "scene" });
  }
  lock() {
    this.state.phase === "paused" ? this.resume() : this.enter();
  }
  unlock() {
    this.pause();
  }
  resize() {
    if (this.travel) this.travel = null;
    this.applyStop();
    if (this.state.phase === "travel") this.publish({ phase: "scene" });
    if (this.state.phase === "paused" && this.resumePhase === "travel")
      this.resumePhase = "scene";
  }
  update(dt) {
    if (this.state.phase === "entering") {
      this.fade = this.reducedMotion ? 0 : Math.max(0, this.fade - dt / 1.05);
      if (this.fade === 0) this.publish({ phase: "scene" });
    }
    if (this.state.phase !== "travel" || !this.travel) return;
    if (this.reducedMotion) {
      this.finishTravel();
      return;
    }
    const tr = this.travel;
    tr.elapsed += dt;
    const t = Math.min(1, tr.elapsed / tr.duration),
      k = ease(t);
    this.camera.position.lerpVectors(tr.from, tr.position, k);
    // Recede slightly between views; never cut through the furniture or pass behind paper.
    this.camera.position.z += Math.sin(t * Math.PI) * 0.25;
    this.target.lerpVectors(tr.fromTarget, tr.target, k);
    this.camera.lookAt(this.target);
    if (t === 1) this.finishTravel();
  }
  dispose() {
    this.listeners.clear();
  }
}
