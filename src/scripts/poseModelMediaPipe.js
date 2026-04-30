import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { WASM_URL } from "./mediaPipeConfig";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

const NUM_POSES = 1;
const RUNNING_MODE = "VIDEO";

let poseLandmarker;
let lastVideoTime = -1;

export const mediaPipe = {
  landmarks: [],
  worldLandmarks: [],
  initialize: async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: RUNNING_MODE,
        numPoses: NUM_POSES,
      });
    } catch (error) {
      console.error("Failed to initialize PoseLandmarker:", error);
    }
  },
  predictWebcam: async (video) => {
    try {
      if (lastVideoTime !== video.elt.currentTime && poseLandmarker) {
        lastVideoTime = video.elt.currentTime;
        const results = await poseLandmarker.detectForVideo(
          video.elt,
          performance.now(),
        );

        if (results) {
          mediaPipe.landmarks = results.landmarks || [];
          mediaPipe.worldLandmarks = results.worldLandmarks || [];
        }
      }

      window.requestAnimationFrame(() => mediaPipe.predictWebcam(video));
    } catch (error) {
      console.error("Failed to predict webcam:", error);
    }
  },
};

mediaPipe.initialize();
