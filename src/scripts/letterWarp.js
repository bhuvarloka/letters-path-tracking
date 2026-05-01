import { WARP_GRID_COLS, WARP_GRID_ROWS, GLYPH_RENDER_SIZE } from "./config";

let activeSketch = null;
const glyphCache = new Map();

export function initLetterCanvas(sk) {
  activeSketch = sk;
  glyphCache.clear();
}

// topEdge / botEdge: arrays of {x,y} with length >= 2, evenly spaced along the letter width.
// The warp samples these per grid column so curves in the drawn path are preserved.
export function buildEdges(topEdge, botEdge) {
  return { topEdge, botEdge };
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
  sk.textSize(GLYPH_RENDER_SIZE);
  const advance = Math.max(1, Math.ceil(sk.textWidth(char)));
  const ascent = sk.textAscent();
  const descent = sk.textDescent();
  sk.pop();

  const PAD = Math.ceil(GLYPH_RENDER_SIZE * 0.5);
  const bakeW = advance + PAD * 2;
  const bakeH = Math.ceil(ascent + descent) + PAD * 2;

  const bake = sk.createGraphics(bakeW, bakeH, sk.P2D);
  bake.pixelDensity(1);
  bake.textFont(sk._typeface);
  bake.textSize(GLYPH_RENDER_SIZE);
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

function sampleEdge(edge, u) {
  const last = edge.length - 1;
  const f = u * last;
  const i = Math.min(Math.floor(f), last - 1);
  const t = f - i;
  const a = edge[i];
  const b = edge[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function renderWarpedGlyph(sk, letter, videoOpacity, maxColFraction, previewAlpha, color) {
  const { char, edges } = letter;
  if (activeSketch !== sk) return;

  const fill = videoOpacity === 0 ? 0 : 255;
  const glyph = getGlyphCanvas(sk, char, fill);
  const { topEdge, botEdge } = edges;

  const GC = WARP_GRID_COLS;
  const GR = WARP_GRID_ROWS;
  const maxCol = Math.max(1, Math.round(maxColFraction * (GC - 1)));

  sk.push();
  sk.noStroke();
  if (previewAlpha !== null) {
    sk.tint(...color, previewAlpha);
  } else {
    sk.tint(...color);
  }
  sk.texture(glyph);
  sk.beginShape(sk.TRIANGLES);

  for (let row = 0; row < GR - 1; row++) {
    for (let col = 0; col < maxCol; col++) {
      const u0 = col / (GC - 1);
      const u1 = (col + 1) / (GC - 1);
      const v0 = row / (GR - 1);
      const v1 = (row + 1) / (GR - 1);

      const tl = sampleEdge(topEdge, u0);
      const tr = sampleEdge(topEdge, u1);
      const bl = sampleEdge(botEdge, u0);
      const br = sampleEdge(botEdge, u1);

      const emit = (topPt, botPt, u, v) => sk.vertex(
        (1 - v) * topPt.x + v * botPt.x,
        (1 - v) * topPt.y + v * botPt.y,
        u * glyph.width,
        v * glyph.height,
      );

      emit(tl, bl, u0, v0);
      emit(tr, br, u1, v0);
      emit(tr, br, u1, v1);
      emit(tl, bl, u0, v0);
      emit(tr, br, u1, v1);
      emit(tl, bl, u0, v1);
    }
  }

  sk.endShape();
  sk.noTint();
  sk.pop();
}

// fraction ∈ (0,1]: only render the left `fraction` of the glyph (for live preview).
export function drawWarpedLetterPartial(sk, letter, videoOpacity, fraction, color) {
  if (fraction <= 0) return;
  renderWarpedGlyph(sk, letter, videoOpacity, fraction, 140, color);
}

export function drawWarpedLetter(sk, letter, videoOpacity, color) {
  renderWarpedGlyph(sk, letter, videoOpacity, 1, null, color);
}
