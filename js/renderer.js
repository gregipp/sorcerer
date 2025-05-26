// renderer.js - High-performance visual effects and canvas rendering for SORCERER
import { AppConfig } from './config.js';

export const Renderer = {
  canvas: null,
  ctx: null,
  video: null,

  rayStarts: [],
  lastFrameTime: Date.now(),

  notes: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

  config: { ...AppConfig.visuals },
  audioConfig: { ...AppConfig.audioDefaults },

  init(canvasEl, videoEl) {
    this.canvas = canvasEl;
    this.ctx = this.canvas.getContext('2d');
    this.video = videoEl;
    this.resize();
    this.lastFrameTime = Date.now();
  },

  updateConfigs(visualConfig, audioConfig) {
    this.config = { ...AppConfig.visuals, ...visualConfig };
    this.audioConfig = { ...AppConfig.audioDefaults, ...audioConfig };
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  drawFrame(
    rawResults,
    handData,
    showNoHandsMessage,
    messageOpacity,
    currentPatch
  ) {
    if (!this.ctx) return;

    const now = Date.now();
    const deltaTime = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

    this._drawPitchMarkers();

    if (handData.left) {
      const x = handData.left.x * this.canvas.width;
      const y = handData.left.y * this.canvas.height;
      this._drawCrosshair(x, y, true, handData.left.y, deltaTime);
    }

    if (handData.right) {
      const x = handData.right.x * this.canvas.width;
      const y = handData.right.y * this.canvas.height;
      this._drawCrosshair(x, y, false, handData.right.y, deltaTime);
    }

    this._updateRays(deltaTime, handData);

    if (showNoHandsMessage && messageOpacity > 0) {
      this._drawNoHandsMessage(messageOpacity);
    }

    if (currentPatch?.name) {
      this._drawPatchName(currentPatch.name);
    }
  },

  _drawCrosshair(x, y, isLeftHand, normalizedY, deltaTime) {
    const normalizedYForEffect = isLeftHand
      ? 1 - normalizedY
      : this._calculateRightHandIntensity(normalizedY);

    const sizeMultiplier = 1 + normalizedYForEffect * 3;
    const currentCrosshairSize = this.config.crosshairBaseSize * sizeMultiplier;

    const raySpeed =
      this.config.crosshairBaseSize * 0.5 +
      normalizedYForEffect * this.config.crosshairBaseSize * 2;
    const raySpawnRate =
      (0.5 + normalizedYForEffect * 1.5) *
      (this.config.rayDensityMultiplier || 1);

    if (Math.random() < raySpawnRate * deltaTime * 60) {
      this.rayStarts.push({
        spawnX: x,
        spawnY: y,
        angle: Math.random() * Math.PI * 2,
        distance: 0,
        isLeftHandSource: isLeftHand,
        speed: raySpeed * (this.config.raySpeedMultiplier || 1),
        maxDistance: currentCrosshairSize,
      });
    }

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.lineWidth = 2;
    const S = currentCrosshairSize / 2;

    this.ctx.beginPath();
    this.ctx.moveTo(x, y - S);
    this.ctx.lineTo(x, y + S);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(x - S, y);
    this.ctx.lineTo(x + S, y);
    this.ctx.stroke();

    const diagOffset = S / 1.414;
    this.ctx.beginPath();
    this.ctx.moveTo(x - diagOffset, y - diagOffset);
    this.ctx.lineTo(x + diagOffset, y + diagOffset);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(x - diagOffset, y + diagOffset);
    this.ctx.lineTo(x + diagOffset, y - diagOffset);
    this.ctx.stroke();

    this.ctx.font = `${this.config.crosshairFontSize}px -apple-system, system-ui, sans-serif`;
    this.ctx.fillStyle = 'white';
    this.ctx.textBaseline = 'middle';
    const textOffset = S + 20;

    if (isLeftHand) {
      this.ctx.textAlign = 'right';
      this.ctx.fillText(
        `Note: ${this._getNoteFromY(normalizedY)}`,
        x - textOffset,
        y - this.config.crosshairFontSize / 2 - 5
      );
      this.ctx.fillText(
        `Reverb: ${Math.round((x / this.canvas.width) * 100)}%`,
        x - textOffset,
        y + this.config.crosshairFontSize / 2 + 5
      );
    } else {
      this.ctx.textAlign = 'left';
      const vibratoAmount = 1 - x / this.canvas.width;
      this.ctx.fillText(
        `Vibrato: ${Math.round(vibratoAmount * 100)}%`,
        x + textOffset,
        y - this.config.crosshairFontSize / 2 - 5
      );

      const overtoneCount = Math.max(1, this.audioConfig.overtoneCount);
      const activeOvertones =
        1 + Math.floor((1 - normalizedY) * (overtoneCount - 1));
      this.ctx.fillText(
        `Overtones: ${activeOvertones}`,
        x + textOffset,
        y + this.config.crosshairFontSize / 2 + 5
      );
    }

    this.ctx.restore();
  },

  _calculateRightHandIntensity(normalizedY) {
    const overtoneControl = 1 - normalizedY;
    const overtoneCount = Math.max(1, this.audioConfig.overtoneCount);
    const numActiveOvertones =
      1 + Math.floor(overtoneControl * (overtoneCount - 1));

    if (overtoneCount <= 1) {
      return 0;
    }
    return (numActiveOvertones - 1) / (overtoneCount - 1);
  },

  _updateRays(deltaTime, handData) {
    if (!handData || handData.activeHandsCount === 0) {
      this.rayStarts = [];
      return;
    }

    const nextRayStarts = [];
    const leftX = handData.left ? handData.left.x * this.canvas.width : null;
    const leftY = handData.left ? handData.left.y * this.canvas.height : null;
    const rightX = handData.right ? handData.right.x * this.canvas.width : null;
    const rightY = handData.right
      ? handData.right.y * this.canvas.height
      : null;

    this.rayStarts.forEach((ray) => {
      ray.distance += ray.speed * deltaTime;

      let currentX, currentY;
      if (ray.isLeftHandSource && leftX !== null) {
        currentX = leftX;
        currentY = leftY;
      } else if (!ray.isLeftHandSource && rightX !== null) {
        currentX = rightX;
        currentY = rightY;
      } else {
        return;
      }

      const alpha = Math.max(0, 1 - ray.distance / ray.maxDistance);

      if (alpha > 0 && ray.distance < ray.maxDistance) {
        this.ctx.beginPath();

        const baseColor = this.config.rayColor || 'rgba(255, 255, 255, 0.7)';
        const match = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          this.ctx.strokeStyle = `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
        } else {
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        }

        this.ctx.lineWidth = 1;

        const startDist = Math.max(0, ray.distance - 40);
        const endDist = ray.distance;

        this.ctx.moveTo(
          currentX + Math.cos(ray.angle) * startDist,
          currentY + Math.sin(ray.angle) * startDist
        );
        this.ctx.lineTo(
          currentX + Math.cos(ray.angle) * endDist,
          currentY + Math.sin(ray.angle) * endDist
        );
        this.ctx.stroke();

        nextRayStarts.push(ray);
      }
    });

    this.rayStarts = nextRayStarts;
  },

  _getNoteFromY(normalizedY) {
    const octaveRange = this.config.endOctave - this.config.startOctave + 1;
    const totalNotes = octaveRange * 12;
    const noteIndex = Math.floor((1 - normalizedY) * (totalNotes - 1));
    const octave = this.config.startOctave + Math.floor(noteIndex / 12);
    const note = this.notes[noteIndex % 12];
    return `${note}${octave}`;
  },

  _drawPitchMarkers() {
    const octaveRange = this.config.endOctave - this.config.startOctave + 1;
    const totalNotes = octaveRange * 12;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.font = `${this.config.pitchMarkerFontSize}px monospace`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i < totalNotes; i++) {
      const note = this.notes[i % 12];
      const octave = this.config.startOctave + Math.floor(i / 12);
      const y = this.canvas.height * (1 - i / (totalNotes - 1));

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

      if (note === 'C' || note === 'G') {
        this.ctx.fillText(
          `${note}${octave}`,
          this.canvas.width - lineLength - 5,
          y
        );
      }
    }
    this.ctx.restore();
  },

  _drawNoHandsMessage(opacity) {
    this.ctx.save();
    this.ctx.font = `bold ${
      this.config.crosshairFontSize * 1.2
    }px -apple-system, system-ui, sans-serif`;
    this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      'Bring both hands on screen to cast spells',
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.restore();
  },

  _drawPatchName(name) {
    this.ctx.font = `italic ${
      this.config.pitchMarkerFontSize * 1.1
    }px -apple-system, system-ui, sans-serif`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Patch: ${name}`, 20, this.canvas.height - 20);
  },

  cleanup() {
    this.rayStarts = [];
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },
};
