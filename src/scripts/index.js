import p5 from "p5";
import { gestureMediaPipe } from "./gestureRecognizerMediaPipe";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getHandLandmarks } from "./landmarksHandler";
import { saveSnapshot, pulse } from "./utils";
import { buildEdges, drawWarpedLetter, drawWarpedLetterPartial, initLetterCanvas, getGlyphAspect } from "./letterWarp";
import {
  DRAWING_WARMUP_MS,
  HAND_ACTIVATE_COOLDOWN_MS,
  PINCH_CLOSED_THRESHOLD,
  PINCH_OPEN_THRESHOLD,
  MIN_LETTER_HEIGHT_PX,
  LETTER_WIDTH_SCALE,
  LETTER_GAP_RATIO,
  SPACE_WIDTH_RATIO,
  MAX_DRAWN_LETTERS,
  ERASE_HOLD_MS,
  THUMB_DOWN_COOLDOWN_MS,
  SMOOTH_EMA_ALPHA,
  SPINE_MIN_STEP_PX,
  WARP_GRID_COLS,
  LETTER_COLOR,
  OPEN_PALM_COOLDOWN_MS,
} from "./config";
import typeface from "../assets/fonts/LeagueGothicRegular.ttf";

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

new p5((sk) => {
  let camFeed;
  let type;
  let defaultDensity;
  const message = "EVERYWHERE IS THE SAME PLACE";
  let messageIndex = 0;
  let drawnLetters = [];
  let videoOpacity = 255;

  let drawingHand = null;
  let drawingActivatedAt = 0;

  let strokeActive = false;
  let pinchClosedSeen = false;
  let topPath = [];
  let botPath = [];
  let spineLen = 0;
  let letterStartS = 0;

  let smoothTop = null;
  let smoothBot = null;

  let lastActivateTime = { Left: 0, Right: 0 };
  let bothFistsStartTime = 0;
  let lastThumbDownTime = 0;
  let lastOpenPalmTime = 0;

  const sw = () => sk.width / 2;
  const sh = () => sk.height / 2;
  const sx = (x) => x - sw();
  const sy = (y) => y - sh();

  sk.preload = () => {
    type = sk.loadFont(typeface);
  };

  sk.setup = () => {
    defaultDensity = sk.displayDensity();
    sk.createCanvas(sk.windowWidth, sk.windowHeight, sk.WEBGL);
    sk._typeface = type;
    sk.textFont(type);
    sk.textAlign(sk.CENTER, sk.CENTER);
    sk.noStroke();
    initLetterCanvas(sk);
    camFeed = initializeCamCapture(sk, [gestureMediaPipe]);
  };

  const getGesturesPerHand = () => {
    const result = {};
    for (let i = 0; i < gestureMediaPipe.gestures.length; i++) {
      const gesture = gestureMediaPipe.gestures[i]?.[0]?.categoryName;
      const hand = gestureMediaPipe.handedness[i]?.[0]?.displayName;
      if (gesture && hand) result[hand] = gesture;
    }
    return result;
  };

  const resetStroke = () => {
    strokeActive = false;
    pinchClosedSeen = false;
    topPath = [];
    botPath = [];
    spineLen = 0;
    letterStartS = 0;
    smoothTop = null;
    smoothBot = null;
  };

  const activateHand = (hand, now) => {
    lastActivateTime[hand] = now;
    drawingHand = hand;
    drawingActivatedAt = now;
    resetStroke();
  };

  const deactivateHand = () => {
    drawingHand = null;
    drawingActivatedAt = 0;
    resetStroke();
  };

  const letterWidthForChar = (char, height) => {
    if (char === " ") return height * SPACE_WIDTH_RATIO;
    return height * getGlyphAspect(sk, char) * LETTER_WIDTH_SCALE;
  };

  const sampleAt = (path, s) => {
    if (path.length === 0) return null;
    if (s <= path[0].s) return { x: path[0].x, y: path[0].y };
    for (let i = 1; i < path.length; i++) {
      if (path[i].s >= s) {
        const a = path[i - 1];
        const b = path[i];
        const seg = b.s - a.s;
        const t = seg > 0 ? (s - a.s) / seg : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  };

  const buildLetterEdges = (startS, endS) => {
    const topEdge = [];
    const botEdge = [];
    for (let col = 0; col < WARP_GRID_COLS; col++) {
      const u = col / (WARP_GRID_COLS - 1);
      const s = startS + u * (endS - startS);
      const t = sampleAt(topPath, s);
      const b = sampleAt(botPath, s);
      topEdge.push({ x: sx(t.x), y: sy(t.y) });
      botEdge.push({ x: sx(b.x), y: sy(b.y) });
    }
    return buildEdges(topEdge, botEdge);
  };

  const commitLetterIfReady = () => {
    while (true) {
      const char = message.charAt(messageIndex % message.length);
      const startTop = sampleAt(topPath, letterStartS);
      const startBot = sampleAt(botPath, letterStartS);
      if (!startTop || !startBot) return;

      const startHeight = Math.max(
        MIN_LETTER_HEIGHT_PX,
        Math.hypot(startTop.x - startBot.x, startTop.y - startBot.y),
      );
      const letterWidth = letterWidthForChar(char, startHeight);
      const gap = char === " " ? 0 : startHeight * LETTER_GAP_RATIO;
      const glyphEndS = letterStartS + letterWidth;
      const nextStartS = glyphEndS + gap;

      if (spineLen < nextStartS) return;

      if (char !== " ") {
        if (drawnLetters.length >= MAX_DRAWN_LETTERS) drawnLetters.shift();
        drawnLetters.push({ char, edges: buildLetterEdges(letterStartS, glyphEndS) });
      }

      messageIndex++;
      letterStartS = nextStartS;
    }
  };

  const updatePaths = (top, bot) => {
    if (smoothTop === null) {
      smoothTop = { ...top };
      smoothBot = { ...bot };
    } else {
      smoothTop.x = SMOOTH_EMA_ALPHA * top.x + (1 - SMOOTH_EMA_ALPHA) * smoothTop.x;
      smoothTop.y = SMOOTH_EMA_ALPHA * top.y + (1 - SMOOTH_EMA_ALPHA) * smoothTop.y;
      smoothBot.x = SMOOTH_EMA_ALPHA * bot.x + (1 - SMOOTH_EMA_ALPHA) * smoothBot.x;
      smoothBot.y = SMOOTH_EMA_ALPHA * bot.y + (1 - SMOOTH_EMA_ALPHA) * smoothBot.y;
    }

    const midX = (smoothTop.x + smoothBot.x) / 2;
    const midY = (smoothTop.y + smoothBot.y) / 2;

    if (topPath.length === 0) {
      topPath.push({ x: smoothTop.x, y: smoothTop.y, s: 0 });
      botPath.push({ x: smoothBot.x, y: smoothBot.y, s: 0 });
      spineLen = 0;
      return;
    }

    const lastTop = topPath[topPath.length - 1];
    const lastBot = botPath[botPath.length - 1];
    const lastMidX = (lastTop.x + lastBot.x) / 2;
    const lastMidY = (lastTop.y + lastBot.y) / 2;
    const ds = Math.hypot(midX - lastMidX, midY - lastMidY);

    if (ds < SPINE_MIN_STEP_PX) return;

    spineLen += ds;
    topPath.push({ x: smoothTop.x, y: smoothTop.y, s: spineLen });
    botPath.push({ x: smoothBot.x, y: smoothBot.y, s: spineLen });
  };

  sk.draw = () => {
    sk.background(255);

    if (videoOpacity > 0) {
      sk.push();
      sk.tint(255, videoOpacity);
      sk.image(
        camFeed,
        sx(camFeed.x || 0),
        sy(camFeed.y || 0),
        camFeed.scaledWidth || sk.width,
        camFeed.scaledHeight || sk.height,
      );
      sk.noTint();
      sk.pop();
    }

    const hands = getHandLandmarks(sk, gestureMediaPipe, camFeed, [
      WRIST, THUMB_TIP, INDEX_TIP, MIDDLE_MCP,
    ]);
    const gesturesByHand = getGesturesPerHand();
    const now = sk.millis();

    const handByName = (name) => hands.find((h) => h.hand === name);

    if (gesturesByHand.Left === "ILoveYou" && now - lastActivateTime.Left > HAND_ACTIVATE_COOLDOWN_MS) {
      activateHand("Left", now);
    }
    if (gesturesByHand.Right === "ILoveYou" && now - lastActivateTime.Right > HAND_ACTIVATE_COOLDOWN_MS) {
      activateHand("Right", now);
    }

    if (drawingHand && gesturesByHand[drawingHand] === "Closed_Fist") {
      deactivateHand();
    }

    const leftIsFist = gesturesByHand.Left === "Closed_Fist";
    const rightIsFist = gesturesByHand.Right === "Closed_Fist";
    if (leftIsFist && rightIsFist) {
      if (bothFistsStartTime === 0) bothFistsStartTime = now;
      if (now - bothFistsStartTime > ERASE_HOLD_MS) {
        drawnLetters = [];
        messageIndex = 0;
        bothFistsStartTime = 0;
        deactivateHand();
      }
    } else if (!leftIsFist && !rightIsFist) {
      bothFistsStartTime = 0;
    }

    const thumbDown = gesturesByHand.Left === "Thumb_Down" || gesturesByHand.Right === "Thumb_Down";
    if (thumbDown && now - lastThumbDownTime > THUMB_DOWN_COOLDOWN_MS) {
      lastThumbDownTime = now;
      if (drawnLetters.length > 0) {
        drawnLetters.pop();
        messageIndex = Math.max(0, messageIndex - 1);
      }
    }

    const bothPalmsOpen = gesturesByHand.Left === "Open_Palm" && gesturesByHand.Right === "Open_Palm";
    if (bothPalmsOpen && now - lastOpenPalmTime > OPEN_PALM_COOLDOWN_MS) {
      lastOpenPalmTime = now;
      videoOpacity = videoOpacity === 255 ? 0 : 255;
    }

    const isWarmedUp = drawingHand && now - drawingActivatedAt >= DRAWING_WARMUP_MS;
    const activeHandData = drawingHand ? handByName(drawingHand) : null;

    if (isWarmedUp && activeHandData) {
      const idx = activeHandData.points[INDEX_TIP];
      const thb = activeHandData.points[THUMB_TIP];
      const wrist = activeHandData.points[WRIST];
      const mcp = activeHandData.points[MIDDLE_MCP];

      if (idx && thb && wrist && mcp) {
        const top = idx.y < thb.y ? idx : thb;
        const bot = idx.y < thb.y ? thb : idx;
        const pinchDist = Math.hypot(idx.x - thb.x, idx.y - thb.y);
        const palmSize = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y);
        const pinchRatio = palmSize > 0 ? pinchDist / palmSize : 0;

        if (!strokeActive) {
          if (!pinchClosedSeen) {
            if (pinchRatio < PINCH_CLOSED_THRESHOLD) pinchClosedSeen = true;
          } else if (pinchRatio > PINCH_OPEN_THRESHOLD) {
            resetStroke();
            strokeActive = true;
          }
        } else {
          updatePaths(top, bot);
          commitLetterIfReady();
        }
      }
    }

    for (const letter of drawnLetters) {
      drawWarpedLetter(sk, letter, videoOpacity, LETTER_COLOR);
    }

    if (strokeActive && topPath.length >= 2) {
      const previewChar = message.charAt(messageIndex % message.length);
      if (previewChar !== " ") {
        const startTop = sampleAt(topPath, letterStartS);
        const startBot = sampleAt(botPath, letterStartS);
        const startHeight = Math.max(
          MIN_LETTER_HEIGHT_PX,
          Math.hypot(startTop.x - startBot.x, startTop.y - startBot.y),
        );
        const letterWidth = letterWidthForChar(previewChar, startHeight);
        const availableWidth = Math.max(0, spineLen - letterStartS);
        const fraction = Math.min(1, availableWidth / letterWidth);
        if (fraction > 0) {
          const previewEndS = letterStartS + availableWidth;
          const previewEdges = buildLetterEdges(letterStartS, previewEndS);
          drawWarpedLetterPartial(sk, { char: previewChar, edges: previewEdges }, videoOpacity, fraction, LETTER_COLOR);
        }
      }
    }

    sk.push();
    sk.fill(...LETTER_COLOR);
    sk.textSize(24);
    sk.textAlign(sk.RIGHT, sk.BOTTOM);
    sk.textFont("monospace");
    const status = !drawingHand
      ? "NO HAND ACTIVATED — I LOVE YOU TO START"
      : !isWarmedUp
        ? `${drawingHand.toUpperCase()} HAND WARMING UP`
        : strokeActive
          ? `${drawingHand.toUpperCase()} HAND DRAWING`
          : !pinchClosedSeen
            ? `${drawingHand.toUpperCase()} HAND — PINCH TIPS TOGETHER`
            : `${drawingHand.toUpperCase()} HAND — RELEASE TO DRAW`;
    sk.text(status, sw() - 20, sh() - 20);
    sk.pop();

    if (drawingHand && activeHandData) {
      const idx = activeHandData.points[INDEX_TIP];
      const thb = activeHandData.points[THUMB_TIP];
      if (idx && thb) {
        sk.push();
        sk.stroke(255, 0, 0);
        sk.strokeWeight(2);
        if (strokeActive) sk.fill(255, 0, 0);
        else sk.noFill();
        const size = pulse(sk, 16, 32, 60);
        sk.ellipse(sx(idx.x), sy(idx.y), size, size);
        sk.ellipse(sx(thb.x), sy(thb.y), size, size);
        if (isWarmedUp) {
          sk.stroke(255, 0, 0, strokeActive ? 255 : 100);
          sk.line(sx(idx.x), sy(idx.y), sx(thb.x), sy(thb.y));
        }
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
      resetStroke();
    }
  };
});
