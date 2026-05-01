const GRID_SIZE = 12;
const MAX_VEL_CLAMP = 80;
const CANVAS_W = 512;
const CANVAS_H = 512;

let sharedCanvas = null;

export function initLetterCanvas(sk) {
  sharedCanvas = sk.createGraphics(CANVAS_W, CANVAS_H, sk.P2D);
}

export function velocityToThickness(vel, minThickness, maxThickness) {
  const t = Math.min(vel / MAX_VEL_CLAMP, 1);
  return minThickness + t * (maxThickness - minThickness);
}

export function buildQuad(cx, cy, halfWidth, thick0, thick1) {
  const x0 = cx - halfWidth;
  const x1 = cx + halfWidth;
  return {
    tl: { x: x0, y: cy - thick0 / 2 },
    tr: { x: x1, y: cy - thick1 / 2 },
    br: { x: x1, y: cy + thick1 / 2 },
    bl: { x: x0, y: cy + thick0 / 2 },
  };
}

export function drawWarpedLetter(sk, letter, videoOpacity) {
  const { char, quad } = letter;
  if (!sharedCanvas) return;

  // Measure quad dimensions to render glyph at correct aspect ratio
  const quadW = Math.abs(quad.tr.x - quad.tl.x);
  const quadH = Math.abs((quad.bl.y - quad.tl.y + (quad.br.y - quad.tr.y)) / 2);
  const aspect = quadH > 0.001 ? quadW / quadH : 1;

  // Scale textSize so the glyph fills canvas proportionally to the quad shape
  const textH = CANVAS_H * 0.85;
  const textW = textH * aspect;
  const glyphSize = Math.min(textH, textW);

  sharedCanvas.clear();
  sharedCanvas.textFont(sk._typeface);
  sharedCanvas.textSize(glyphSize);
  sharedCanvas.textAlign(sk.CENTER, sk.CENTER);
  sharedCanvas.noStroke();
  sharedCanvas.fill(videoOpacity === 0 ? 0 : 255);
  sharedCanvas.text(char, CANVAS_W / 2, CANVAS_H / 2);

  const G = GRID_SIZE;
  const { tl, tr, br, bl } = quad;

  sk.push();
  sk.noStroke();
  sk.texture(sharedCanvas);
  sk.beginShape(sk.TRIANGLES);

  for (let row = 0; row < G - 1; row++) {
    for (let col = 0; col < G - 1; col++) {
      const pts = [
        [col, row],
        [col + 1, row],
        [col + 1, row + 1],
        [col, row],
        [col + 1, row + 1],
        [col, row + 1],
      ];
      for (const [c, r] of pts) {
        const u = c / (G - 1);
        const v = r / (G - 1);
        const topX = (1 - u) * tl.x + u * tr.x;
        const topY = (1 - u) * tl.y + u * tr.y;
        const botX = (1 - u) * bl.x + u * br.x;
        const botY = (1 - u) * bl.y + u * br.y;
        sk.vertex(
          (1 - v) * topX + v * botX,
          (1 - v) * topY + v * botY,
          u * CANVAS_W,
          v * CANVAS_H,
        );
      }
    }
  }

  sk.endShape();
  sk.pop();
}
