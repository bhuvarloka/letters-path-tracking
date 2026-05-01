const GRID_SIZE = 12;
const MAX_VEL_CLAMP = 80;
const CANVAS_W = 512;
const CANVAS_H = 512;

let activeSketch = null;
const glyphCache = new Map(); // char:fill -> p5.Graphics

export function initLetterCanvas(sk) {
  activeSketch = sk;
  glyphCache.clear();
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

function getGlyphCanvas(sk, char, fill) {
  const key = `${char}:${fill}`;
  if (glyphCache.has(key)) return glyphCache.get(key);

  const g = sk.createGraphics(CANVAS_W, CANVAS_H, sk.P2D);
  g.textFont(sk._typeface);
  g.textSize(CANVAS_H * 0.85);
  g.textAlign(sk.CENTER, sk.CENTER);
  g.noStroke();
  g.fill(fill);
  g.text(char, CANVAS_W / 2, CANVAS_H / 2);
  glyphCache.set(key, g);
  return g;
}

export function drawWarpedLetter(sk, letter, videoOpacity) {
  const { char, quad } = letter;
  if (activeSketch !== sk) return;

  const fill = videoOpacity === 0 ? 0 : 255;
  const glyph = getGlyphCanvas(sk, char, fill);

  const G = GRID_SIZE;
  const { tl, tr, br, bl } = quad;

  sk.push();
  sk.noStroke();
  sk.texture(glyph);
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
