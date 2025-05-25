// js/renderer.js
import { AppConfig } from './config.js'; // For visual configurations (base defaults)
import { AudioEngine } from './audio_engine.js'; // For currentAudioSettings to get overtoneCount

/**
 * Renderer handles all drawing operations on the HTML5 canvas.
 * It visualizes hand movements, audio parameters, and application state.
 */
export const Renderer = {
  canvasElement: null,
  ctx: null,
  videoElement: null,
  rayStarts: [],
  lastFrameTime: 0,
  rayPool: [], // Pool of reusable ray objects
  activeRays: [], // Currently active rays

  // currentVisualsConfig will be set by App.js via updateConfigs
  // It will be a merged object of AppConfig.visuals, global enhancements, and patch-specific visuals
  currentVisualsConfig: { ...AppConfig.visuals }, // Initialize with base defaults
  currentAudioConfig: { ...AppConfig.audioDefaults },

  init(canvasEl, videoEl) {
    this.canvasElement = canvasEl;
    this.ctx = this.canvasElement.getContext('2d');
    this.videoElement = videoEl;
    this.lastFrameTime = performance.now();
    this.resize();

    // Initialize ray pool
    this.initRayPool(100); // Create a pool of 100 rays
  },

  // Initialize the ray pool
  initRayPool(poolSize = 100) {
    this.rayPool = Array(poolSize)
      .fill()
      .map(() => ({
        spawnX: 0,
        spawnY: 0,
        angle: 0,
        distance: 0,
        maxDistance: 0,
        isLeftHandSource: false,
        initialOpacity: 0,
        color: 'rgba(255, 255, 255, 0.7)',
        active: false,
      }));
    this.activeRays = [];
  },

  // Get a ray from the pool
  getRayFromPool() {
    // Return an inactive ray or create a new one if needed
    let ray = this.rayPool.find((r) => !r.active);
    if (!ray) {
      ray = {
        spawnX: 0,
        spawnY: 0,
        angle: 0,
        distance: 0,
        maxDistance: 0,
        isLeftHandSource: false,
        initialOpacity: 0,
        color: 'rgba(255, 255, 255, 0.7)',
        active: false,
      };
      this.rayPool.push(ray);
    }
    ray.active = true;
    this.activeRays.push(ray);
    return ray;
  },

  // Return a ray to the pool
  returnRayToPool(ray) {
    ray.active = false;
    const index = this.activeRays.indexOf(ray);
    if (index !== -1) {
      this.activeRays.splice(index, 1);
    }
  },

  updateConfigs(newVisualsConfig, newAudioConfig) {
    this.currentVisualsConfig = { ...AppConfig.visuals, ...newVisualsConfig }; // Ensure all base keys exist
    this.currentAudioConfig = { ...AppConfig.audioDefaults, ...newAudioConfig };
    // console.log("Renderer updated configs. Visuals:", this.currentVisualsConfig);
  },

  resize() {
    if (!this.canvasElement || !this.ctx) return;
    this.canvasElement.width = window.innerWidth;
    this.canvasElement.height = window.innerHeight;
    if (AudioEngine.audioCtx) {
      this._drawPitchMarkers();
    }
  },

  drawFrame(
    rawMediaPipeResults,
    handData,
    isNoHandsMessageVisible,
    noHandsMessageOpacity,
    currentPatch
  ) {
    if (!this.ctx) return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;

    this.ctx.clearRect(
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );

    this.ctx.save();
    this.ctx.scale(-1, 1);
    if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
      this.ctx.drawImage(
        this.videoElement,
        -this.canvasElement.width,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      );
    }
    this.ctx.restore();

    this._drawPitchMarkers();

    if (handData.left) {
      const xPos = handData.left.x * this.canvasElement.width;
      const yPos = handData.left.y * this.canvasElement.height;
      this._drawCrosshair(xPos, yPos, true, deltaTime, {
        // handSpecificData removed
        noteName: this._getNoteFromY(1 - handData.left.y),
        reverb: Math.round(handData.left.x * 100),
      });
    }
    if (handData.right) {
      const xPos = handData.right.x * this.canvasElement.width;
      const yPos = handData.right.y * this.canvasElement.height;
      const overtoneControlValue = 1 - handData.right.y;
      const calculationOvertoneCount = Math.max(
        1,
        this.currentAudioConfig.overtoneCount
      );
      const numActiveOvertones =
        1 + Math.floor(overtoneControlValue * (calculationOvertoneCount - 1));

      this._drawCrosshair(xPos, yPos, false, deltaTime, {
        // handSpecificData removed
        vibrato: Math.round((1 - handData.right.x) * 100),
        harmonics: numActiveOvertones,
      });
    }

    if (isNoHandsMessageVisible && noHandsMessageOpacity > 0) {
      const message = 'Bring both hands on screen to cast spells';
      this.ctx.save();
      this.ctx.font = `bold ${
        this.currentVisualsConfig.crosshairFontSize * 1.2
      }px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${noHandsMessageOpacity})`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.shadowColor = 'rgba(0,0,0,0.7)';
      this.ctx.shadowBlur = 10;
      this.ctx.fillText(
        message,
        this.canvasElement.width / 2,
        this.canvasElement.height / 2
      );
      this.ctx.restore();
    }

    if (currentPatch && currentPatch.name) {
      this.ctx.save();
      this.ctx.font = `italic ${
        this.currentVisualsConfig.pitchMarkerFontSize * 1.1
      }px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(
        `Patch: ${currentPatch.name}`,
        20,
        this.canvasElement.height - 20
      );
      this.ctx.restore();
    }
  },

  _getNoteFromY(normalizedY_inverted) {
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const { startOctave, endOctave } = this.currentVisualsConfig;
    const totalOctavesDisplayed = endOctave - startOctave + 1;
    const totalNotesDisplayed = totalOctavesDisplayed * 12;
    const yClamped = Math.max(0, Math.min(1, normalizedY_inverted));
    const noteIndexContinuous = yClamped * (totalNotesDisplayed - 1);
    const noteIndex = Math.floor(noteIndexContinuous);
    const currentOctave = startOctave + Math.floor(noteIndex / 12);
    const noteInOctave = notes[noteIndex % 12];
    return `${noteInOctave}${currentOctave}`;
  },

  /**
   * Draws the crosshair, its radiating effects, and associated text for a hand.
   * @param {number} x - Canvas X position of the hand.
   * @param {number} y - Canvas Y position of the hand.
   * @param {boolean} isLeftHand - True if drawing for the left hand.
   * @param {number} deltaTime - Time since the last frame in seconds.
   * @param {object} values - Object containing text values { noteName, reverb, vibrato, harmonics }.
   */
  _drawCrosshair(x, y, isLeftHand, deltaTime, values) {
    this.ctx.save();

    const rawNormalizedY = y / this.canvasElement.height;
    let effectNormalizedY;

    if (isLeftHand) {
      effectNormalizedY = 1 - rawNormalizedY;
    } else {
      // Code for right hand effectNormalizedY calculation (unchanged)
      const overtoneControlValue = 1 - rawNormalizedY;
      const calculationOvertoneCount = Math.max(
        1,
        this.currentAudioConfig.overtoneCount
      );
      if (calculationOvertoneCount <= 1) {
        effectNormalizedY = 0;
      } else {
        const numActiveOvertones =
          1 + Math.floor(overtoneControlValue * (calculationOvertoneCount - 1));
        effectNormalizedY =
          (numActiveOvertones - 1) / (calculationOvertoneCount - 1);
      }
    }
    effectNormalizedY = Math.max(0, Math.min(1, effectNormalizedY));

    // IMPROVED: Retrieve visual parameters from the current configuration
    const baseSize = this.currentVisualsConfig.crosshairBaseSize || 150;
    const rayDensityMultiplier =
      this.currentVisualsConfig.rayDensityMultiplier || 1.0;
    const raySpeedMultiplier =
      this.currentVisualsConfig.raySpeedMultiplier || 1.0;
    const rayColor =
      this.currentVisualsConfig.rayColor || 'rgba(255, 255, 255, 0.7)';
    const rayLengthMultiplier =
      this.currentVisualsConfig.rayLengthMultiplier || 1.0;
    const rayWidthMultiplier =
      this.currentVisualsConfig.rayWidthMultiplier || 1.0;

    const sizeMultiplier = 1 + effectNormalizedY * 2;
    const currentCrosshairSize = baseSize * sizeMultiplier;

    const baseRaySpawnRate = 1; // Base rays per second before multipliers
    const finalRaySpawnRate =
      baseRaySpawnRate * rayDensityMultiplier +
      effectNormalizedY * baseRaySpawnRate * rayDensityMultiplier * 2.0;

    const baseRaySpeed = baseSize * 0.1;
    const finalRaySpeed =
      baseRaySpeed * raySpeedMultiplier +
      effectNormalizedY * baseRaySpeed * raySpeedMultiplier * 0.5;

    if (Math.random() < finalRaySpawnRate * deltaTime) {
      const ray = this.getRayFromPool();
      ray.spawnX = x;
      ray.spawnY = y;
      ray.angle = Math.random() * Math.PI * 2;
      ray.distance = 0;
      ray.maxDistance =
        currentCrosshairSize *
        (0.4 + Math.random() * 0.6) *
        rayLengthMultiplier;
      ray.isLeftHandSource = isLeftHand;
      ray.initialOpacity = 0.2 + Math.random() * 0.5;
      ray.color = rayColor;
    }

    // Update and draw rays
    // Process only rays associated with the current hand
    for (let i = this.activeRays.length - 1; i >= 0; i--) {
      const ray = this.activeRays[i];

      // Skip rays for the other hand
      if (ray.isLeftHandSource !== isLeftHand) continue;

      ray.distance += finalRaySpeed * deltaTime;

      // Fade out based on distance and initial opacity
      const lifetimeProgress = ray.distance / ray.maxDistance;
      const alpha =
        ray.initialOpacity *
        Math.max(0, 1 - lifetimeProgress * lifetimeProgress);

      if (alpha > 0.01 && ray.distance < ray.maxDistance) {
        // Draw ray code (unchanged)
        this.ctx.beginPath();

        // Construct RGBA color string with dynamic alpha
        const colorParts = ray.color.match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/
        );
        let strokeColor = `rgba(255,255,255,${alpha})`; // Fallback
        if (colorParts) {
          strokeColor = `rgba(${colorParts[1]}, ${colorParts[2]}, ${colorParts[3]}, ${alpha})`;
        } else if (ray.color.startsWith('#')) {
          // Basic hex handling
          const r = parseInt(ray.color.slice(1, 3), 16);
          const g = parseInt(ray.color.slice(3, 5), 16);
          const b = parseInt(ray.color.slice(5, 7), 16);
          strokeColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = (1 + effectNormalizedY * 1.0) * rayWidthMultiplier;

        // Ray tail length also influenced by rayLengthMultiplier
        const rayTailLength =
          40 * (1 + effectNormalizedY * 0.5) * rayLengthMultiplier;
        const startDist = Math.max(0, ray.distance - rayTailLength);
        const endDist = ray.distance;

        this.ctx.moveTo(
          x + Math.cos(ray.angle) * startDist,
          y + Math.sin(ray.angle) * startDist
        );
        this.ctx.lineTo(
          x + Math.cos(ray.angle) * endDist,
          y + Math.sin(ray.angle) * endDist
        );
        this.ctx.stroke();
      } else {
        // Ray is done, return it to the pool
        this.returnRayToPool(ray);
      }
    }

    // Draw main crosshair lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    this.ctx.lineWidth = (2 + effectNormalizedY * 2) * rayWidthMultiplier;
    const S = currentCrosshairSize / 2;
    const diagOffset = S * 0.707;

    // Batch all line segments into a single path
    this.ctx.beginPath();
    // Vertical line
    this.ctx.moveTo(x, y - S);
    this.ctx.lineTo(x, y + S);
    // Horizontal line
    this.ctx.moveTo(x - S, y);
    this.ctx.lineTo(x + S, y);
    // Diagonal lines
    this.ctx.moveTo(x - diagOffset, y - diagOffset);
    this.ctx.lineTo(x + diagOffset, y + diagOffset);
    this.ctx.moveTo(x - diagOffset, y + diagOffset);
    this.ctx.lineTo(x + diagOffset, y - diagOffset);
    // Draw all lines with a single stroke call
    this.ctx.stroke();

    // Draw text values
    this.ctx.fillStyle = 'white';
    this.ctx.font = `bold ${this.currentVisualsConfig.crosshairFontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowColor = 'rgba(0,0,0,0.9)';
    this.ctx.shadowBlur = 5;

    const TEXT_OFFSET_X = S + 20;
    const TEXT_OFFSET_Y_SPACING =
      this.currentVisualsConfig.crosshairFontSize * 1.2;

    if (isLeftHand) {
      this.ctx.textAlign = 'right';
      this.ctx.fillText(
        `Note: ${values.noteName}`,
        x - TEXT_OFFSET_X,
        y - TEXT_OFFSET_Y_SPACING / 2
      );
      this.ctx.fillText(
        `Reverb: ${values.reverb}%`,
        x - TEXT_OFFSET_X,
        y + TEXT_OFFSET_Y_SPACING / 2
      );
    } else {
      this.ctx.textAlign = 'left';
      this.ctx.fillText(
        `Vibrato: ${values.vibrato}%`,
        x + TEXT_OFFSET_X,
        y - TEXT_OFFSET_Y_SPACING / 2
      );
      this.ctx.fillText(
        `Overtones: ${values.harmonics}`,
        x + TEXT_OFFSET_X,
        y + TEXT_OFFSET_Y_SPACING / 2
      );
    }
    this.ctx.restore();
  },

  _drawPitchMarkers() {
    if (!this.ctx) return;
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const { startOctave, endOctave, pitchMarkerFontSize } =
      this.currentVisualsConfig;
    const totalOctavesDisplayed = endOctave - startOctave + 1;
    const totalNotesDisplayed = totalOctavesDisplayed * 12;

    this.ctx.save();
    this.ctx.font = `${pitchMarkerFontSize}px monospace`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i < totalNotesDisplayed; i++) {
      const noteInOctaveIndex = i % 12;
      const octave = startOctave + Math.floor(i / 12);
      const noteName = `${notes[noteInOctaveIndex]}${octave}`;
      const normalizedY =
        (totalNotesDisplayed - 1 - i) / (totalNotesDisplayed - 1);
      const yPos = normalizedY * this.canvasElement.height;
      const rightEdge = this.canvasElement.width - 10;
      const lineLength = notes[noteInOctaveIndex] === 'C' ? 25 : 15;
      const lineColor =
        notes[noteInOctaveIndex] === 'C'
          ? 'rgba(255, 255, 255, 0.7)'
          : 'rgba(255, 255, 255, 0.3)';
      const lineWidth = notes[noteInOctaveIndex] === 'C' ? 1.5 : 1;

      this.ctx.beginPath();
      this.ctx.moveTo(rightEdge - lineLength, yPos);
      this.ctx.lineTo(rightEdge, yPos);
      this.ctx.strokeStyle = lineColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();

      if (
        notes[noteInOctaveIndex] === 'C' ||
        notes[noteInOctaveIndex] === 'G'
      ) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.fillText(noteName, rightEdge - lineLength - 5, yPos);
      }
    }
    this.ctx.restore();
  },

  drawDebugInfo(fps, frameTime) {
    if (!this.ctx) return;

    this.ctx.save();

    // Draw FPS counter
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(10, 10, 120, 50);

    this.ctx.fillStyle =
      frameTime > AppConfig.debug.slowFrameThreshold ? 'red' : 'lime';
    this.ctx.font = '16px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(`FPS: ${fps.toFixed(1)}`, 15, 15);
    this.ctx.fillText(`Frame: ${frameTime.toFixed(1)}ms`, 15, 35);

    this.ctx.restore();
  },

  cleanup() {
    // Clear ray arrays
    this.activeRays = [];
    this.rayPool = [];

    // Cancel any pending animation frame
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    // Clear canvas
    if (this.ctx && this.canvasElement) {
      this.ctx.clearRect(
        0,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      );
    }
  },
};
