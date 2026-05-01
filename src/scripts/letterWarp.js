const GRID_SIZE = 12;
const RENDER_SIZE = 480;

let activeSketch = null;
const glyphCache = new Map();

export function initLetterCanvas(sk) {
  activeSketch = sk;
  glyphCache.clear();
}

export function buildQuadFromEdges(xLeft, xRight, topLeftY, topRightY, botLeftY, botRightY) {
  return {
    tl: { x: xLeft, y: topLeftY },
    tr: { x: xRight, y: topRightY },
    br: { x: xRight, y: botRightY },
    bl: { x: xLeft, y: botLeftY },
  };
}

export function getGlyphAspect(sk, char, fill = 255) {
  const g = getGlyphCanvas(sk, char, fill);
  return g.height > 0 ? g.width / g.height : 1;
}

function getGlyphCanvas(sk, char, fill) {
  const key = `${char}:${fill}`;
  if (glyphCache.has(key)) return glyphCache.get(key);

  sk.push();
  sk.textFont(sk._typeface);
  sk.textSize(RENDER_SIZE);
  const advance = Math.max(1, Math.ceil(sk.textWidth(char)));
  const ascent = sk.textAscent();
  const descent = sk.textDescent();
  sk.pop();

  const PAD = Math.ceil(RENDER_SIZE * 0.5);
  const bakeW = advance + PAD * 2;
  const bakeH = Math.ceil(ascent + descent) + PAD * 2;

  const bake = sk.createGraphics(bakeW, bakeH, sk.P2D);
  bake.pixelDensity(1);
  bake.textFont(sk._typeface);
  bake.textSize(RENDER_SIZE);
  bake.textAlign(sk.LEFT, sk.BASELINE);
  bake.noStroke();
  bake.fill(fill);
  bake.text(char, PAD, PAD + ascent);
  bake.loadPixels();

  const isInk = fill === 0
    ? (r, g_, b, a) => a > 8 && (r + g_ + b) / 3 < 200
    : (r, g_, b, a) => a > 8 && (r + g_ + b) / 3 > 55;

  let minX = bakeW, minY = bakeH, maxX = -1, maxY = -1;
  const px = bake.pixels;
  for (let y = 0; y < bakeH; y++) {
    for (let x = 0; x < bakeW; x++) {
      const i = (y * bakeW + x) * 4;
      if (isInk(px[i], px[i + 1], px[i + 2], px[i + 3])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    const empty = sk.createGraphics(1, 1, sk.P2D);
    glyphCache.set(key, empty);
    return empty;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const g = sk.createGraphics(cropW, cropH, sk.P2D);
  g.pixelDensity(1);
  g.clear();
  g.image(bake, 0, 0, cropW, cropH, minX, minY, cropW, cropH);
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
          u * glyph.width,
          v * glyph.height,
        );
      }
    }
  }

  sk.endShape();
  sk.pop();
}
