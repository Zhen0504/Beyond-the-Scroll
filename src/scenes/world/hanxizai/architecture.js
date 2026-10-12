import {
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAT, box, cyl, paint } from "../../../engine/painted.js";
import { NOISE_GLSL } from "../../../engine/shaders/common.glsl.js";
import {
  BEDS,
  DRUMS,
  MUSIC_MATS,
  ROOMS,
  SCREENS,
  SEATS,
  TABLES,
} from "./layout.js";
import { brocadeTexture, screenPainting } from "./surfacePainter.js";

const C = {
  ink: "#292920",
  edge: "#524735",
  wood: "#474131",
  gold: "#9f8658",
  jade: "#829886",
  ivory: "#cbbd93",
  red: "#963e32",
};
function material() {
  return new ShaderMaterial({
    side: DoubleSide,
    vertexShader: `
    attribute vec3 color; attribute float aMat;
    varying vec3 vColor; varying vec3 vWorld; varying vec3 vNormal; varying float vMat;
    void main(){vColor=color;vMat=aMat;vNormal=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}
  `,
    fragmentShader: `${NOISE_GLSL}
    varying vec3 vColor; varying vec3 vWorld; varying vec3 vNormal; varying float vMat;
    void main(){
      vec3 p=vWorld,n=normalize(vNormal);vec3 c=vColor;
      float grain=snoise(p*28.)*.032+snoise(p*3.5)*.032;
      c*=.93+grain+max(0.,n.y)*.08;
      if(vMat>6.5) c*=.95+.05*sin(p.x*95.+p.z*30.);
      if(vMat>3.5&&vMat<4.5) c*=1.-.045*abs(sin(p.y*73.+snoise(p.xz*9.)*3.));
      float fog=smoothstep(13.,40.,distance(cameraPosition,p));
      c=mix(c,vec3(.56,.46,.31),fog*.78);
      gl_FragColor=vec4(c,1.);
    }
  `,
  });
}
function ring(r, t, color, x, y, z) {
  const g = new TorusGeometry(r, t, 6, 32);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}
function vessel(profile, color, x, y, z) {
  const g = new LatheGeometry(
    profile.map((p) => new Vector2(...p)),
    24,
  );
  g.translate(x, y, z);
  return paint(g, color);
}
function collision(walkMap, x, z, w, d, h, angle = 0) {
  walkMap.addBox(x, z, w / 2 + 0.035, d / 2 + 0.035, angle, -0.2, h);
}

