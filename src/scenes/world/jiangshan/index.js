import { Color, MirroredRepeatWrapping, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, Scene, TextureLoader } from 'three';
import { createAtmosphere } from '../../../engine/atmosphere.js';
import { FirstPersonController } from '../../../engine/FirstPersonController.js';
import { PaintRenderer } from '../../../engine/PaintRenderer.js';
import { WalkMap } from '../../../engine/WalkMap.js';
import { createArchitecture, createHillBuildings } from './architecture.js';
import { createBoats } from './boats.js';
import { createChatter } from './chatter.js';
import { RegionMusic } from './RegionMusic.js';
import { createPaintedFigures } from './paintedFigures.js';
import { createClouds } from './clouds.js';
import { BOUNDS, MAIN_PATH, NORTH_PATH, SPAWN, STREAMS, STRUCTURES, ZONES } from './layout.js';
import { createRockMaterial, createRocks } from './rocks.js';
import { createSky } from './sky.js';
import { createTerrain, heightAt, walkSlopeHeight } from './terrain.js';
import { createVegetation } from './vegetation.js';
import { createDriftLeaves, createWater } from './water.js';

const TEX = `${import.meta.env.BASE_URL}paintings/jiangshan-qiuse/textures/`;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** 图片的平均颜色（线性空间） */
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

function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const ex = x1 - x0, ez = z1 - z0;
    let t = ((x - x0) * ex + (z - z0) * ez) / (ex * ex + ez * ez);
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - x0 - ex * t, z - z0 - ez * t));
  }
  return best;
}

/** 石拱桥中轴线两端点 */
function archLine(b) {
  const ry = Math.PI / 2 + b.angle;
  const dx = Math.cos(ry) * (b.length / 2 + 3), dz = -Math.sin(ry) * (b.length / 2 + 3);
  return [[b.x - dx, b.z - dz], [b.x + dx, b.z + dz]];
}

/** 植树、置石时需要避让的区域：道路与建筑 */
function createAvoid() {
  const S = STRUCTURES;
  const spots = [
    [S.pavilion.x, S.pavilion.z, 6],
    [S.lakeHall.x, S.lakeHall.z, 10],
    [S.temple.x, S.temple.z, 12],
    [S.temple.x + 11, S.temple.z + 3, 5],
    [S.terrace.cx, S.terrace.cz, 16],
    [S.dock.x, S.dock.z, 6],
    [S.pagoda.x, S.pagoda.z, 8],
    [SPAWN.x, SPAWN.z, 8],
    [S.lakeHall.x, S.lakeHall.z + 6, 6],
    ...S.boats.map((b) => [b.x, b.z, 5]),
    ...S.village.map((v) => [v.x, v.z, 7]),
    ...S.waterfalls.map((w) => [w.x, w.z, 8]),
  ];
  const lines = [
    [MAIN_PATH, 2.4],
    [NORTH_PATH, 2],
    [S.plankRoad.map(([x, z]) => [x, z]), 3],
    [[[S.woodBridge.x, S.woodBridge.z0], [S.woodBridge.x, S.woodBridge.z1]], 3],
    [archLine(S.archBridge), S.archBridge.width / 2 + 2],
    ...STREAMS.map((st) => [st.points, st.width / 2 + 2.5]),
    [[[S.dock.x, S.dock.z], [S.dock.x + Math.sin(S.dock.angle) * S.dock.length, S.dock.z - Math.cos(S.dock.angle) * S.dock.length]], 2.5],
  ];
  return (x, z, r = 0) => {
    for (const [sx, sz, sr] of spots) if (Math.hypot(x - sx, z - sz) < sr + r) return true;
    for (const [pts, w] of lines) if (distToPolyline(pts, x, z) < w + r) return true;
    return false;
  };
}

/**
 * 构建《江山秋色图》画境。返回可启动 / 停止 / 销毁的世界对象。
 */
