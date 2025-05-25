// js/hand_input.js
import { AppConfig } from './config.js'; // For gestureCooldown

/**
 * HandInput manages hand tracking via MediaPipe Hands, processes landmarks,
 * detects gestures, and provides normalized hand data.
 */
export const HandInput = {
  hands: null,
  camera: null,
  videoElement: null,
  onResultsCallback: null, // Callback function to send results to the main app

  // Internal state for gesture detection
  leftHandWasFist: false,
  lastLeftFistOpenTime: 0,
  handPositions: { left: null, right: null, activeHandsCount: 0 },

  /**
   * Initializes MediaPipe Hands and the camera.
   * @param {HTMLVideoElement} videoEl - The video element to use for MediaPipe.
   * @param {function} onResultsCb - Callback to be invoked with processed hand data.
   * @returns {Promise} A promise that resolves when the camera starts, or rejects on error.
   */
  async init(videoEl, onResultsCb) {
    this.videoElement = videoEl;
    this.onResultsCallback = onResultsCb;

    // Ensure MediaPipe Hands global object is available (loaded from CDN)
    if (typeof Hands === 'undefined') {
      console.error('MediaPipe Hands script not loaded.');
      return Promise.reject('MediaPipe Hands not loaded.');
    }

    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1, // 0 or 1. Higher is more accurate but slower.
      minDetectionConfidence: 0.6, // Stricter detection
      minTrackingConfidence: 0.6, // Stricter tracking
    });

    // Set the callback for when MediaPipe processes results
    this.hands.onResults((results) => this._processHandResults(results));

    // Ensure MediaPipe CameraUtils global object is available
    if (typeof Camera === 'undefined') {
      console.error('MediaPipe CameraUtils script not loaded.');
      return Promise.reject('MediaPipe CameraUtils not loaded.');
    }

    this.camera = new Camera(this.videoElement, {
      onFrame: async () => {
        if (
          this.videoElement &&
          this.hands &&
          this.videoElement.readyState >= HTMLMediaElement.HAVE_METADATA
        ) {
          // Check if video is ready to avoid errors
          try {
            await this.hands.send({ image: this.videoElement });
          } catch (error) {
            console.warn('Error sending frame to MediaPipe Hands:', error);
            // Potentially pause or re-initialize if errors persist
          }
        }
      },
      width: 640, // Reduced from 1280 for potentially better performance
      height: 360, // Reduced from 720
    });

    return this.camera
      .start()
      .then(() => {
        console.log('HandInput: Camera started successfully.');
      })
      .catch((err) => {
        console.error('HandInput: Failed to start camera.', err);
        // Potentially update UI to inform user camera access failed
        throw err; // Re-throw to be caught by the main App
      });
  },

  /**
   * Checks if a hand is in a fist gesture based on its landmarks.
   * @param {Array} landmarks - Array of hand landmarks from MediaPipe.
   * @returns {boolean} True if the hand is likely a fist, false otherwise.
   */
  _isFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Landmark indices for fingertips and their corresponding MCP (Metacarpophalangeal) joints (base of fingers)
    // TIP: 8 (Index), 12 (Middle), 16 (Ring), 20 (Pinky)
    // MCP: 5 (Index), 9 (Middle), 13 (Ring), 17 (Pinky)
    // We also use the wrist (landmark 0) as a reference.

    const palmBase = landmarks[0]; // Wrist

    // Check if fingertips are closer to the palm center (approximated by wrist or MCP of middle finger)
    // than they are to their own base (MCP joint), or if they are curled inwards.
    const fingerTipIndices = [8, 12, 16, 20];
    const fingerMcpIndices = [5, 9, 13, 17];

    let curledFingers = 0;
    for (let i = 0; i < fingerTipIndices.length; i++) {
      const tip = landmarks[fingerTipIndices[i]];
      const mcp = landmarks[fingerMcpIndices[i]]; // Corresponding MCP joint

      if (!tip || !mcp || !palmBase) continue; // Skip if any landmark is missing

      // Calculate distance from tip to palm base and tip to its own MCP joint
      const distTipToPalm = Math.hypot(
        tip.x - palmBase.x,
        tip.y - palmBase.y,
        tip.z - palmBase.z
      );
      const distTipToMcp = Math.hypot(
        tip.x - mcp.x,
        tip.y - mcp.y,
        tip.z - mcp.z
      );
      const distMcpToPalm = Math.hypot(
        mcp.x - palmBase.x,
        mcp.y - palmBase.y,
        mcp.z - palmBase.z
      );

      // A finger is considered curled if its tip is closer to the palm than its MCP joint,
      // and also significantly closer to its MCP joint than the MCP joint is to the palm (strong curl).
      // Or, a simpler check: tip's y is greater than pip's y (assuming y increases downwards and hand is upright)
      // For fist, tip is usually closer to palm than its MCP joint is to palm.
      if (
        distTipToPalm < distMcpToPalm * 0.9 &&
        distTipToMcp < distMcpToPalm * 0.7
      ) {
        curledFingers++;
      }
    }
    // Require at least 3 fingers to be curled for a fist gesture
    return curledFingers >= 3;
  },

  /**
   * Processes results from MediaPipe Hands, extracts hand positions and gestures.
   * Invokes the onResultsCallback with the processed data.
   * @param {object} results - The raw results object from MediaPipe Hands.
   */
  _processHandResults(results) {
    const processedHandData = {
      left: null,
      right: null,
      activeHandsCount: 0,
    };

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      processedHandData.activeHandsCount = results.multiHandLandmarks.length;

      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i].label; // 'Left' or 'Right'

        // Use landmark 9 (MIDDLE_FINGER_MCP) as a stable reference for hand center
        // as wrist (0) can be less stable for precise X,Y positioning on screen.
        const handRefLandmark = landmarks[9] || landmarks[0]; // Fallback to wrist if 9 is missing

        if (!handRefLandmark) continue;

        // Normalize and mirror X coordinate for intuitive control (0 left, 1 right on screen)
        const normalizedX = 1.0 - handRefLandmark.x;
        const normalizedY = handRefLandmark.y; // Y is 0 (top) to 1 (bottom)

        const isFist = this._isFist(landmarks);

        if (handedness === 'Left') {
          processedHandData.left = {
            x: normalizedX,
            y: normalizedY,
            isFist: isFist,
            landmarks: landmarks, // Pass all landmarks for potential advanced rendering
          };

          // Left fist gesture for patch cycling
          const currentTime = Date.now();
          if (this.leftHandWasFist && !isFist) {
            // Fist was closed, now it's open
            if (
              currentTime - this.lastLeftFistOpenTime >
              AppConfig.handInput.gestureCooldown
            ) {
              // console.log("HandInput: Left fist opened - signaling patch cycle.");
              // The actual patch cycling will be handled by the main app based on this signal.
              // We can add a specific flag to processedHandData.left if needed,
              // or the main app can derive this from changes in isFist.
              // For now, main app will check for this transition.
              this.lastLeftFistOpenTime = currentTime;
              if (this.onResultsCallback) {
                // Signal specifically that a patch cycle gesture occurred
                processedHandData.left.cyclePatchGesture = true;
              }
            }
          }
          this.leftHandWasFist = isFist;
        } else if (handedness === 'Right') {
          processedHandData.right = {
            x: normalizedX,
            y: normalizedY,
            isFist: isFist, // Right fist controls arpeggiator
            landmarks: landmarks,
          };
        }
      }
    } else {
      // No hands detected, ensure previous fist states are reset
      this.leftHandWasFist = false;
    }
    this.handPositions = processedHandData; // Store the latest data
    if (this.onResultsCallback) {
      this.onResultsCallback(results, processedHandData);
    }
  },
  // In hand_input.js, add a cleanup method:

  cleanup() {
    // Stop camera if running
    if (this.camera) {
      this.camera
        .stop()
        .catch((err) => console.warn('Error stopping camera:', err));
    }

    // Close hands tracking
    if (this.hands) {
      this.hands
        .close()
        .catch((err) => console.warn('Error closing hands tracking:', err));
    }

    // Reset state
    this.handPositions = { left: null, right: null, activeHandsCount: 0 };
    this.leftHandWasFist = false;
    this.videoElement = null;
    this.onResultsCallback = null;
  },
};
