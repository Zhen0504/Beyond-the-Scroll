import { Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, box, cyl } from '../../../engine/painted.js';
import { PROPS } from './zones.js';

/**
 * 分区补充陈设：舞筵、席垫、长案、盆架。
 * 位置与尺寸取自 zones.js 的 PROPS（原作有、基础陈设未列的那几件），
 * 材质沿用厅堂的工笔设色材质，与榻、案、烛台同一套色。
 */

const WEAVE = '#7a3f34'; // 舞筵缘边的朱
const REED = '#c9a76a'; // 席心
const LACQUER = '#4a2a22';
const BRONZE = '#8a6a3c';

/** 舞筵 / 席垫：两层薄席 + 缘边 */
function matParts(s) {
  const y0 = 0.006;
  const t = Math.min(s.h ?? 0.05, 0.06);
  const parts = [
    box(s.w, t * 0.6, s.d, WEAVE, s.x, y0, s.z, MAT.cloth),
    box(s.w * 0.88, t * 0.5, s.d * 0.86, REED, s.x, y0 + t * 0.6, s.z, MAT.thatch),
  ];
  for (const sz of [-1, 1]) parts.push(box(s.w, t * 0.45, 0.07, LACQUER, s.x, y0, s.z + sz * (s.d / 2 - 0.03), MAT.cloth));
  for (const sx of [-1, 1]) parts.push(box(0.07, t * 0.45, s.d, LACQUER, s.x + sx * (s.w / 2 - 0.03), y0, s.z, MAT.cloth));
  return parts;
}

/** 长案：翘头案面 + 四条腿 */
function longTableParts(s) {
  const h = s.h ?? 0.44;
  const parts = [box(s.w, 0.06, s.d, LACQUER, s.x, h - 0.06, s.z, MAT.wood)];
  for (const sx of [-1, 1]) {
    parts.push(box(0.10, 0.05, s.d + 0.10, LACQUER, s.x + sx * (s.w / 2 - 0.05), h, s.z, MAT.wood));
    parts.push(box(0.09, h - 0.06, 0.09, LACQUER, s.x + sx * (s.w / 2 - 0.12), 0, s.z - s.d / 2 + 0.09, MAT.wood));
    parts.push(box(0.09, h - 0.06, 0.09, LACQUER, s.x + sx * (s.w / 2 - 0.12), 0, s.z + s.d / 2 - 0.09, MAT.wood));
  }
  parts.push(box(s.w * 0.7, 0.05, 0.06, LACQUER, s.x, h * 0.42, s.z - s.d / 2 + 0.09, MAT.wood));
  return parts;
}

/** 盆架：三弯腿木架 + 铜盆 + 巾 */
function basinParts(s) {
  const h = s.h ?? 1.0;
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(cyl(0.035, h - 0.18, '#6b4a2e', s.x + Math.cos(a) * 0.26, 0, s.z + Math.sin(a) * 0.26, 6, MAT.wood));
    parts.push(cyl(0.022, h - 0.1, '#6b4a2e', s.x + Math.cos(a + 1.05) * 0.14, 0, s.z + Math.sin(a + 1.05) * 0.14, 5, MAT.wood));
  }
  parts.push(cyl(0.3, 0.05, '#6b4a2e', s.x, h - 0.18, s.z, 12, MAT.wood));
  parts.push(cyl(0.26, 0.14, BRONZE, s.x, h - 0.12, s.z, 14, MAT.plain));
  parts.push(cyl(0.22, 0.03, '#cfd8d2', s.x, h - 0.02, s.z, 14, MAT.plain));
  parts.push(box(0.34, 0.02, 0.24, '#e4dcc6', s.x + 0.34, h - 0.06, s.z - 0.06, MAT.cloth));
  return parts;
}

/**
 * 生成补充陈设。
 * @param {{walkMap?:object, paintedMaterial:object}} opts
 * @returns {{mesh:Mesh, parts:number}}
 */
export function createProps({ walkMap, paintedMaterial }) {
  const parts = [];
  for (const s of PROPS) {
    if (s.kind === 'mat' || s.kind === 'rug') {
      parts.push(...matParts(s)); // 席上可走，不做碰撞
    } else if (s.kind === 'longTable') {
      parts.push(...longTableParts(s));
      walkMap?.addBox(s.x, s.z, s.w / 2 + 0.06, s.d / 2 + 0.06, 0, -0.2, (s.h ?? 0.45) + 0.1);
    } else if (s.kind === 'basin') {
      parts.push(...basinParts(s));
      walkMap?.addCircle(s.x, s.z, 0.42, -0.2, (s.h ?? 1.0) + 0.1);
    }
  }
  const mesh = new Mesh(mergeGeometries(parts), paintedMaterial);
  mesh.frustumCulled = false;
  return { mesh, parts: PROPS.length };
}