export async function buildJiangshanWorld({ canvas, overlay, onProgress, onLockChange, onZone, onPrompt }) {
  const progress = (p, label) => onProgress?.(p, label);

  progress(0.05, '展绢');
  const loader = new TextureLoader();
  const [brush, silk, painting] = await Promise.all([
    loader.loadAsync(`${TEX}rock-brush.jpg`),
    loader.loadAsync(`${TEX}silk.jpg`),
    loader.loadAsync(`${TEX}backdrop.jpg`),
  ]);
  for (const t of [brush, silk, painting]) t.colorSpace = SRGBColorSpace;
  // 笔触与绢纹已预处理为无缝贴图，直接平铺
  brush.wrapS = brush.wrapT = RepeatWrapping;
  silk.wrapS = silk.wrapT = RepeatWrapping;
  painting.wrapS = MirroredRepeatWrapping;
  painting.wrapT = RepeatWrapping;
  painting.anisotropy = 8;

  const silkLinear = imageMean(silk.image);
  const silkMean = (silkLinear[0] + silkLinear[1] + silkLinear[2]) / 3;
  const brushLinear = imageMean(brush.image);
  const atmosphere = createAtmosphere();
  atmosphere.uSilkColor.value.setRGB(...silkLinear);
  atmosphere.uBrushMean.value = (brushLinear[0] + brushLinear[1] + brushLinear[2]) / 3;

  const renderer = new PaintRenderer(canvas, { silkTexture: silk, silkMean });
  renderer.postMaterial.uniforms.uFadeColor.value = new Color().copy(atmosphere.uFogFar.value).multiplyScalar(1.15);
  renderer.postMaterial.uniforms.uFade.value = 1;

  const scene = new Scene();
  const walkMap = new WalkMap({ heightAt, slopeHeight: walkSlopeHeight, bounds: BOUNDS, maxSlope: 0.9 });
  const avoid = createAvoid();

  progress(0.15, '起稿·地形');
  await nextFrame();
  const terrain = createTerrain({ atmosphere, brushTexture: brush });
  terrain.meshes.forEach((m) => scene.add(m));

  progress(0.35, '勾勒·楼阁桥梁');
  await nextFrame();
  const arch = createArchitecture({ atmosphere, heightAt, walkMap });
  arch.meshes.forEach((m) => scene.add(m));

  progress(0.5, '皴擦·山石');
  await nextFrame();
  const rocks = createRocks({ material: createRockMaterial({ atmosphere, brushTexture: brush }), heightAt, walkMap, avoid });
  rocks.meshes.forEach((m) => scene.add(m));
  const hills = createHillBuildings({ material: arch.material, heightAt, rocks, walkMap, terrainMeshes:terrain.meshes });
  hills.meshes.forEach((m) => scene.add(m));

  progress(0.7, '点染·林木');
  await nextFrame();
  const veg = createVegetation({ atmosphere, walkMap, avoid, rocks });
  veg.meshes.forEach((m) => scene.add(m));
  const figures = await createPaintedFigures({ atmosphere, walkMap, rooms:arch.rooms, viewPaths:hills.viewPaths });
  scene.add(figures.group);

  progress(0.85, '渲染·江水云烟');
  await nextFrame();
  const water = createWater({ atmosphere, depthTexture: terrain.depthTexture, heightAt });
  water.meshes.forEach((m) => scene.add(m));
  const mist = water.falls.map((f) => ({ x: f.userData.foot.x, y: 3, z: f.userData.foot.z + 2, w: 26, h: 9, opacity: 0.5 }));
  const clouds = createClouds({ atmosphere, extra: mist });
  clouds.meshes.forEach((m) => scene.add(m));
  const sky = createSky({ atmosphere, silkTexture: silk, silkMean, paintingTexture: painting });
  sky.meshes.forEach((m) => scene.add(m));
  const boats = createBoats({ material: arch.material, heightAt, walkMap, makePerson: figures.makePerson });
  scene.add(boats.group);
  const leaves = createDriftLeaves({ heightAt });
  scene.add(leaves.mesh);

  // 近裁剪面取 0.2：深度精度提高一倍，远处房屋细部不易闪烁
  const camera = new PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 4000);
  if(import.meta.env.DEV)window.__jiangshanInspect={scene,camera,figures,arch,hills,boats,walkMap};
  const chatter = overlay ? createChatter({ npcs: [...figures.npcs,...boats.npcs], camera, container: overlay, scene }) : null;

  /* ---------------- 登船 / 上岸 ---------------- */
  let promptText = null;
  let flash = null;
  const setPrompt = (text) => {
    if (text !== promptText) {
      promptText = text;
      onPrompt?.(text);
    }
  };
  const interact = () => {
    if (controller.vehicle) {
      const b = controller.vehicle;
      const land = walkMap.findLanding(b.x, b.z, 7.5);
      if (land) {
        controller.exitVehicle(land);
        b.occupied = false;
        b.speed = 0;
      } else {
        flash = { text: '此处无岸可登，划近岸边再试', until: performance.now() + 1800 };
      }
    } else {
      const b = boats.nearest(controller.pos.x, controller.pos.z);
      if (b) {
        b.occupied = true;
        controller.enterVehicle(b);
      }
    }
  };
  const music = new RegionMusic({
    urls: ZONES.map(z => `${import.meta.env.BASE_URL}paintings/jiangshan-qiuse/music/${z.name}.mp3`),
    boundaries: ZONES.slice(0, -1).map(z => z.maxX),
  });
  const controller = new FirstPersonController({ camera, dom: canvas, walkMap, spawn: SPAWN,
    onLockChange: (locked) => { music.setPlaying(locked); onLockChange?.(locked); }, onInteract: interact });
  let promptTimer = 0;
  const updatePrompt = (dt) => {
    promptTimer -= dt;
    if (flash && performance.now() < flash.until) return setPrompt(flash.text);
    flash = null;
    if (promptTimer > 0) return;
    promptTimer = 0.25;
    if (controller.vehicle) {
      const b = controller.vehicle;
      setPrompt(walkMap.findLanding(b.x, b.z, 7.5) ? '按 E 上岸　·　W / S 划桨　A / D 转向' : 'W / S 划桨　A / D 转向　Shift 用力');
    } else {
      setPrompt(boats.nearest(controller.pos.x, controller.pos.z) ? '按 E 登船' : null);
    }
  };

  progress(0.95, '落款');
  await nextFrame();
  // 预编译着色器，避免首帧卡顿
  renderer.renderer.compile(scene, camera);

  /* ---------------- 循环 ---------------- */
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
    boats.update(dt, controller.vehicle);
    figures.update(dt, camera.position);
    chatter?.update(dt);
    music.update(camera.position.x, chatter?.isReading ?? false);
    leaves.update(dt, camera.position);
    updatePrompt(dt);

    // 入场：由绢白中渐显
    if (fade > 0) {
      fade = Math.max(0, fade - dt * 0.45);
      renderer.postMaterial.uniforms.uFade.value = fade * fade;
    }

    const z = ZONES.find((zz) => camera.position.x <= zz.maxX);
    if (z && z !== zone) {
      zone = z;
      onZone?.(z);
    }

    renderer.render(scene, camera);

    // 自适应画质：前几秒帧时过长则降低分辨率
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
    music,
    boats,
    figures, chatter,
    architecture:arch, hillBuildings:hills,
    camera,
    scene,
    walkMap,
    start() {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      music.setPlaying(false);
      cancelAnimationFrame(raf);
    },
    dispose() {
      music.dispose();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controller.dispose();
      chatter?.dispose();
      figures.dispose();
      if(import.meta.env.DEV)delete window.__jiangshanInspect;
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const u of Object.values(o.material.uniforms || {})) u.value?.isTexture && u.value.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
