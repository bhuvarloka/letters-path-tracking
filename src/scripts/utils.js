let countSaved = 1;
function saveSnapshot(sk, defaultDensity, densityFactor = 2) {
  const currentDensity = sk.pixelDensity();
  sk.pixelDensity(defaultDensity * densityFactor);
  sk.redraw();
  sk.saveCanvas(`sketch_${countSaved}`, "png");
  countSaved++;
  sk.pixelDensity(currentDensity);
  sk.redraw();
}

function pulse(sk, min, max, time) {
  const mid = (min + max) / 2;
  const amplitude = (max - min) / 2;
  return amplitude * sk.sin(sk.frameCount * (sk.TWO_PI / time)) + mid;
}

export { saveSnapshot, pulse };
