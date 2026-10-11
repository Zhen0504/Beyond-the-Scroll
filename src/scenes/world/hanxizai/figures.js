import { CanvasTexture, SRGBColorSpace } from 'three';
import { createBillboards } from '../../../engine/Billboards.js';
import { mulberry32 } from '../../../utils/math.js';
import { FIGURES } from './layout.js';

/**
 * 皮影纸片人物（基础版）：Canvas 图集 + 引擎 Billboards。
 * 画境实际接入的是 puppets.js（细画稿 + 按 id 合并 + 走动者）。本文件保留作对照与回退。
 */

export const COLS = 4;
export const ROWS = 3;
export const CELL_W = 320;
export const CELL_H = 640;

export const PUPPET_INDEX = {
  hanSit: 0,
  hanStand: 1,
  guestSit: 2,
  guestStand: 3,
  ladySit: 4,
  ladyStand: 5,
  dancer: 6,
  pipa: 7,
  flute: 8,
  monk: 9,
  maid: 10,
  guestClap: 11,
};

const INK = 'rgba(28, 20, 14, 0.92)';

function cellBox(i) {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return { x: c * CELL_W, y: r * CELL_H, w: CELL_W, h: CELL_H };
}

function uvFor(i) {
  const pad = 0.004;
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const u0 = c / COLS + pad;
  const u1 = (c + 1) / COLS - pad;
  const v0 = 1 - (r + 1) / ROWS + pad;
  const v1 = 1 - r / ROWS - pad;
  return [u0, v0, u1, v1];
}

function robe(g, cx, yNeck, yHem, wNeck, wHem, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx - wNeck, yNeck);
  g.lineTo(cx + wNeck, yNeck);
  g.quadraticCurveTo(cx + wHem + 6, (yNeck + yHem) / 2, cx + wHem, yHem);
  g.quadraticCurveTo(cx, yHem + 14, cx - wHem, yHem);
  g.quadraticCurveTo(cx - wHem - 6, (yNeck + yHem) / 2, cx - wNeck, yNeck);
  g.closePath();
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 3.2;
  g.stroke();
}

