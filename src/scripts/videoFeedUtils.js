// Version 2.0 - 23.06.2025

export function initializeCamCapture(sk, mediaPipeHandlerOrHandlers) {
  const mediaPipeHandlers = Array.isArray(mediaPipeHandlerOrHandlers)
    ? mediaPipeHandlerOrHandlers
    : [mediaPipeHandlerOrHandlers].filter(Boolean);

  const camFeed = sk.createCapture(
    {
      flipped: true,
      audio: false,
      video: {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, min: 24 },
      },
    },
    () => {
      updateFeedDimensions(sk, camFeed, false);

      mediaPipeHandlers.forEach((handler) => {
        handler?.predictWebcam?.(camFeed);
      });
    },
  );

  camFeed.elt.setAttribute("playsinline", "");
  camFeed.hide();

  return camFeed;
}

export function updateFeedDimensions(sk, feed, fitToHeight = false) {
  if (!feed) return;

  const canvasRatio = sk.width / sk.height;
  const videoRatio = feed.width / feed.height;

  let x = 0;
  let y = 0;
  let w = sk.width;
  let h = sk.height;

  if (canvasRatio > videoRatio) {
    if (fitToHeight) {
      // Fit to canvas height, center horizontally, Portrait mode
      w = sk.height * videoRatio;
      x = (sk.width - w) / 2;
    } else {
      // Fit to canvas width, center vertically, Landscape mode
      h = sk.width / videoRatio;
      y = (sk.height - h) / 2;
    }
  } else {
    // Video is wider - fit to height, center horizontally
    w = sk.height * videoRatio;
    x = (sk.width - w) / 2;
  }

  feed.scaledWidth = w;
  feed.scaledHeight = h;
  feed.x = x;
  feed.y = y;
}
