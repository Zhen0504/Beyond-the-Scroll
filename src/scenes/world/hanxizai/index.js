import {
  Color,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  TextureLoader,
} from "three";
import { createAtmosphere } from "../../../engine/atmosphere.js";
import { FirstPersonController } from "../../../engine/FirstPersonController.js";
import { PaintRenderer } from "../../../engine/PaintRenderer.js";
import { WalkMap } from "../../../engine/WalkMap.js";
import { createArchitecture } from "./architecture.js";
import { createCandles } from "./candles.js";
import { createPuppetFigures } from "./puppets.js";
import { CAST } from "./cast.js";
import { BOUNDS, ROOMS, SPAWN } from "./layout.js";

const TEX = `${import.meta.env.BASE_URL}paintings/hanxizai-yeyan/`;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const heightAt = () => 0;

function silkMean(image) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  g.drawImage(image, 0, 0, 32, 32);
  const data = g.getImageData(0, 0, 32, 32).data;
  let mean = 0;
  for (let i = 0; i < data.length; i += 4)
    for (let k = 0; k < 3; k++) mean += Math.pow(data[i + k] / 255, 2.2);
  return mean / (32 * 32 * 3);
}

export async function buildHanxizaiWorld({
  canvas,
  onProgress,
  onLockChange,
  onZone,
  onPrompt,
}) {
  const progress = (p, label) => onProgress?.(p, label);
  progress(0.06, "展绢 · 原卷取色");
  const loader = new TextureLoader();
  const sheets = [...new Set(CAST.map((p) => p.sheet))];
  const [silk, ...spriteTextures] = await Promise.all([
    loader.loadAsync(`${TEX}textures/silk.jpg`),
    ...sheets.map((name) => loader.loadAsync(`${TEX}puppets/${name}`)),
  ]);
  silk.colorSpace = SRGBColorSpace;
  const spriteImages = Object.fromEntries(
    sheets.map((name, i) => [name, spriteTextures[i].image]),
  );
  silk.wrapS = silk.wrapT = RepeatWrapping;
  const atmosphere = createAtmosphere({
    fogNear: "#bdab84",
    fogFar: "#c5b38b",
    sunDir: [0.18, 0.92, 0.22],
  });
  const renderer = new PaintRenderer(canvas, {
    silkTexture: silk,
    silkMean: silkMean(silk.image),
  });
  const background = new Color().setRGB(0.56, 0.46, 0.31);
  renderer.postMaterial.uniforms.uFadeColor.value = background;
  renderer.postMaterial.uniforms.uFade.value = 1;
  const scene = new Scene();
  scene.background = background;
  const walkMap = new WalkMap({
    heightAt,
    waterLevel: -4,
    bounds: BOUNDS,
    maxSlope: 2,
  });
  progress(0.25, "起稿 · 屏榻相间");
  await nextFrame();
  const arch = createArchitecture({ walkMap, silkTexture: silk });
  scene.add(arch.group);
  const candles = createCandles({
    atmosphere,
    walkMap,
    paintedMaterial: arch.material,
  });
  scene.add(candles.sticks, candles.flames);
  progress(0.58, "剪影 · 人物入席");
  await nextFrame();
  const figures = createPuppetFigures({
    spriteImages,
    walkMap,
  });
  scene.add(figures.group);
  // Atlas now owns the sampled pixels, the source texture need not occupy VRAM.
  spriteTextures.forEach((t) => t.dispose());
  const camera = new PerspectiveCamera(
    57,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  const controller = new FirstPersonController({
    camera,
    dom: canvas,
    walkMap,
    spawn: SPAWN,
    onLockChange,
  });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  progress(0.9, "缀节 · 纸偶入席");
  await nextFrame();
  renderer.renderer.compile(scene, camera);
  let raf = 0,
    last = performance.now(),
    fade = 1,
    zone = null,
    lastPrompt = null,
    running = false,
    disposed = false;
  const perf = { frames: 0, time: 0, checked: 0 };

  function visit(id) {
    const r = ROOMS.find((r) => r.id === id);
    if (!r) return;
    const [x, z, yaw] = r.view;
    Object.assign(controller.pos, { x, z, y: 0 });
    controller.feetY =
      controller.air =
      controller.vy =
      controller.vx =
      controller.vz =
        0;
    controller.yaw = yaw;
    controller.pitch = -0.055;
    controller.keys.clear();
    fade = 0.35;
    zone = null;
  }
  const onKey = (e) => {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)
    )
      return;
    const index = Number(e.code.replace("Digit", "")) - 1;
    if (e.code.startsWith("Digit") && ROOMS[index]) visit(ROOMS[index].id);
  };
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.resize();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKey);
  function frame(now) {
    if (!running || disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    atmosphere.uTime.value += reducedMotion.matches ? 0 : dt;
    controller.update(dt);
    figures.update(dt, camera, { reducedMotion: reducedMotion.matches });
    fade = Math.max(0, fade - dt * 0.75);
    renderer.postMaterial.uniforms.uFade.value = fade * fade;
    const current = ROOMS.find((r) => camera.position.x <= r.maxX);
    if (current !== zone) {
      zone = current;
      onZone?.(current);
    }
    let nearest = null,
      dist = 3.2;
    for (const p of figures.cast) {
      const dx = p.x - camera.position.x,
        dz = p.z - camera.position.z,
        d = Math.hypot(dx, dz);
      // Caption only for a nearby puppet in the forward half of the view.
      if (
        d < dist &&
        -Math.sin(controller.yaw) * dx - Math.cos(controller.yaw) * dz >
          d * 0.55
      ) {
        dist = d;
        nearest = p.name;
      }
    }
    if (nearest !== lastPrompt) {
      lastPrompt = nearest;
      onPrompt?.(nearest);
    }
    renderer.render(scene, camera);
    perf.frames++;
    perf.time += dt;
    if (perf.checked < 2 && perf.time > 3) {
      if (perf.time / perf.frames > 0.028 && renderer.pixelRatio > 0.85)
        renderer.setPixelRatio(Math.max(0.85, renderer.pixelRatio - 0.25));
      perf.frames = 0;
      perf.time = 0;
      perf.checked++;
    }
    raf = requestAnimationFrame(frame);
  }
  progress(1, "入画");
  return {
    controller,
    camera,
    scene,
    walkMap,
    figures,
    visit,
    start() {
      if (running || disposed) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      controller.dispose();
      scene.remove(figures.group);
      figures.dispose();
      const materials = new Set(),
        textures = new Set([silk]),
        geometries = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      materials.forEach((m) => {
        if (m.map) textures.add(m.map);
        Object.values(m.uniforms ?? {}).forEach((u) => {
          if (u.value?.isTexture) textures.add(u.value);
        });
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
      geometries.forEach((g) => g.dispose());
      renderer.dispose();
    },
  };
}
