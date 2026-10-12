import { CanvasTexture, SRGBColorSpace } from "three";
import { mulberry32 } from "../../../utils/math.js";

/** Hand-drawn screen landscapes and brocade, rather than a second copy of the
 * banquet on every screen. Deliberately quiet, weathered brushwork. */
export function screenPainting(plain = false) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 640;
  const g = c.getContext("2d"),
    rand = mulberry32(1927);
  g.fillStyle = plain ? "#b9b395" : "#a29870";
  g.fillRect(0, 0, 768, 640);
  for (let i = 0; i < 14000; i++) {
    const x = rand() * 768,
      y = rand() * 640;
    g.fillStyle = `rgba(${rand() > 0.5 ? "231,216,173" : "70,66,46"},${rand() * 0.035})`;
    g.fillRect(x, y, rand() * 13 + 0.2, rand() * 2 + 0.2);
  }
  if (!plain) {
    // Successive ink washes, low ridges receding into unpainted silk.
    for (let layer = 0; layer < 5; layer++) {
      g.beginPath();
      g.moveTo(0, 640);
      for (let x = 0; x <= 768; x += 12) {
        const y =
          350 +
          layer * 49 +
          Math.sin(x * 0.008 + layer * 2.1) * 42 +
          Math.sin(x * 0.023 + layer) * 13;
        g.lineTo(x, y);
      }
      g.lineTo(768, 640);
      g.fillStyle = `rgba(59,66,51,${0.025 + layer * 0.018})`;
      g.fill();
    }
    function branch(x, y, len, angle, width, depth) {
      const ex = x + Math.cos(angle) * len,
        ey = y + Math.sin(angle) * len;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (ex - x) * 0.28 + 7, y + (ey - y) * 0.7, ex, ey);
      g.strokeStyle = "rgba(39,46,36,.63)";
      g.lineWidth = width;
      g.lineCap = "round";
      g.stroke();
      if (depth > 0) {
        branch(ex, ey, len * 0.74, angle - 0.42, width * 0.65, depth - 1);
        branch(ex, ey, len * 0.6, angle + 0.6, width * 0.58, depth - 1);
        if (depth > 2)
          branch(
            x + (ex - x) * 0.6,
            y + (ey - y) * 0.6,
            len * 0.57,
            angle - 1,
            width * 0.55,
            depth - 1,
          );
      } else {
        for (let i = 0; i < 42; i++) {
          const a = rand() * Math.PI * 2,
            r = rand() * 29;
          g.beginPath();
          g.ellipse(
            ex + Math.cos(a) * r,
            ey + Math.sin(a) * r * 0.4,
            1 + rand() * 4,
            0.8 + rand() * 2,
            rand(),
            0,
            Math.PI * 2,
          );
          g.fillStyle = `rgba(42,53,39,${0.08 + rand() * 0.19})`;
          g.fill();
        }
      }
    }
    branch(546, 593, 141, -1.77, 12, 5);
    branch(225, 585, 91, -1.32, 7, 4);
    for (let i = 0; i < 210; i++) {
      const x = rand() * 768,
        y = 540 + rand() * 100;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(
        x - 3,
        y - 7,
        x + rand() * 12 - 6,
        y - 12 - rand() * 16,
      );
      g.strokeStyle = "rgba(53,65,48,.18)";
      g.lineWidth = 0.5;
      g.stroke();
    }
  }
  g.strokeStyle = "rgba(37,34,24,.45)";
  g.lineWidth = 3;
  g.strokeRect(10, 10, 748, 620);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function brocadeTexture(color = "#9d4938") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(224,202,151,.23)";
  g.lineWidth = 1;
  for (let y = -32; y < 288; y += 32)
    for (let x = -32; x < 288; x += 32) {
      g.beginPath();
      g.moveTo(x, y - 14);
      g.quadraticCurveTo(x + 3, y - 3, x + 14, y);
      g.quadraticCurveTo(x + 3, y + 3, x, y + 14);
      g.quadraticCurveTo(x - 3, y + 3, x - 14, y);
      g.quadraticCurveTo(x - 3, y - 3, x, y - 14);
      g.stroke();
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.stroke();
    }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
