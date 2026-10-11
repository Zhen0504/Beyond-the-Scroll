import {
  DepthTexture,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * 后期：
 *  1. 墨线 —— 依据深度二阶差分勾出轮廓，近浓远淡，模仿勾勒；
 *  2. 绢纹 —— 叠加从原画取样的绢底纹理；
 *  3. 古画调色与暗角，最后转换到 sRGB 输出。
 */
const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tSilk;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uLine;
uniform float uSilkMean;
uniform float uFade;
uniform vec3 uFadeColor;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 px = uLine / uRes;
  float d = linDepth(vUv);
  float dl = linDepth(vUv - vec2(px.x, 0.0));
  float dr = linDepth(vUv + vec2(px.x, 0.0));
  float du = linDepth(vUv + vec2(0.0, px.y));
  float dd = linDepth(vUv - vec2(0.0, px.y));
  float lap = abs(dl + dr + du + dd - 4.0 * d) / max(d, 0.001);
  float edge = smoothstep(0.035, 0.14, lap);
  edge *= 1.0 - smoothstep(160.0, 900.0, d);

  vec3 col = texture2D(tColor, vUv).rgb;
  vec3 ink = col * vec3(0.32, 0.3, 0.27);
  col = mix(col, ink, edge * 0.62);

  // 绢纹
  vec2 suv = vUv * uRes / 700.0;
  float silk = dot(texture2D(tSilk, suv).rgb, vec3(0.3333)) / uSilkMean;
  col *= mix(1.0, silk, 0.2);

  // 古画调色：轻微提亮暗部、偏暖
  col = col * 0.94 + vec3(0.03, 0.026, 0.018);

  // 暗角：四周像旧绢一样泛黄变深
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.85);
  float vig = smoothstep(0.78, 0.3, length(q));
  col = mix(col * vec3(0.72, 0.62, 0.48), col, vig);

  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;

export class PaintRenderer {
  constructor(canvas, { silkTexture, silkMean = 0.3 }) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);

    const size = this._size();
    this.target = new WebGLRenderTarget(size.x, size.y, {
      type: HalfFloatType,
      samples: 4,
      depthTexture: new DepthTexture(size.x, size.y),
    });

    this.postMaterial = new ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tSilk: { value: silkTexture },
        uRes: { value: new Vector2(size.x, size.y) },
        uNear: { value: 0.1 },
        uFar: { value: 4000 },
        uLine: { value: this.pixelRatio },
        uSilkMean: { value: silkMean },
        uFade: { value: 0 },
        uFadeColor: { value: null },
      },
    });
    this.postScene = new Scene();
    this.postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene.add(new Mesh(new PlaneGeometry(2, 2), this.postMaterial));

    this.resize();
  }

  _size() {
    const w = Math.max(1, Math.floor(window.innerWidth * this.pixelRatio));
    const h = Math.max(1, Math.floor(window.innerHeight * this.pixelRatio));
    return new Vector2(w, h);
  }

  setPixelRatio(ratio) {
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.postMaterial.uniforms.uLine.value = ratio;
    this.resize();
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const s = this._size();
    this.target.setSize(s.x, s.y);
    this.postMaterial.uniforms.uRes.value.copy(s);
  }

  render(scene, camera) {
    const u = this.postMaterial.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.target.dispose();
    this.target.depthTexture?.dispose();
    this.postMaterial.dispose();
    this.renderer.dispose();
  }
}