export function createArchitecture({ walkMap, silkTexture }) {
  const group = new Group(),
    parts = [],
    decor = [];
  const mat = material();
  const add = (...p) => parts.push(...p);
  const texMaterial = (map) =>
    new MeshBasicMaterial({ map, side: DoubleSide, color: "#e0d5b9" });
  const landscape = texMaterial(screenPainting()),
    plain = texMaterial(screenPainting(true));
  const curtain = texMaterial(brocadeTexture("#873f31"));
  const fabric = texMaterial(brocadeTexture("#789086"));
  function panel(w, h, x, y, z, material, angle = 0) {
    const m = new Mesh(new PlaneGeometry(w, h), material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = angle;
    decor.push(m);
    return m;
  }
  function foot(x, z, h = 0.55, r = 0.055) {
    add(
      cyl(r, h, C.ink, x, 0, z, 8),
      box(r * 2.9, 0.055, r * 2.7, C.edge, x, 0.015, z),
    );
  }
  function seat(spec) {
    const start = parts.length;
    const { x, z, kind } = spec,
      w = spec.w ?? 0.67,
      d = spec.d ?? 0.59,
      h = spec.h ?? 0.49;
    if (kind === "stool") {
      add(
        vessel(
          [
            [0.23, 0],
            [0.3, 0.04],
            [0.25, 0.13],
            [0.24, 0.3],
            [0.3, 0.42],
            [0.28, 0.47],
          ],
          C.jade,
          x,
          0,
          z,
        ),
        ring(0.28, 0.014, C.gold, x, 0.44, z),
      );
      collision(walkMap, x, z, 0.6, 0.6, 0.5);
      return;
    }
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        foot(x + dx * (w / 2 - 0.05), z + dz * (d / 2 - 0.04), h, 0.032);
    add(
      box(w, 0.055, d, C.ink, x, h, z),
      box(w - 0.07, 0.027, d - 0.05, C.jade, x, h + 0.055, z, MAT.cloth),
    );
    for (const dx of [-1, 1]) {
      const sx = x + dx * (w / 2 - 0.035);
      add(cyl(0.029, 0.79, C.ink, sx, h, z - d / 2, 8));
      add(box(0.045, 0.05, d, C.ink, sx, 0.18, z));
      add(box(0.035, 0.18, 0.035, C.ink, sx, h, z + d * 0.32));
      add(box(0.04, 0.035, d * 0.9, C.ink, sx, h + 0.18, z));
    }
    add(
      box(w, 0.055, 0.05, C.ink, x, h + 0.78, z - d / 2),
      box(w * 0.59, 0.61, 0.025, C.jade, x, h + 0.13, z - d / 2),
    );
    add(box(w, 0.032, 0.03, C.ink, x, 0.2, z + d / 2));
    if (spec.angle)
      parts
        .slice(start)
        .forEach((g) =>
          g.translate(-x, 0, -z).rotateY(spec.angle).translate(x, 0, z),
        );
    collision(walkMap, x, z, w, d, h + 1, spec.angle ?? 0);
  }
  function couch(b) {
    const { x, z, w, d, h } = b;
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        foot(x + dx * (w / 2 - 0.13), z + dz * (d / 2 - 0.1), h, 0.065);
    add(
      box(w, 0.13, d, C.ink, x, h - 0.13, z),
      box(w - 0.09, 0.052, d - 0.09, b.cloth, x, h, z, MAT.cloth),
    );
    add(box(w - 0.16, 0.16, 0.06, C.ink, x, h - 0.28, z + d / 2 - 0.05));
    for (let k = 0; k < 9; k++)
      add(
        box(
          0.025,
          0.13,
          0.03,
          C.edge,
          x - w * 0.43 + k * w * 0.107,
          h - 0.28,
          z + d / 2 - 0.01,
        ),
      );
    // Raised three-sided surround, with inset silk panels and fine mouldings.
    const backH = b.canopy ? 0.72 : 1.12;
    add(box(w + 0.09, backH, 0.085, C.ink, x, h, z - d / 2));
    add(
      box(w - 0.3, backH - 0.25, 0.015, C.gold, x, h + 0.12, z - d / 2 + 0.049),
    );
    add(
      box(
        w - 0.4,
        backH - 0.35,
        0.018,
        b.cloth,
        x,
        h + 0.17,
        z - d / 2 + 0.059,
        MAT.cloth,
      ),
    );
    for (const dx of [-1, 1]) {
      const sx = x + (dx * w) / 2;
      add(box(0.09, 0.48, d, C.ink, sx, h, z));
      add(box(0.015, 0.29, d - 0.22, C.gold, sx - dx * 0.051, h + 0.09, z));
      add(cyl(0.05, backH + 0.1, C.ink, sx, h, z - d / 2, 8));
    }
    // Bolsters are rounded, not square blocks.
    for (const dx of b.canopy ? [-1, 1] : []) {
      const pillow = new SphereGeometry(1, 16, 10);
      pillow.scale(0.28, 0.11, 0.2);
      pillow.translate(x + dx * w * 0.31, h + 0.14, z - 0.25);
      add(paint(pillow, dx > 0 ? C.jade : C.ivory, MAT.cloth));
    }
    collision(walkMap, x, z, w, d, h + 0.45);
    if (b.canopy) {
      const top = 2.95;
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          add(cyl(0.035, top, C.ink, x + (dx * w) / 2, 0, z + (dz * d) / 2, 8));
      add(box(w + 0.14, 0.06, d + 0.14, C.ink, x, top, z));
      panel(w, 2.3, x, 0.62, z - d / 2 + 0.09, fabric);
      for (const [side, ww] of [
        [-1, 0.58],
        [1, 0.58],
      ]) {
        const m = panel(
          ww,
          2.3,
          x + side * (w / 2 - 0.23),
          0.63,
          z + d / 2 + 0.03,
          curtain,
        );
        m.geometry.dispose();
        m.geometry = new PlaneGeometry(ww, 2.3, 14, 25);
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const py = p.getY(i),
            px = p.getX(i);
          p.setXYZ(
            i,
            px + side * Math.sin(((py + 1.15) / 2.3) * Math.PI) * 0.2,
            py,
            Math.sin(px * 57) * 0.027,
          );
        }
        p.needsUpdate = true;
        m.geometry.computeVertexNormals();
      }
      // A scalloped valance along the top edge.
      const valance = panel(w, 0.4, x, top - 0.41, z + d / 2 + 0.04, curtain);
      valance.geometry.dispose();
      valance.geometry = new PlaneGeometry(w, 0.38, 50, 3);
      const vp = valance.geometry.attributes.position;
      for (let i = 0; i < vp.count; i++)
        vp.setY(i, vp.getY(i) - Math.cos(vp.getX(i) * 5) * 0.06);
      vp.needsUpdate = true;
    }
  }
  function table(t) {
    const { x, z, w, d, h } = t;
    add(
      box(w, 0.055, d, C.ink, x, h - 0.055, z),
      box(w - 0.1, 0.035, d - 0.06, C.edge, x, h - 0.105, z),
    );
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        foot(x + dx * (w / 2 - 0.09), z + dz * (d / 2 - 0.07), h - 0.08, 0.025);
    for (const dz of [-1, 1])
      add(
        box(
          w - 0.14,
          0.035,
          0.022,
          C.ink,
          x,
          h * 0.26,
          z + dz * (d / 2 - 0.07),
        ),
      );
    for (let i = 0; i < 4; i++) {
      const px = x - w * 0.36 + i * w * 0.24;
      add(
        vessel(
          [
            [0.02, 0],
            [0.08, 0.018],
            [0.12, 0.045],
            [0.13, 0.048],
          ],
          i % 2 ? C.ivory : C.jade,
          px,
          h,
          z,
        ),
      );
      add(ring(0.118, 0.009, C.gold, px, h + 0.048, z));
      for (let j = 0; j < 3; j++) {
        const g = new SphereGeometry(0.032, 9, 6);
        g.translate(px + (j - 1) * 0.048, h + 0.065, z);
        add(paint(g, "#915d3d"));
      }
    }
    add(
      vessel(
        [
          [0.035, 0],
          [0.06, 0.02],
          [0.085, 0.13],
          [0.055, 0.2],
          [0.035, 0.23],
          [0.045, 0.26],
        ],
        C.ivory,
        x + w * 0.23,
        h,
        z - 0.18,
      ),
    );
    collision(walkMap, x, z, w, d, h + 0.15);
  }
  function screen(s) {
    // Rotate frame, insert and collision together: no invisible axis-aligned wall.
    const local = [];
    const { length: w, height: h } = s;
    const b = (ww, hh, dd, c, x, y, z) =>
      local.push(box(ww, hh, dd, c, x, y, z));
    for (const sign of [-1, 1]) {
      b(0.09, h + 0.13, 0.1, C.ink, (sign * w) / 2, 0, 0);
      b(0.38, 0.09, 0.62, C.ink, sign * (w / 2 - 0.05), 0, 0);
      b(0.19, 0.18, 0.34, C.edge, sign * (w / 2 - 0.05), 0.07, 0);
      b(0.027, h - 0.17, 0.035, C.gold, sign * (w / 2 - 0.09), 0.13, 0.064);
    }
    b(w, 0.09, 0.1, C.ink, 0, 0.14, 0);
    b(w, 0.09, 0.1, C.ink, 0, h, 0);
    b(w - 0.17, 0.022, 0.025, C.gold, 0, h - 0.06, 0.057);
    const frame = new Mesh(mergeGeometries(local), mat);
    local.forEach((g) => g.dispose());
    frame.position.set(s.x, 0, s.z);
    frame.rotation.y = s.angle;
    decor.push(frame);
    panel(
      w - 0.16,
      h - 0.2,
      s.x,
      0.23,
      s.z,
      s.motif === "plain" ? plain : landscape,
      s.angle,
    );
    collision(walkMap, s.x, s.z, w + 0.1, 0.38, h, s.angle);
  }
  BEDS.forEach(couch);
  TABLES.forEach(table);
  SEATS.forEach(seat);
  SCREENS.forEach(screen);
  // Han's basin belongs to the intact painted silhouette; do not duplicate it.
  const towel = panel(0.45, 0.86, 27.9, 0.04, -0.24, fabric);
  towel.geometry.dispose();
  towel.geometry = new PlaneGeometry(0.45, 0.86, 16, 24);
  const tp = towel.geometry.attributes.position;
  for (let i = 0; i < tp.count; i++)
    tp.setZ(
      i,
      Math.sin(tp.getX(i) * 49) * 0.016 + Math.max(0, tp.getY(i) - 0.24) * 1.3,
    );
  tp.needsUpdate = true;
  towel.geometry.computeVertexNormals();
  for (const d of DRUMS) {
    const { x, z, r, h } = d;
    add(
      vessel(
        [
          [r * 0.8, 0],
          [r * 0.9, 0.08],
          [r * 0.72, 0.25],
          [r * 0.75, 0.5],
          [r, 0.86],
          [r, h],
        ],
        C.red,
        x,
        0,
        z,
      ),
    );
    for (const y of [0.05, 0.12, 0.2, 0.27, 0.34, h - 0.05])
      add(ring(r * (y > 0.5 ? 1 : 0.8), 0.014, C.gold, x, y, z));
    add(cyl(r * 0.97, 0.025, C.ivory, x, h, z, 40, MAT.cloth));
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        g = new SphereGeometry(0.018, 6, 5);
      g.translate(x + Math.cos(a) * r, h - 0.015, z + Math.sin(a) * r);
      add(paint(g, C.gold));
    }
    collision(walkMap, x, z, r * 2, r * 2, h);
  }
  for (const m of MUSIC_MATS) {
    add(box(m.w, 0.013, m.d, "#a69b74", m.x, 0.002, m.z, MAT.cloth));
    for (let i = 0; i < 50; i++)
      add(
        box(
          m.w,
          0.002,
          0.007,
          "#b8aa80",
          m.x,
          0.016,
          m.z - m.d / 2 + (i * m.d) / 50,
        ),
      );
  }
  const stages = ROOMS.map(() => new Group());
  const sectionAt = (x) =>
    Math.max(
      0,
      ROOMS.findIndex((r) => x < r.maxX),
    );
  const buckets = ROOMS.map(() => []);
  parts.forEach((g) => {
    g.computeBoundingBox();
    buckets[sectionAt((g.boundingBox.min.x + g.boundingBox.max.x) / 2)].push(g);
  });
  buckets.forEach((items, i) => {
    if (items.length) stages[i].add(new Mesh(mergeGeometries(items), mat));
  });
  parts.forEach((g) => g.dispose());
  decor.forEach((m) => stages[sectionAt(m.position.x)].add(m));
  stages.forEach((s, i) => {
    s.name = ROOMS[i].id;
    group.add(s);
  });

  const floorMat = new ShaderMaterial({
    uniforms: {
      tSilk: { value: silkTexture },
      uPaper: { value: new Color("#c4ad84") },
    },
    vertexShader: `
    varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}
  `,
    fragmentShader: `${NOISE_GLSL}
    uniform sampler2D tSilk;uniform vec3 uPaper;varying vec3 vWorld;
    void main(){
      vec2 p=vWorld.xz;
      float weave=dot(texture2D(tSilk,p*.19).rgb,vec3(.333));
      float wash=snoise(p*.23)*.048+snoise(p*1.8)*.015;
      vec3 c=uPaper*(.95+wash+(weave-.3)*.12);
      float anchor=exp(-pow((p.y+1.6)*.34,2.));
      c*=1.-anchor*.075;
      float fade=smoothstep(9.,38.,distance(cameraPosition,vWorld));
      c=mix(c,vec3(.56,.46,.31),fade);
      gl_FragColor=vec4(c,1.);
    }
  `,
  });
  const floor = new Mesh(new PlaneGeometry(600, 600), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(30, -0.02, 0);
  group.add(floor);
  return {
    group,
    stages,
    material: mat,
    setSection(id) {
      stages.forEach((s) => {
        s.visible = s.name === id;
      });
    },
  };
}