function head(g, cx, cy, r, skin = '#e2c4a0') {
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(cx, cy, r * 0.82, r, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2.4;
  g.stroke();
  // 写意五官：细眉、点睛、小口
  g.strokeStyle = '#2a2018';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(cx - r * 0.45, cy - r * 0.18);
  g.quadraticCurveTo(cx - r * 0.2, cy - r * 0.32, cx - r * 0.02, cy - r * 0.16);
  g.moveTo(cx + r * 0.08, cy - r * 0.16);
  g.quadraticCurveTo(cx + r * 0.28, cy - r * 0.32, cx + r * 0.48, cy - r * 0.14);
  g.stroke();
  g.fillStyle = '#1a1410';
  g.beginPath();
  g.arc(cx - r * 0.22, cy - r * 0.02, 2.4, 0, Math.PI * 2);
  g.arc(cx + r * 0.24, cy - r * 0.02, 2.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#a05040';
  g.beginPath();
  g.ellipse(cx, cy + r * 0.38, r * 0.16, r * 0.07, 0, 0, Math.PI * 2);
  g.fill();
}

function hatHan(g, cx, cy) {
  g.fillStyle = '#1a1612';
  g.beginPath();
  g.moveTo(cx - 28, cy);
  g.lineTo(cx + 28, cy);
  g.lineTo(cx + 22, cy - 58);
  g.lineTo(cx - 22, cy - 58);
  g.closePath();
  g.fill();
  g.fillRect(cx - 8, cy - 78, 16, 22);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.stroke();
}

function hatGuest(g, cx, cy) {
  g.fillStyle = '#1c1814';
  g.beginPath();
  g.ellipse(cx, cy - 8, 30, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 18, cy - 36, 36, 22);
  // 展脚
  g.fillRect(cx - 52, cy - 20, 24, 6);
  g.fillRect(cx + 28, cy - 20, 24, 6);
}

function hairLady(g, cx, cy) {
  g.fillStyle = '#1a1410';
  g.beginPath();
  g.ellipse(cx, cy - 6, 34, 28, 0, Math.PI, Math.PI * 2);
  g.fill();
  // 双髻
  g.beginPath();
  g.arc(cx - 18, cy - 38, 14, 0, Math.PI * 2);
  g.arc(cx + 18, cy - 38, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c45a48';
  g.beginPath();
  g.arc(cx, cy - 44, 5, 0, Math.PI * 2);
  g.fill();
}

function beard(g, cx, cy, long = true) {
  g.strokeStyle = 'rgba(24,18,14,0.9)';
  g.lineWidth = 1.6;
  const n = long ? 14 : 8;
  const len = long ? 46 : 18;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    g.beginPath();
    g.moveTo(cx + t * 18, cy);
    g.quadraticCurveTo(cx + t * 26, cy + len * 0.55, cx + t * 10, cy + len);
    g.stroke();
  }
}

function feet(g, cx, y, spread = 16) {
  g.fillStyle = '#1a1410';
  g.beginPath();
  g.ellipse(cx - spread, y, 12, 6, 0, 0, Math.PI * 2);
  g.ellipse(cx + spread, y, 12, 6, 0, 0, Math.PI * 2);
  g.fill();
}

function drawKind(g, kind, ox, oy) {
  // 局部坐标：脚在 (160, 600)，头在 y≈160
  g.save();
  g.translate(ox, oy);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const cx = 160;

  const sit = kind.includes('Sit') || kind === 'pipa' || kind === 'flute' || kind === 'dancer';
  const yHem = sit ? 470 : 575;
  const yNeck = sit ? 250 : 220;
  const yHead = sit ? 195 : 165;

  if (kind === 'hanSit' || kind === 'hanStand') {
    robe(g, cx, yNeck, yHem, 28, sit ? 78 : 62, '#c4b08a');
    // 深衣缘
    g.strokeStyle = '#2a2018';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx - 10, yNeck + 10);
    g.lineTo(cx - 6, yHem - 40);
    g.stroke();
    head(g, cx, yHead, 32);
    beard(g, cx, yHead + 28, true);
    hatHan(g, cx, yHead - 18);
    if (!sit) feet(g, cx, 600);
    else {
      g.fillStyle = '#1a1410';
      g.fillRect(cx - 50, yHem + 8, 36, 14);
      g.fillRect(cx + 10, yHem + 8, 36, 14);
    }
  } else if (kind === 'guestSit' || kind === 'guestStand' || kind === 'guestClap') {
    const robeC = kind === 'guestClap' ? '#4a4038' : '#3a3834';
    robe(g, cx, yNeck, yHem, 26, sit ? 70 : 54, robeC);
    g.fillStyle = '#e8dcc4';
    g.fillRect(cx - 18, yNeck + 8, 36, 22);
    head(g, cx, yHead, 30);
    beard(g, cx, yHead + 24, false);
    hatGuest(g, cx, yHead - 10);
    if (kind === 'guestClap') {
      g.strokeStyle = INK;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(cx - 48, yNeck + 20);
      g.lineTo(cx - 70, yNeck - 10);
      g.moveTo(cx + 48, yNeck + 20);
      g.lineTo(cx + 70, yNeck - 4);
      g.stroke();
    }
    if (!sit) feet(g, cx, 600);
  } else if (kind === 'ladySit' || kind === 'ladyStand' || kind === 'maid') {
    const col = kind === 'maid' ? '#7a8a7a' : '#d8c8b0';
    const sash = kind === 'maid' ? '#8b3a32' : '#c45a48';
    robe(g, cx, yNeck + 6, yHem, 24, sit ? 72 : 58, col);
    g.strokeStyle = sash;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx, yNeck + 18);
    g.lineTo(cx + 8, yHem - 10);
    g.stroke();
    // 披帛
    g.strokeStyle = kind === 'maid' ? '#c8b090' : '#d06058';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx - 40, yNeck + 8);
    g.quadraticCurveTo(cx - 70, yNeck + 80, cx - 36, yHem - 20);
    g.moveTo(cx + 40, yNeck + 8);
    g.quadraticCurveTo(cx + 72, yNeck + 90, cx + 30, yHem - 8);
    g.stroke();
    head(g, cx, yHead + 6, 28);
    hairLady(g, cx, yHead + 6);
    if (!sit) feet(g, cx, 600, 14);
  } else if (kind === 'dancer') {
    robe(g, cx, 240, 455, 26, 80, '#9a2c24');
    g.fillStyle = '#3a5a52';
    g.beginPath();
    g.moveTo(cx - 20, 250);
    g.lineTo(cx + 20, 250);
    g.lineTo(cx + 16, 320);
    g.lineTo(cx - 16, 320);
    g.closePath();
    g.fill();
    // 水袖
    g.fillStyle = '#e8dcc8';
    g.beginPath();
    g.moveTo(cx - 30, 260);
    g.quadraticCurveTo(cx - 120, 300, cx - 90, 420);
    g.quadraticCurveTo(cx - 40, 330, cx - 22, 280);
    g.fill();
    g.beginPath();
    g.moveTo(cx + 30, 260);
    g.quadraticCurveTo(cx + 130, 280, cx + 110, 400);
    g.quadraticCurveTo(cx + 50, 320, cx + 22, 280);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.stroke();
    head(g, cx, 188, 28);
    hairLady(g, cx, 188);
    g.fillStyle = '#1a1410';
    g.fillRect(cx - 40, 468, 30, 12);
    g.fillRect(cx + 8, 468, 30, 12);
  } else if (kind === 'pipa') {
    robe(g, cx, 255, 480, 26, 78, '#e8dcc8');
    g.strokeStyle = '#c45a48';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx + 6, 270);
    g.lineTo(cx + 14, 460);
    g.stroke();
    head(g, cx, 200, 28);
    hairLady(g, cx, 200);
    // 琵琶
    g.save();
    g.translate(cx + 36, 340);
    g.rotate(-0.5);
    g.fillStyle = '#8a6238';
    g.beginPath();
    g.ellipse(0, 20, 28, 42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-6, -70, 10, 78);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  } else if (kind === 'flute') {
    robe(g, cx, 255, 475, 24, 74, '#c8d0c0');
    g.strokeStyle = '#c45a48';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx, 270);
    g.lineTo(cx + 8, 450);
    g.stroke();
    head(g, cx, 198, 27);
    hairLady(g, cx, 198);
    g.strokeStyle = '#2a2018';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + 8, 230);
    g.lineTo(cx + 78, 218);
    g.stroke();
  } else if (kind === 'monk') {
    robe(g, cx, 230, 560, 28, 60, '#c48454');
    g.fillStyle = '#6e3b2a';
    g.beginPath();
    g.moveTo(cx - 8, 240);
    g.lineTo(cx + 50, 250);
    g.lineTo(cx + 40, 540);
    g.lineTo(cx - 20, 530);
    g.closePath();
    g.fill();
    head(g, cx, 175, 30, '#d7b898');
    g.fillStyle = 'rgba(120,120,110,0.35)';
    g.beginPath();
    g.ellipse(cx, 160, 24, 18, 0, 0, Math.PI * 2);
    g.fill();
    feet(g, cx, 600);
  }

  g.restore();
}

export function createFigureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL_W;
  canvas.height = ROWS * CELL_H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const names = Object.keys(PUPPET_INDEX);
  for (const name of names) {
    const i = PUPPET_INDEX[name];
    const b = cellBox(i);
    drawKind(g, name, b.x, b.y);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.premultiplyAlpha = false;
  return tex;
}

export function createFigures({ atmosphere, walkMap }) {
  const atlas = createFigureAtlas();
  const rand = mulberry32(1108);
  const instances = FIGURES.map((f) => {
    const idx = PUPPET_INDEX[f.kind] ?? 0;
    walkMap?.addCircle(f.x, f.z, 0.32, -0.2, 1.6);
    return {
      x: f.x,
      y: f.y ?? 0,
      z: f.z,
      w: f.w,
      h: f.h,
      uv: uvFor(idx),
      seed: f.seed ?? rand(),
      tint: f.tint || [1, 1, 1],
    };
  });
  const mesh = createBillboards({ atlas, instances, atmosphere, sway: 0.012 });
  mesh.renderOrder = 2;
  return { mesh, atlas, instances };
}
