import {
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import { createAtmosphere } from '../../../engine/atmosphere.js';
import { PaintRenderer } from '../../../engine/PaintRenderer.js';
import { WalkMap } from '../../../engine/WalkMap.js';
import { createArchitecture } from './architecture.js';
import { GuidedTour } from '../hanxizai/GuidedTour.js';
import { createMuralMaterial } from './mural.js';
import { Restorer } from './restore.js';
import { BOUNDS, FOLDS, MURAL, PIGMENTS } from './layout.js';
import { CHAPTERS } from './story.js';
import { FuwangMusic } from './FuwangMusic.js';

/**
 * 卷三《鹿王本生》画境。
 *
 * 与卷一卷二的差别：观众不是单纯漫游或观看，而是逐层唤起褪色壁画的重彩意象。
 * 设色过程为本项目的艺术转译，不是颜料区域识别、壁画绘制流程或文物修复工艺的复原。
 */

const TEX = `${import.meta.env.BASE_URL}paintings/fuwang-bensheng/`;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const heightAt = () => 0;

export async function buildFuwangWorld({ canvas, onProgress, onZone, onEvent }) {
  const progress = (p, label) => onProgress?.(p, label);

  progress(0.08, '展壁 · 取色');
  const loader = new TextureLoader();
  const muralTex = await loader.loadAsync(`${TEX}panorama.jpg`);
  muralTex.colorSpace = SRGBColorSpace;
  muralTex.anisotropy = 4;

  const atmosphere = createAtmosphere({
    fogNear: '#2a211b',
    fogFar: '#3a2e26',
    sunDir: [0.22, 0.88, 0.42],
  });

  const renderer = new PaintRenderer(canvas, {
    silkTexture: muralTex,
    silkMean: 0.16,
  });
  const background = new Color().setRGB(0.10, 0.08, 0.07);
  renderer.postMaterial.uniforms.uFadeColor.value = background;
  renderer.postMaterial.uniforms.uFade.value = 1;

  const scene = new Scene();
  scene.background = background;

  const walkMap = new WalkMap({ heightAt, waterLevel: -8, bounds: BOUNDS, maxSlope: 4 });

  progress(0.34, '起壁 · 洞窟既成');
  await nextFrame();
  const arch = createArchitecture({ walkMap });
  scene.add(arch.group);

  // 壁画本体
  const muralMat = createMuralMaterial({ map: muralTex, atmosphere });
  const mural = new Mesh(new PlaneGeometry(MURAL.width, MURAL.height), muralMat);
  mural.position.set(MURAL.cx, MURAL.cy, MURAL.z);
  mural.name = 'mural';
  scene.add(mural);

  progress(0.66, '敷彩 · 矿物入色');
  await nextFrame();

  // 视场按画幅高度定：画面高约 2.43，机位约 2.4–2.8，
  // 取 62° 视场可让单折区段充满画面，笔触清晰可辨。
  const camera = new PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 90);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // 先建敷彩系统：GuidedTour 在构造时即会回调 onChapter，此处必须已就绪
  const restorer = new Restorer({
    renderer: renderer.renderer,
    camera,
    muralMesh: mural,
    paintCanvas: null,
    folds: FOLDS,
    palette: PIGMENTS,
    onEvent: (e) => onEvent?.(e),
  });

  const controller = new GuidedTour({
    camera,
    chapters: CHAPTERS,
    reducedMotion: reducedMotion.matches,
    onChapter: (chapter) => {
      onZone?.(chapter);
      restorer.setFold(CHAPTER_INDEX(chapter.id));
    },
  });

  // 键盘换折必须同时驱动导览机位与敷彩状态；只改 Restorer 会造成
  // 顶部折题、相机取景和底部色层盘三者错位。
  restorer.onNavigate = (index) => controller.openChapter(CHAPTERS[index]?.id ?? CHAPTERS[0].id);
  const music = new FuwangMusic(controller);

  restorer.attach(canvas);
  restorer.setFold(0);

  progress(0.92, '缀节 · 洞窟既成');
  await nextFrame();
  renderer.renderer.compile(scene, camera);

  let raf = 0;
  let last = performance.now();
  let running = false;
  let disposed = false;
  const perf = { frames: 0, time: 0, checked: 0 };

  const visit = (id) => {
    controller.openChapter(id);
    restorer.setFold(CHAPTER_INDEX(id));
  };

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    controller.resize();
    renderer.resize();
  };
  window.addEventListener('resize', onResize);

  function frame(now) {
    if (!running || disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const paused = ['plate', 'paused'].includes(controller.state.phase);
    atmosphere.uTime.value += reducedMotion.matches || paused ? 0 : dt;
    controller.reducedMotion = reducedMotion.matches;
    controller.update(dt);
    if (!paused) restorer.update();
    muralMat.uniforms.uTime.value = atmosphere.uTime.value;
    renderer.postMaterial.uniforms.uFade.value = controller.fade * controller.fade;
    renderer.render(scene, camera);

    perf.frames += 1;
    perf.time += dt;
    if (perf.checked < 2 && perf.time > 3) {
      if (perf.time / perf.frames > 0.028 && renderer.pixelRatio > 0.85) {
        renderer.setPixelRatio(Math.max(0.85, renderer.pixelRatio - 0.25));
      }
      perf.frames = 0;
      perf.time = 0;
      perf.checked += 1;
    }
    raf = requestAnimationFrame(frame);
  }

  progress(1, '入画');
  return {
    mode: 'guided',
    tour: controller,
    controller,
    restorer,
    music,
    paintCanvas: null,
    mural,
    architecture: arch,
    camera,
    scene,
    walkMap,
    visit,
    start() {
      if (running || disposed) return;
      running = true;
      music.setActive(true);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      music.setActive(false);
      cancelAnimationFrame(raf);
    },
    /** 供开发与自动化排查：探针读取当前敷彩状态 */
    probe(clientX, clientY) {
      const hit = restorer.pickFrom({ clientX, clientY });
      return {
        phase: controller.state.phase,
        chapter: controller.state.chapter,
        hit: hit ? { u: +hit.uv.x.toFixed(4), v: +hit.uv.y.toFixed(4) } : null,
        fold: restorer.index,
        colorsOn: restorer.colorsOn,
        colorsTotal: restorer.colorsTotal,
        progress: restorer.progress.map((p) => +p.toFixed(3)),
        uniforms: {
          uHover: muralMat.uniforms.uHover.value,
          uHoverU0: muralMat.uniforms.uHoverU0.value,
          uHoverU1: muralMat.uniforms.uHoverU1.value,
          uPaintIsNull: muralMat.uniforms.uPaint.value === null,
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      restorer.detach(canvas);
      music.dispose();
      controller.dispose();
      const materials = new Set();
      const textures = new Set([muralTex]);
      const geometries = new Set();
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

// 五折 id → 序号，供导览与敷彩对齐
const CHAPTER_INDEX = (id) => {
  const i = FOLDS.findIndex((f) => f.id === id);
  return i < 0 ? 0 : i;
};
