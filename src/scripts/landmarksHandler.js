const mapLandmark = (sketch, lm, camFeed) => ({
  x: sketch.map(
    lm.x,
    1,
    0,
    camFeed.x || 0,
    (camFeed.x || 0) + (camFeed.scaledWidth || sketch.width),
  ),
  y: sketch.map(
    lm.y,
    0,
    1,
    camFeed.y || 0,
    (camFeed.y || 0) + (camFeed.scaledHeight || sketch.height),
  ),
});

export const getHandLandmarks = (sketch, gestureMP, camFeed, indices) => {
  const hands = [];
  const handsLandmarks = gestureMP.landmarks || [];
  const handedness = gestureMP.handedness || [];

  for (let i = 0; i < handsLandmarks.length; i++) {
    const lms = handsLandmarks[i];
    const hand = handedness[i]?.[0]?.displayName;
    if (!lms || !hand) continue;

    const points = {};
    indices.forEach((idx) => {
      if (lms[idx]) points[idx] = mapLandmark(sketch, lms[idx], camFeed);
    });
    hands.push({ hand, points });
  }
  return hands;
};
