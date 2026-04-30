import p5 from "p5";
import { mediaPipe } from "./poseModelMediaPipe";
import { gestureMediaPipe } from "./gestureRecognizerMediaPipe";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";
import { saveSnapshot, pulse } from "./utils";
import typeface from "../assets/fonts/LeagueGothicRegular.ttf";

new p5((sk) => {
  let camFeed;
  let type;
  let defaultDensity;
  const message = "EVERYWHERE IS THE SAME PLACE";
  let messageIndex = 0;
  let drawnLetters = [];
  const MAX_LETTERS = 300;
  let videoOpacity = 255;
  let drawingHand = null;
  let drawingActivatedAt = 0;
  const DRAWING_WARMUP_MS = 1000;
  let accumulatedDistance = 0;
  let previousActivePos = null;
  let smoothX = 0;
  let smoothY = 0;
  const EMA_ALPHA = 0.35;
  const MOVEMENT_THRESHOLD = 3;

  let lastVictoryTime = { left: 0, right: 0 };
  const VICTORY_COOLDOWN = 1000;

  // Both-fists erase: must be held to avoid accidental trigger.
  // Timer only resets if neither hand shows a fist, to tolerate momentary mis-reads.
  let bothFistsStartTime = 0;
  const ERASE_HOLD_MS = 800;

  let lastThumbDownTime = 0;
  const THUMB_DOWN_COOLDOWN = 500;

  sk.preload = () => {
    type = sk.loadFont(typeface);
  };

  sk.setup = () => {
    defaultDensity = sk.displayDensity();
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.textFont(type);
    sk.textAlign(sk.CENTER, sk.CENTER);
    sk.noStroke();
    camFeed = initializeCamCapture(sk, [mediaPipe, gestureMediaPipe]);
  };

  const getGesturesPerHand = () => {
    const result = [];
    for (let i = 0; i < gestureMediaPipe.gestures.length; i++) {
      const gesture = gestureMediaPipe.gestures[i]?.[0]?.categoryName;
      const hand = gestureMediaPipe.handedness[i]?.[0]?.displayName;
      if (gesture && hand) result.push({ gesture, hand });
    }
    return result;
  };

  const activateHand = (hand, now) => {
    lastVictoryTime[hand] = now;
    drawingHand = hand;
    drawingActivatedAt = now;
    accumulatedDistance = 0;
    previousActivePos = null;
    smoothX = 0;
    smoothY = 0;
  };

  const deactivateHand = () => {
    drawingHand = null;
    drawingActivatedAt = 0;
    accumulatedDistance = 0;
    previousActivePos = null;
    smoothX = 0;
    smoothY = 0;
  };

  sk.draw = () => {
    sk.background(255);

    if (videoOpacity > 0) {
      sk.push();
      sk.tint(255, videoOpacity);
      sk.image(
        camFeed,
        camFeed.x || 0,
        camFeed.y || 0,
        camFeed.scaledWidth || sk.width,
        camFeed.scaledHeight || sk.height,
      );
      sk.noTint();
      sk.pop();
    }

    const LM = getMappedLandmarks(sk, mediaPipe, camFeed, [21, 22]);

    const detected = getGesturesPerHand();
    const now = sk.millis();

    const leftHandGesture = detected.find((d) => d.hand === "Left")?.gesture;
    const rightHandGesture = detected.find((d) => d.hand === "Right")?.gesture;

    if (leftHandGesture === "Victory" && now - lastVictoryTime.left > VICTORY_COOLDOWN) {
      activateHand("left", now);
    }
    if (rightHandGesture === "Victory" && now - lastVictoryTime.right > VICTORY_COOLDOWN) {
      activateHand("right", now);
    }

    const activeHandGesture =
      drawingHand === "left" ? leftHandGesture : rightHandGesture;
    if (drawingHand && activeHandGesture === "Closed_Fist") {
      deactivateHand();
    }

    const leftIsFist = leftHandGesture === "Closed_Fist";
    const rightIsFist = rightHandGesture === "Closed_Fist";
    const bothFists = leftIsFist && rightIsFist;
    const eitherFist = leftIsFist || rightIsFist;
    if (bothFists) {
      if (bothFistsStartTime === 0) bothFistsStartTime = now;
      if (now - bothFistsStartTime > ERASE_HOLD_MS) {
        drawnLetters = [];
        messageIndex = 0;
        accumulatedDistance = 0;
        bothFistsStartTime = 0;
        deactivateHand();
      }
    } else if (!eitherFist) {
      bothFistsStartTime = 0;
    }

    const thumbDown = leftHandGesture === "Thumb_Down" || rightHandGesture === "Thumb_Down";
    if (thumbDown && now - lastThumbDownTime > THUMB_DOWN_COOLDOWN) {
      lastThumbDownTime = now;
      if (drawnLetters.length > 0) {
        drawnLetters.pop();
        messageIndex = Math.max(0, messageIndex - 1);
        accumulatedDistance = 0;
      }
    }

    const isWarmedUp = drawingHand && (now - drawingActivatedAt >= DRAWING_WARMUP_MS);

    if (isWarmedUp) {
      const rawX = drawingHand === "left" ? LM.X21 : LM.X22;
      const rawY = drawingHand === "left" ? LM.Y21 : LM.Y22;

      if (rawX !== undefined) {
        if (previousActivePos === null) {
          smoothX = rawX;
          smoothY = rawY;
        } else {
          smoothX = EMA_ALPHA * rawX + (1 - EMA_ALPHA) * smoothX;
          smoothY = EMA_ALPHA * rawY + (1 - EMA_ALPHA) * smoothY;
        }

        if (previousActivePos !== null) {
          const dx = smoothX - previousActivePos.x;
          const dy = smoothY - previousActivePos.y;
          const distanceMoved = sk.sqrt(dx * dx + dy * dy);

          if (distanceMoved > MOVEMENT_THRESHOLD) {
            accumulatedDistance += distanceMoved;
            const currentChar = message.charAt(messageIndex % message.length);
            const minSize = 24;
            const fontSize = sk.constrain(
              minSize + Math.log(distanceMoved + 1) * 60,
              minSize,
              600,
            );
            const requiredDistance =
              (currentChar === " " ? 50 : 30) *
              (1 + (fontSize / minSize - 1) * 0.2);

            if (accumulatedDistance >= requiredDistance) {
              if (currentChar !== " ") {
                if (drawnLetters.length >= MAX_LETTERS) drawnLetters.shift();
                drawnLetters.push({
                  char: currentChar,
                  x: smoothX,
                  y: smoothY,
                  size: fontSize,
                });
              }
              messageIndex++;
              accumulatedDistance = 0;
            }
          }
        }

        previousActivePos = { x: smoothX, y: smoothY };
      }
    }

    sk.push();
    sk.fill(videoOpacity === 0 ? 0 : 255);
    for (const letter of drawnLetters) {
      sk.textSize(letter.size);
      sk.text(letter.char, letter.x, letter.y);
    }
    sk.pop();

    sk.push();
    sk.fill(255);
    sk.textSize(24);
    sk.textAlign(sk.RIGHT, sk.BOTTOM);
    sk.textFont("monospace");
    const statusText = drawingHand
      ? `${drawingHand.toUpperCase()} HAND ACTIVATED`
      : "NO HAND ACTIVATED";
    sk.text(statusText, sk.width - 20, sk.height - 20);
    sk.pop();

    if (drawingHand) {
      const rawActiveX = drawingHand === "left" ? LM.X21 : LM.X22;
      const rawActiveY = drawingHand === "left" ? LM.Y21 : LM.Y22;
      const activeX = isWarmedUp ? smoothX : rawActiveX;
      const activeY = isWarmedUp ? smoothY : rawActiveY;
      if (activeX !== undefined) {
        sk.push();
        sk.stroke(255, 0, 0);
        sk.strokeWeight(2);
        if (isWarmedUp) {
          sk.fill(255, 0, 0);
        } else {
          sk.noFill();
        }
        const size = pulse(sk, 16, 32, 60);
        sk.ellipse(activeX, activeY, size, size);
        sk.pop();
      }
    }
  };

  sk.windowResized = () => {
    sk.resizeCanvas(sk.windowWidth, sk.windowHeight);
    updateFeedDimensions(sk, camFeed, false);
  };

  sk.keyPressed = () => {
    if (sk.key === "s" || sk.key === "S") {
      saveSnapshot(sk, defaultDensity, 2);
    } else if (sk.key === "h" || sk.key === "H") {
      videoOpacity = videoOpacity === 255 ? 0 : 255;
    } else if (sk.key === "c" || sk.key === "C") {
      drawnLetters = [];
      messageIndex = 0;
      accumulatedDistance = 0;
    }
  };
});
