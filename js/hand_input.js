// hand_input.js - Hand tracking and gesture detection for SORCERER
import { AppConfig } from './config.js';

/**
 * HandInput manages hand tracking via MediaPipe Hands.
 * It detects hand positions and gestures (like fists) to control the synthesizer.
 */
export const HandInput = {
  hands: null,
  camera: null,
  videoElement: null,
  onResultsCallback: null,

  // Track gestures for patch switching
  leftHandWasFist: false,
  lastLeftFistOpenTime: 0,
  handPositions: { left: null, right: null, activeHandsCount: 0 },

  /**
   * Initialize hand tracking with camera
   */
  async init(videoEl, onResultsCb) {
    this.videoElement = videoEl;
    this.onResultsCallback = onResultsCb;

    // Check if MediaPipe libraries are loaded
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      throw new Error(
        'MediaPipe libraries not loaded. Check script tags in HTML.'
      );
    }

    // Configure MediaPipe Hands
    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1, // 0 = faster but less accurate, 1 = slower but more accurate
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    // Process hand tracking results
    this.hands.onResults((results) => this._processHandResults(results));

    // Set up camera feed with 2K resolution for better hand tracking
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
      width: 1920, // 2K width
      height: 1080, // Full HD height (16:9 aspect ratio)
      facingMode: 'user',
    });

    // Start camera
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

  /**
   * Check if a hand is making a fist gesture
   * A fist is detected when fingertips are curled close to the palm
   */
  _isFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Hand landmarks reference:
    // 0 = wrist, 4 = thumb tip, 8 = index tip, 12 = middle tip, 16 = ring tip, 20 = pinky tip
    // 5 = index base, 9 = middle base, 13 = ring base, 17 = pinky base

    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20]; // Excluding thumb for more reliable detection
    const fingerBases = [5, 9, 13, 17];

    let curledFingers = 0;

    // Check each finger (excluding thumb)
    for (let i = 0; i < fingerTips.length; i++) {
      const tip = landmarks[fingerTips[i]];
      const base = landmarks[fingerBases[i]];

      if (!tip || !base || !wrist) continue;

      // Calculate distances
      const tipToWrist = Math.hypot(
        tip.x - wrist.x,
        tip.y - wrist.y,
        tip.z - wrist.z
      );
      const baseToWrist = Math.hypot(
        base.x - wrist.x,
        base.y - wrist.y,
        base.z - wrist.z
      );

      // Finger is curled if tip is significantly closer to wrist than its base
      if (tipToWrist < baseToWrist * 0.9) {
        curledFingers++;
      }
    }

    // Need at least 3 fingers curled to register as a fist
    return curledFingers >= 3;
  },

  /**
   * Process hand tracking results from MediaPipe
   */
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
        const handedness = results.multiHandedness[i].label; // 'Left' or 'Right'

        // Use middle finger base (landmark 9) as hand position - more stable than wrist
        const handCenter = landmarks[9] || landmarks[0];
        if (!handCenter) continue;

        // Mirror X coordinate so hand movements match screen (like a mirror)
        const handData = {
          x: 1.0 - handCenter.x, // 0 = left edge, 1 = right edge
          y: handCenter.y, // 0 = top, 1 = bottom
          isFist: this._isFist(landmarks),
          landmarks: landmarks,
        };

        if (handedness === 'Left') {
          processedData.left = handData;

          // Detect "open fist" gesture for patch switching
          // User makes a fist, then opens hand to cycle through instruments
          const currentTime = Date.now();
          if (this.leftHandWasFist && !handData.isFist) {
            // Fist just opened - check if enough time passed since last gesture
            if (
              currentTime - this.lastLeftFistOpenTime >
              AppConfig.handInput.gestureCooldown
            ) {
              processedData.left.cyclePatchGesture = true;
              this.lastLeftFistOpenTime = currentTime;
            }
          }
          this.leftHandWasFist = handData.isFist;
        } else if (handedness === 'Right') {
          processedData.right = handData;
          // Right hand fist activates/deactivates the arpeggiator
        }
      }
    } else {
      // No hands detected - reset gesture tracking
      this.leftHandWasFist = false;
    }

    // Store latest data and notify the app
    this.handPositions = processedData;
    if (this.onResultsCallback) {
      this.onResultsCallback(results, processedData);
    }
  },

  /**
   * Clean up resources when shutting down
   */
  cleanup() {
    if (this.camera) {
      this.camera
        .stop()
        .catch((err) => console.warn('Error stopping camera:', err));
    }

    if (this.hands) {
      this.hands
        .close()
        .catch((err) => console.warn('Error closing hand tracking:', err));
    }

    // Reset state
    this.handPositions = { left: null, right: null, activeHandsCount: 0 };
    this.leftHandWasFist = false;
    this.videoElement = null;
    this.onResultsCallback = null;
  },
};
