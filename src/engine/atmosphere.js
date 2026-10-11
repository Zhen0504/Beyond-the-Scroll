import { Color, Vector3 } from 'three';

/**
 * 场景共享的大气 / 时间 uniforms。所有自定义材质引用同一份对象，修改一处即全局生效。
 */
export function createAtmosphere({ fogNear = '#9db0ae', fogFar = '#e7dcc3', sunDir = [-0.45, 0.78, 0.42] } = {}) {
  return {
    uTime: { value: 0 },
    uFogNear: { value: new Color(fogNear) },
    uFogFar: { value: new Color(fogFar) },
    uSunDir: { value: new Vector3(...sunDir).normalize() },
    // 原画绢底的平均色（线性），供原画取样重新着色
    uSilkColor: { value: new Color(0.3, 0.18, 0.07) },
    // 笔触纹理的平均亮度，用于把笔触归一成明暗起伏
    uBrushMean: { value: 0.3 },
  };
}
