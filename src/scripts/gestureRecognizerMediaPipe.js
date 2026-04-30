import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";
import { WASM_URL } from "./mediaPipeConfig";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

const NUM_HANDS = 2;
const RUNNING_MODE = "VIDEO";

let gestureRecognizer;
let lastVideoTime = -1;

export const gestureMediaPipe = {
  gestures: [],
  handedness: [],
  landmarks: [],
  worldLandmarks: [],
  initialize: async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: RUNNING_MODE,
        numHands: NUM_HANDS,
      });
    } catch (error) {
      console.error("Failed to initialize GestureRecognizer:", error);
    }
  },
  predictWebcam: async (video) => {
    try {
      if (lastVideoTime !== video.elt.currentTime && gestureRecognizer) {
        lastVideoTime = video.elt.currentTime;
        const results = await gestureRecognizer.recognizeForVideo(
          video.elt,
          performance.now(),
        );

        if (results) {
          gestureMediaPipe.gestures = results.gestures || [];
          gestureMediaPipe.handedness = results.handedness || [];
          gestureMediaPipe.landmarks = results.landmarks || [];
          gestureMediaPipe.worldLandmarks = results.worldLandmarks || [];
        }
      }

      window.requestAnimationFrame(() => gestureMediaPipe.predictWebcam(video));
    } catch (error) {
      console.error("Failed to recognize gestures:", error);
    }
  },
};

gestureMediaPipe.initialize();
