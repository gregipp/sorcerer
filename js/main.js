// main.js - Main application controller for SORCERER
import { AppConfig } from './config.js';
import { AudioEngine } from './audio_engine.js';
import { HandInput } from './hand_input.js';
import { Renderer } from './renderer.js';
import { PatchManager } from './patch_manager.js';

const App = {
  initialized: false,
  noHandsTimer: null,
  noHandsOpacity: 0,
  lastFrameTime: 0,
  animationFrameId: null,

  elements: {
    video: null,
    canvas: null,
    logoContainer: null,
    backgroundImage: null,
    patchPanel: null,
    patchButtons: [],
    llmTextarea: null,
    llmButton: null,
  },

  async init() {
    this.elements.video = document.getElementById('video');
    this.elements.canvas = document.getElementById('canvas');
    this.elements.logoContainer = document.querySelector('.logo-container');
    this.elements.backgroundImage = document.querySelector('.background-image');
    this.elements.patchPanel = document.querySelector('.patch-panel');
    this.elements.patchButtons = Array.from(
      document.querySelectorAll('.patch-button')
    );
    this.elements.llmTextarea = document.getElementById('llmPatchJson');
    this.elements.llmButton = document.getElementById('loadLlmPatch');
    this.elements.llmContainer = document.querySelector(
      '.llm-patch-input-container'
    );

    if (!this.elements.video || !this.elements.canvas) {
      console.error('Critical elements missing from page');
      return;
    }

    Renderer.init(this.elements.canvas, this.elements.video);
    window.addEventListener('resize', () => Renderer.resize());

    try {
      await PatchManager.loadDefaultPatches();
      const firstPatch = PatchManager.getCurrentPatch();
      Renderer.updateConfigs(
        firstPatch.visuals || {},
        firstPatch.audio || AppConfig.audioDefaults
      );
    } catch (error) {
      console.error('Failed to load patches:', error);
      alert(
        'Failed to load instrument patches. Please check your installation.'
      );
      return;
    }

    document.body.addEventListener('click', () => this.start(), { once: true });
    this.animate();
    console.log('App initialized. Click to start audio and camera.');
  },

  async start() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('Starting SORCERER experience...');

    this.elements.logoContainer.classList.add('moved');
    this.elements.backgroundImage.classList.add('hidden');
    setTimeout(() => {
      this.elements.patchPanel.classList.add('visible');
      this.elements.llmContainer.style.display = 'flex';
    }, 600);

    try {
      await AudioEngine.init();
      const currentPatch = PatchManager.getCurrentPatch();
      AudioEngine.applyPatch(currentPatch);

      await HandInput.init(this.elements.video, (raw, processed) =>
        this.onHandsUpdate(processed)
      );

      this.setupUIHandlers();
    } catch (error) {
      console.error('Failed to start:', error);
      this.initialized = false;

      if (error.message.includes('camera')) {
        alert(
          'Camera access denied. Please allow camera access and refresh the page.'
        );
      } else {
        alert(
          'Failed to initialize. Please check your browser supports WebRTC and Web Audio.'
        );
      }
    }
  },

  setupUIHandlers() {
    this.elements.patchButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        const patch = PatchManager.selectPatch(index);
        if (patch) {
          AudioEngine.applyPatch(patch);
          Renderer.updateConfigs(
            patch.visuals || {},
            patch.audio || AppConfig.audioDefaults
          );
          this.updatePatchButtons(index);
        }
      });
    });

    this.updatePatchButtons(0);

    this.elements.llmButton.addEventListener('click', () => {
      try {
        const patchData = JSON.parse(this.elements.llmTextarea.value);

        if (PatchManager.addPatch(patchData)) {
          const newIndex = PatchManager.getAllPatches().length - 1;
          const patch = PatchManager.selectPatch(newIndex);

          AudioEngine.applyPatch(patch);
          Renderer.updateConfigs(
            patch.visuals || {},
            patch.audio || AppConfig.audioDefaults
          );

          this.elements.llmTextarea.value = '';
          alert(`Loaded custom patch: ${patch.name}`);
        } else {
          alert('Invalid patch format. Check console for details.');
        }
      } catch (error) {
        console.error('Failed to parse patch JSON:', error);
        alert('Invalid JSON. Please check your patch data.');
      }
    });
  },

  updatePatchButtons(activeIndex) {
    this.elements.patchButtons.forEach((button, index) => {
      button.classList.toggle('active', index === activeIndex);
    });
  },

  onHandsUpdate(hands) {
    if (!this.initialized) return;

    if (hands.left?.cyclePatchGesture) {
      const patch = PatchManager.selectNextPatch();
      AudioEngine.applyPatch(patch);
      Renderer.updateConfigs(
        patch.visuals || {},
        patch.audio || AppConfig.audioDefaults
      );
      this.updatePatchButtons(PatchManager.currentPatchIndex);
    }

    AudioEngine.setArpeggiatorState(hands.right?.isFist || false);

    const handsPresent = hands.activeHandsCount > 0;
    AudioEngine.setEnvelopeState(handsPresent);

    if (handsPresent) {
      AudioEngine.update(hands.left, hands.right);
    }

    if (!handsPresent) {
      if (!this.noHandsTimer) {
        this.noHandsTimer = Date.now();
      }
    } else {
      this.noHandsTimer = null;
      this.noHandsOpacity = 0;
    }
  },

  animate() {
    const now = performance.now();
    const deltaTime = this.lastFrameTime
      ? (now - this.lastFrameTime) / 1000
      : 0;
    this.lastFrameTime = now;

    if (
      this.noHandsTimer &&
      now - this.noHandsTimer > AppConfig.ui.noHandsMessageDelay
    ) {
      this.noHandsOpacity = Math.min(
        1,
        this.noHandsOpacity + deltaTime / AppConfig.ui.messageFadeInDuration
      );
    }

    Renderer.drawFrame(
      null,
      HandInput.handPositions,
      this.noHandsTimer !== null && this.noHandsOpacity > 0,
      this.noHandsOpacity,
      PatchManager.getCurrentPatch()
    );

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  },

  cleanup() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    AudioEngine.cleanup();
    HandInput.cleanup();
    Renderer.cleanup();

    console.log('App cleaned up');
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
window.addEventListener('beforeunload', () => App.cleanup());
