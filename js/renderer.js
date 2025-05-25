// renderer.js - High-performance visual effects and canvas rendering for SORCERER
import { AppConfig } from './config.js';

/**
 * Renderer handles all visual output on the HTML5 canvas.
 * Optimized for 60fps performance with object pooling and efficient drawing.
 */
export const Renderer = {
  canvas: null,
  ctx: null,
  video: null,

  // Performance-critical: Pre-allocated ray pool to avoid garbage collection
  rayPool: [],
  activeRays: [],
  MAX_RAYS: 100,

  notes: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

  // Current configuration (merged from base + patch visuals)
  config: { ...AppConfig.visuals },
  audioConfig: { ...AppConfig.audioDefaults },

  // Performance tracking
  lastFrameTime: 0,
  currentHandData: null,

  /**
   * Initialize renderer with canvas and video elements
   */
  init(canvasEl, videoEl) {
    this.canvas = canvasEl;
    this.ctx = this.canvas.getContext('2d', {
      alpha: false, // Opaque canvas is faster
      desynchronized: true, // Hint for better performance
    });
    this.video = videoEl;

    // Pre-allocate ray pool to avoid runtime allocations
    for (let i = 0; i < this.MAX_RAYS; i++) {
      this.rayPool.push({
        x: 0,
        y: 0,
        angle: 0,
        distance: 0,
        maxDistance: 0,
        opacity: 0,
        speed: 0,
        active: false,
      });
    }

    this.resize();
    this.lastFrameTime = performance.now();
  },

  /**
   * Update visual configuration from patch
   */
  updateConfigs(visualConfig, audioConfig) {
    this.config = { ...AppConfig.visuals, ...visualConfig };
    this.audioConfig = { ...AppConfig.audioDefaults, ...audioConfig };
  },

  /**
   * Handle window resize
   */
  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  /**
   * Main render loop - optimized for performance
   */
  drawFrame(
    rawResults,
    handData,
    showNoHandsMessage,
    messageOpacity,
    currentPatch
  ) {
    if (!this.ctx) return;

    // Store current hand data for ray cleanup
    this.currentHandData = handData;

    const now = performance.now();
    const deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1); // Cap delta to avoid spiral of death
    this.lastFrameTime = now;

    // Clear canvas
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw mirrored video feed
    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      this.ctx.save();
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        this.video,
        -this.canvas.width,
        0,
        this.canvas.width,
        this.canvas.height
      );
      this.ctx.restore();
    }

    // Draw pitch markers
    this._drawPitchMarkers();

    // Update and draw rays first (behind hands)
    this._updateRays(deltaTime);

    // Draw hand crosshairs
    if (handData.left) {
      const x = handData.left.x * this.canvas.width;
      const y = handData.left.y * this.canvas.height;
      this._spawnRays(x, y, handData.left.y, true, deltaTime);
      this._drawCrosshair(x, y, true, handData.left.y);
    }

    if (handData.right) {
      const x = handData.right.x * this.canvas.width;
      const y = handData.right.y * this.canvas.height;
      this._spawnRays(x, y, handData.right.y, false, deltaTime);
      this._drawCrosshair(x, y, false, handData.right.y);
    }

    // Draw UI text
    if (showNoHandsMessage && messageOpacity > 0) {
      this._drawNoHandsMessage(messageOpacity);
    }

    if (currentPatch?.name) {
      this._drawPatchName(currentPatch.name);
    }
  },

  /**
   * Spawn new rays from hand position - uses object pool
   */
  _spawnRays(x, y, normalizedY, isLeftHand, deltaTime) {
    const intensity = 1 - normalizedY; // Higher hand = more rays
    const spawnRate = this.config.rayDensityMultiplier * (1 + intensity * 2);

    // Spawn rays based on rate and time
    if (Math.random() < spawnRate * deltaTime) {
      // Get inactive ray from pool
      const ray = this.rayPool.find((r) => !r.active);
      if (!ray) return; // Pool exhausted, skip spawning

      // Activate and configure ray
      ray.active = true;
      ray.x = x;
      ray.y = y;
      ray.angle = Math.random() * Math.PI * 2;
      ray.distance = 0;
      ray.maxDistance =
        this.config.crosshairBaseSize * (0.4 + Math.random() * 0.6);
      ray.opacity = 0.2 + Math.random() * 0.5;
      ray.speed =
        this.config.crosshairBaseSize *
        0.1 *
        this.config.raySpeedMultiplier *
        (1 + intensity * 0.5);

      this.activeRays.push(ray);
    }
  },

  /**
   * Update and draw all active rays
   */
  _updateRays(deltaTime) {
    // Clear all rays if no hands are detected
    if (!this.currentHandData || this.currentHandData.activeHandsCount === 0) {
      this.activeRays = [];
      this.rayPool.forEach((ray) => (ray.active = false));
      return;
    }

    // Process rays in reverse order for safe removal
    for (let i = this.activeRays.length - 1; i >= 0; i--) {
      const ray = this.activeRays[i];

      // Update ray position
      ray.distance += ray.speed * deltaTime;

      // Calculate fade
      const progress = ray.distance / ray.maxDistance;
      const alpha = ray.opacity * Math.max(0, 1 - progress * progress);

      if (alpha > 0.01 && ray.distance < ray.maxDistance) {
        // Draw ray
        const tailLength = 40 * (this.config.rayLengthMultiplier || 1);
        const startDist = Math.max(0, ray.distance - tailLength);

        this.ctx.strokeStyle = this._getRayColor(alpha);
        this.ctx.lineWidth =
          (1 + (1 - progress) * 1) * (this.config.rayWidthMultiplier || 1);
        this.ctx.beginPath();
        this.ctx.moveTo(
          ray.x + Math.cos(ray.angle) * startDist,
          ray.y + Math.sin(ray.angle) * startDist
        );
        this.ctx.lineTo(
          ray.x + Math.cos(ray.angle) * ray.distance,
          ray.y + Math.sin(ray.angle) * ray.distance
        );
        this.ctx.stroke();
      } else {
        // Return ray to pool
        ray.active = false;
        this.activeRays.splice(i, 1);
      }
    }
  },

  /**
   * Get ray color with specified alpha
   */
  _getRayColor(alpha) {
    const baseColor = this.config.rayColor || 'rgba(255, 255, 255, 0.7)';
    // Extract RGB values and apply new alpha
    const match = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
    return `rgba(255, 255, 255, ${alpha})`;
  },

  /**
   * Draw hand crosshair with text
   */
  _drawCrosshair(x, y, isLeftHand, normalizedY) {
    const intensity = 1 - normalizedY;
    const size = (this.config.crosshairBaseSize * (1 + intensity * 2)) / 2;

    // Draw crosshair lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.lineWidth = 2 + intensity * 2;
    this.ctx.beginPath();

    // Vertical line
    this.ctx.moveTo(x, y - size);
    this.ctx.lineTo(x, y + size);
    // Horizontal line
    this.ctx.moveTo(x - size, y);
    this.ctx.lineTo(x + size, y);
    // Diagonals
    const diag = size * 0.707;
    this.ctx.moveTo(x - diag, y - diag);
    this.ctx.lineTo(x + diag, y + diag);
    this.ctx.moveTo(x - diag, y + diag);
    this.ctx.lineTo(x + diag, y - diag);

    this.ctx.stroke();

    // Draw text labels
    this.ctx.font = `bold ${this.config.crosshairFontSize}px -apple-system, system-ui, sans-serif`;
    this.ctx.fillStyle = 'white';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    this.ctx.shadowBlur = 5;

    const textOffset = size + 20;
    const lineHeight = this.config.crosshairFontSize * 1.2;

    if (isLeftHand) {
      // Left hand controls pitch and reverb
      this.ctx.textAlign = 'right';
      this.ctx.fillText(
        `Note: ${this._getNoteFromY(normalizedY)}`,
        x - textOffset,
        y - lineHeight / 2
      );
      this.ctx.fillText(
        `Reverb: ${Math.round((x / this.canvas.width) * 100)}%`,
        x - textOffset,
        y + lineHeight / 2
      );
    } else {
      // Right hand controls vibrato and overtones
      this.ctx.textAlign = 'left';
      const vibratoAmount = 1 - x / this.canvas.width;
      this.ctx.fillText(
        `Vibrato: ${Math.round(vibratoAmount * 100)}%`,
        x + textOffset,
        y - lineHeight / 2
      );

      const overtoneCount = Math.max(1, this.audioConfig.overtoneCount);
      const activeOvertones = 1 + Math.floor(intensity * (overtoneCount - 1));
      this.ctx.fillText(
        `Overtones: ${activeOvertones}`,
        x + textOffset,
        y + lineHeight / 2
      );
    }

    // Reset shadow
    this.ctx.shadowBlur = 0;
  },

  /**
   * Calculate note name from vertical position
   */
  _getNoteFromY(normalizedY) {
    const octaveRange = this.config.endOctave - this.config.startOctave + 1;
    const totalNotes = octaveRange * 12;
    const noteIndex = Math.floor((1 - normalizedY) * (totalNotes - 1));
    const octave = this.config.startOctave + Math.floor(noteIndex / 12);
    const note = this.notes[noteIndex % 12];
    return `${note}${octave}`;
  },

  /**
   * Draw pitch reference markers on right edge
   */
  _drawPitchMarkers() {
    const octaveRange = this.config.endOctave - this.config.startOctave + 1;
    const totalNotes = octaveRange * 12;

    this.ctx.font = `${this.config.pitchMarkerFontSize}px monospace`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i < totalNotes; i++) {
      const note = this.notes[i % 12];
      const octave = this.config.startOctave + Math.floor(i / 12);
      const y = this.canvas.height * (1 - i / (totalNotes - 1));

      // Draw line
      const isC = note === 'C';
      const lineLength = isC ? 25 : 15;
      this.ctx.strokeStyle = isC
        ? 'rgba(255, 255, 255, 0.7)'
        : 'rgba(255, 255, 255, 0.3)';
      this.ctx.lineWidth = isC ? 1.5 : 1;

      this.ctx.beginPath();
      this.ctx.moveTo(this.canvas.width - lineLength, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();

      // Draw text for C and G notes
      if (note === 'C' || note === 'G') {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.fillText(
          `${note}${octave}`,
          this.canvas.width - lineLength - 5,
          y
        );
      }
    }
  },

  /**
   * Draw "no hands" message
   */
  _drawNoHandsMessage(opacity) {
    this.ctx.save();
    this.ctx.font = `bold ${
      this.config.crosshairFontSize * 1.2
    }px -apple-system, system-ui, sans-serif`;
    this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText(
      'Bring both hands on screen to cast spells',
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.restore();
  },

  /**
   * Draw current patch name
   */
  _drawPatchName(name) {
    this.ctx.font = `italic ${
      this.config.pitchMarkerFontSize * 1.1
    }px -apple-system, system-ui, sans-serif`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Patch: ${name}`, 20, this.canvas.height - 20);
  },

  /**
   * Clean up resources
   */
  cleanup() {
    // Clear rays
    this.activeRays = [];
    this.rayPool.forEach((ray) => (ray.active = false));

    // Clear canvas
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },
};
