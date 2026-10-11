import { Color, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, Scene, TextureLoader } from 'three';
import { createAtmosphere } from '../../../engine/atmosphere.js';
import { FirstPersonController } from '../../../engine/FirstPersonController.js';
import { PaintRenderer } from '../../../engine/PaintRenderer.js';
import { WalkMap } from '../../../engine/WalkMap.js';
import { createArchitecture } from './architecture.js';
import { createCandles } from './candles.js';
// 皮影人物：细画稿图集 + 按 id 合并的补充人物（figures.js 为基础版，保留备用）
import { createPuppetFigures } from './puppets.js';
import { createProps } from './props.js';
import { BOUNDS, SPAWN, ZONES } from './layout.js';

const TEX = `${import.meta.env.BASE_URL}paintings/hanxizai-yeyan/`;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function imageMean(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let r = 0, gg = 0, b = 0;
  const lin = (v) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < d.length; i += 4) {
    r += lin(d[i]);
    gg += lin(d[i + 1]);
    b += lin(d[i + 2]);
  }
  const n = d.length / 4;
  return [r / n, gg / n, b / n];
}

const heightAt = () => 0;

/**
 * 构建《韩熙载夜宴图》画境。返回可启动 / 停止 / 销毁的世界对象。
 */
export async function buildHanxizaiWorld({ canvas, overlay, onProgress, onLockChange, onZone, onPrompt }) {
  const progress = (p, label) => onProgress?.(p, label);

  progress(0.06, '展绢');
  const loader = new TextureLoader();
  const [silk, painting] = await Promise.all([
    loader.loadAsync(`${TEX}textures/silk.jpg`),
    loader.loadAsync(`${TEX}panorama.jpg`),
  ]);
  silk.colorSpace = SRGBColorSpace;
  painting.colorSpace = SRGBColorSpace;
  silk.wrapS = silk.wrapT = RepeatWrapping;
  painting.anisotropy = 8;

  const silkLinear = imageMean(silk.image);
  const silkMean = (silkLinear[0] + silkLinear[1] + silkLinear[2]) / 3;

  const atmosphere = createAtmosphere({
    fogNear: '#6a4a32',
    fogFar: '#1c120e',
    sunDir: [0.18, 0.92, 0.22],
  });
  atmosphere.uSilkColor.value.setRGB(...silkLinear);

  const renderer = new PaintRenderer(canvas, { silkTexture: silk, silkMean });
  renderer.postMaterial.uniforms.uFadeColor.value = new Color('#2a1a12').multiplyScalar(1.05);
  renderer.postMaterial.uniforms.uFade.value = 1;

  const scene = new Scene();
  scene.background = new Color('#140e0b');

  const walkMap = new WalkMap({
    heightAt,
    slopeHeight: heightAt,
    waterLevel: -4,
    bounds: BOUNDS,
    maxSlope: 2,
  });

  progress(0.28, '起稿·厅堂');
  await nextFrame();
  const arch = createArchitecture({ atmosphere, walkMap, paintingTexture: painting });
  scene.add(arch.mesh);
  arch.screens.forEach((m) => scene.add(m));

  progress(0.55, '陈设·屏榻');
  await nextFrame();
  const candles = createCandles({ atmosphere, walkMap, paintedMaterial: arch.material });
  scene.add(candles.sticks);
  scene.add(candles.flames);
  // 分区补充陈设：舞筵、席垫、长案、盆架（数据见 zones.js 的 PROPS）
  const props = createProps({ walkMap, paintedMaterial: arch.material });
  scene.add(props.mesh);

  progress(0.78, '点染·人物');
  await nextFrame();
  const figures = createPuppetFigures({ atmosphere, walkMap });
  scene.add(figures.group);

  const camera = new PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.14, 90);
  const controller = new FirstPersonController({
    camera,
    dom: canvas,
    walkMap,
    spawn: SPAWN,
    onLockChange,
  });

  onPrompt?.(null);

  progress(0.94, '燃灯');
  await nextFrame();
  renderer.renderer.compile(scene, camera);

  let raf = 0;
  let last = performance.now();
  let zone = null;
  let fade = 1;
  const perf = { frames: 0, time: 0, checked: 0 };

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.resize();
  };
  window.addEventListener('resize', onResize);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    atmosphere.uTime.value += dt;
    controller.update(dt);
    figures.update(dt); // 皮影的呼吸微动与走动者

    if (fade > 0) {
      fade = Math.max(0, fade - dt * 0.5);
      renderer.postMaterial.uniforms.uFade.value = fade * fade;
    }

    const z = ZONES.find((zz) => camera.position.x <= zz.maxX);
    if (z && z !== zone) {
      zone = z;
      onZone?.(z);
    }

    renderer.render(scene, camera);

    perf.frames++;
    perf.time += dt;
    if (perf.checked < 2 && perf.time > 2.5) {
      const ms = (perf.time / perf.frames) * 1000;
      if (ms > 26 && renderer.pixelRatio > 0.75) renderer.setPixelRatio(Math.max(0.75, renderer.pixelRatio - 0.35));
      perf.frames = 0;
      perf.time = 0;
      perf.checked++;
    }
    raf = requestAnimationFrame(frame);
  }

  progress(1, '入画');
  return {
    controller,
    camera,
    scene,
    walkMap,
    figures,
    start() {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controller.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const u of Object.values(o.material.uniforms || {})) u.value?.isTexture && u.value.dispose();
          o.material.map?.dispose?.();
          o.material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
