import { CanvasTexture, SRGBColorSpace } from "three";

/** Use the reviewed alpha channel, never a polygon through a painted face.
 * Insets and transparent gutters prevent neighboring figures leaking into UVs. */
export function createPuppetAtlas(images, cast) {
  const cols = 8,
    cellW = 384,
    cellH = 576,
    pad = 8;
  const count = cast.reduce((sum, p) => sum + (p.frames?.length ?? 1), 0);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cellW;
  canvas.height = Math.ceil(count / cols) * cellH;
  const g = canvas.getContext("2d");
  let i = 0;
  const cells = cast.map((person) => {
    const frames = (person.frames ?? [{ rect: person.rect }]).map((frame) => {
      const [sx, sy, sw, sh] = frame.rect;
      const [w, h] = person.frameSize ?? [sw, sh];
      const [dx, dy] = frame.offset ?? [0, 0];
      const scale = Math.min((cellW - 2 * pad) / w, (cellH - 2 * pad) / h);
      const x = (i % cols) * cellW + pad,
        y = Math.floor(i / cols) * cellH + pad;
      g.drawImage(
        images[person.sheet],
        sx,
        sy,
        sw,
        sh,
        x + dx * scale,
        y + dy * scale,
        sw * scale,
        sh * scale,
      );
      i++;
      return {
        bounds: { w, h },
        u0: x / canvas.width,
        v1: 1 - y / canvas.height,
        u1: (x + w * scale) / canvas.width,
        v0: 1 - (y + h * scale) / canvas.height,
      };
    });
    return { ...frames[0], frames };
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, cells, canvas };
}
