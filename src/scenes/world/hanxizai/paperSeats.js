import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from "three";

// A painted sitter already contains its own perspective. Register the chair to
// that same picture plane instead of trying to fit a rotated 3D box behind it.
// hip: normalized coordinates within the registered pose, measured from top-left.
export const PAPER_SEATS = {
  "li-jiaming": { hip: [0.51, 0.66], width: 0.72, facing: 0 },
  "guest-listen-right": {
    hip: [0.51, 0.98],
    width: 0.83,
    facing: 0,
    low: true,
  },
  "guest-listen-front": {
    hip: [0.43, 0.98],
    width: 1.08,
    facing: 0,
    low: true,
  },
  "red-guest-dance": { hip: [0.72, 0.68], width: 0.59, facing: -1 },
  "guest-clap-dance": { hip: [0.5, 0.68], width: 0.59, facing: 0, low: true },
  "winds-clapper": { hip: [0.49, 0.69], width: 0.65, facing: 0, low: true },
  "han-winds": { hip: [0.55, 0.98], width: 1.17, facing: 0 },
  "farewell-seated": { hip: [0.28, 0.65], width: 0.57, facing: 1 },
};

export function seatContact(person) {
  const spec = PAPER_SEATS[person.id];
  if (!spec) return null;
  const [w, h] = person.frameSize ?? person.rect.slice(2);
  return {
    x: ((spec.hip[0] - 0.5) * person.h * w) / h,
    y: (1 - spec.hip[1]) * person.h,
  };
}

export function createPaperSeat(person) {
  const spec = PAPER_SEATS[person.id];
  if (!spec) return null;
  const contact = seatContact(person),
    group = new Group();
  group.name = `seat:${person.id}`;
  group.position.z = -0.006;
  const mats = Object.fromEntries(
    Object.entries({
      ink: "#353125",
      wood: "#62543a",
      silk: "#8c977c",
      trim: "#b3a47d",
    }).map(([k, color]) => [
      k,
      new MeshBasicMaterial({ color, side: DoubleSide }),
    ]),
  );
  function polygon(points, color, depth = 0) {
    const shape = new Shape();
    points.forEach(([x, y], i) =>
      i ? shape.lineTo(x, y) : shape.moveTo(x, y),
    );
    shape.closePath();
    const mesh = new Mesh(new ShapeGeometry(shape), mats[color]);
    mesh.position.z = depth;
    group.add(mesh);
  }
  function stroke(a, b, width = 0.026, color = "ink", depth = 0.001) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    const x = ((-dy / len) * width) / 2,
      y = ((dx / len) * width) / 2;
    polygon(
      [
        [a[0] + x, a[1] + y],
        [b[0] + x, b[1] + y],
        [b[0] - x, b[1] - y],
        [a[0] - x, a[1] - y],
      ],
      color,
      depth,
    );
  }
  const { x, y } = contact,
    w = spec.width,
    f = spec.facing;
  const floor = -person.y + 0.005;
  // The cushion's front lip passes immediately below the painted hip. Small
  // diagonal edges retain the oblique furniture drawing in the original scroll.
  const left = x - w * (f === 1 ? 0.18 : f === -1 ? 0.82 : 0.5);
  const right = left + w,
    skew = f * 0.11;
  const frontY = y - 0.025,
    backY = y + 0.1;
  polygon(
    [
      [left, frontY],
      [right, frontY],
      [right - skew, backY],
      [left - skew, backY],
    ],
    "silk",
  );
  stroke([left, frontY], [right, frontY], 0.043);
  stroke([left, frontY + 0.018], [right, frontY + 0.018], 0.01, "trim", 0.002);
  for (const px of [left + 0.025, right - 0.025]) {
    stroke(
      [px - skew, backY],
      [px - skew, floor + 0.08],
      0.027,
      "wood",
      -0.002,
    );
    stroke([px, frontY], [px, floor], 0.034);
    stroke([px - 0.035, floor], [px + 0.035, floor], 0.029);
  }
  stroke([left + 0.03, floor + 0.15], [right - 0.03, floor + 0.15], 0.021);
  if (!spec.low) {
    const top = y + (person.id === "han-winds" ? 0.96 : 0.77);
    const backX = f === 1 ? left - skew : f === -1 ? right - skew : left - skew;
    const otherX = f ? backX + f * 0.2 : right - skew;
    polygon(
      [
        [backX, backY],
        [otherX, backY + 0.04],
        [otherX, top - 0.05],
        [backX, top],
      ],
      "silk",
      -0.001,
    );
    stroke([backX, backY], [backX, top], 0.031);
    stroke([otherX, backY], [otherX, top - 0.05], 0.028);
    stroke([backX, top], [otherX, top - 0.05], 0.037);
    if (f) {
      const edge = f === 1 ? right : left;
      stroke([backX, y + 0.26], [edge, y + 0.18], 0.028);
      stroke([edge, y + 0.18], [edge, frontY], 0.023);
    }
  }
  group.userData.contact = contact;
  group.userData.dispose = () => {
    group.children.forEach((m) => m.geometry.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  };
  return group;
}
