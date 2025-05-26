// hand_input.js - Hand tracking and gesture detection for SORCERER
import { AppConfig } from './config.js';

export const HandInput = {
  hands: null,
  camera: null,
  videoElement: null,
  onResultsCallback: null,

  leftHandWasFist: false,
  lastLeftFistOpenTime: 0,
  handPositions: { left: null, right: null, activeHandsCount: 0 },

  async init(videoEl, onResultsCb) {
    this.videoElement = videoEl;
    this.onResultsCallback = onResultsCb;

    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      throw new Error(
        'MediaPipe libraries not loaded. Check script tags in HTML.'
      );
    }

    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    this.hands.onResults((results) => this._processHandResults(results));

    this.camera = new Camera(this.videoElement, {
      onFrame: async () => {
        if (this.videoElement?.readyState >= HTMLMediaElement.HAVE_METADATA) {
          try {
            await this.hands.send({ image: this.videoElement });
          } catch (error) {
            console.warn('Error processing video frame:', error);
          }
        }
      },
      width: 1920,
      height: 1080,
      facingMode: 'user',
    });

    try {
      await this.camera.start();
      console.log('HandInput: Camera started successfully');
      return true;
    } catch (err) {
      console.error(
        'HandInput: Failed to start camera. Please check permissions.',
        err
      );
      throw err;
    }
  },

  _isFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [5, 9, 13, 17];

    let curledFingers = 0;

    for (let i = 0; i < fingerTips.length; i++) {
      const tip = landmarks[fingerTips[i]];
      const base = landmarks[fingerBases[i]];

      if (!tip || !base || !wrist) continue;

      // Simple 2D distance check (z is unreliable)
      const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
      const baseToWrist = Math.hypot(base.x - wrist.x, base.y - wrist.y);

      if (tipToWrist < baseToWrist * 0.9) {
        curledFingers++;
      }
    }

    return curledFingers >= 3;
  },

  _processHandResults(results) {
    const processedData = {
      left: null,
      right: null,
      activeHandsCount: 0,
    };

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      processedData.activeHandsCount = results.multiHandLandmarks.length;

      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i].label;

        const handCenter = landmarks[9] || landmarks[0];
        if (!handCenter) continue;

        const handData = {
          x: 1.0 - handCenter.x,
          y: handCenter.y,
          isFist: this._isFist(landmarks),
          landmarks: landmarks,
        };

        if (handedness === 'Left') {
          processedData.left = handData;

          const currentTime = Date.now();
          if (this.leftHandWasFist && !handData.isFist) {
            if (
              currentTime - this.lastLeftFistOpenTime >
              AppConfig.ui.gestureCooldown
            ) {
              processedData.left.cyclePatchGesture = true;
              this.lastLeftFistOpenTime = currentTime;
            }
          }
          this.leftHandWasFist = handData.isFist;
        } else if (handedness === 'Right') {
          processedData.right = handData;
        }
      }
    } else {
      this.leftHandWasFist = false;
    }

    this.handPositions = processedData;
    if (this.onResultsCallback) {
      this.onResultsCallback(results, processedData);
    }
  },

  cleanup() {
    if (this.camera) {
      this.camera.stop().catch(() => {});
    }

    if (this.hands) {
      this.hands.close().catch(() => {});
    }

    this.handPositions = { left: null, right: null, activeHandsCount: 0 };
    this.leftHandWasFist = false;
    this.videoElement = null;
    this.onResultsCallback = null;
  },
};
