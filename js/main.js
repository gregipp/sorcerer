// main.js - Main application controller for SORCERER
import { AppConfig } from './config.js';
import { AudioEngine } from './audio_engine.js';
import { HandInput } from './hand_input.js';
import { Renderer } from './renderer.js';
import { PatchManager } from './patch_manager.js';

/**
 * Main application controller.
 * Coordinates all modules and manages the application lifecycle.
 */
const App = {
  initialized: false,

  // State management
  noHandsTimer: null,
  noHandsOpacity: 0,
  lastFrameTime: 0,
  animationFrameId: null,

  // DOM element cache
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

  /**
   * Initialize the application on page load
   */
  async init() {
    // Cache DOM elements
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

    // Check critical elements
    if (!this.elements.video || !this.elements.canvas) {
      console.error('Critical elements missing from page');
      return;
    }

    // Initialize renderer
    Renderer.init(this.elements.canvas, this.elements.video);

    // Add resize handler
    window.addEventListener('resize', () => Renderer.resize());

    // Load patches
    try {
      await PatchManager.loadDefaultPatches();
      const firstPatch = PatchManager.getCurrentPatch();

      // Update renderer with initial patch visuals
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

    // Set up one-time click to start
    document.body.addEventListener('click', () => this.start(), { once: true });

    // Start render loop
    this.animate();

    console.log('App initialized. Click to start audio and camera.');
  },

  /**
   * Start the full experience after user interaction
   */
  async start() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('Starting SORCERER experience...');

    // Animate UI
    this.elements.logoContainer.classList.add('moved');
    this.elements.backgroundImage.classList.add('hidden');
    setTimeout(() => {
      this.elements.patchPanel.classList.add('visible');
      const llmContainer = document.querySelector('.llm-patch-input-container');
      if (llmContainer) llmContainer.style.display = 'flex';
    }, 600);

    try {
      // Initialize audio
      await AudioEngine.init();
      const currentPatch = PatchManager.getCurrentPatch();
      AudioEngine.applyPatch(currentPatch);

      // Initialize hand tracking
      await HandInput.init(this.elements.video, (raw, processed) =>
        this.onHandsUpdate(processed)
      );

      // Set up UI event handlers
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

  /**
   * Set up UI event handlers for patch selection
   */
  setupUIHandlers() {
    // Patch buttons
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

    // Update initial active button
    this.updatePatchButtons(0);

    // LLM patch loader
    if (this.elements.llmButton && this.elements.llmTextarea) {
      this.elements.llmButton.addEventListener('click', () => {
        try {
          const patchData = JSON.parse(this.elements.llmTextarea.value);

          if (PatchManager.addPatch(patchData)) {
            // Select the newly added patch
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
    }
  },

  /**
   * Update active state of patch buttons
   */
  updatePatchButtons(activeIndex) {
    this.elements.patchButtons.forEach((button, index) => {
      button.classList.toggle('active', index === activeIndex);
    });
  },

  /**
   * Handle hand tracking updates
   */
  onHandsUpdate(hands) {
    if (!this.initialized) return;

    // Check for patch cycling gesture (left hand open fist)
    if (hands.left?.cyclePatchGesture) {
      const patch = PatchManager.selectNextPatch();
      AudioEngine.applyPatch(patch);
      Renderer.updateConfigs(
        patch.visuals || {},
        patch.audio || AppConfig.audioDefaults
      );
      this.updatePatchButtons(PatchManager.currentPatchIndex);
    }

    // Control arpeggiator with right fist
    AudioEngine.setArpeggiatorState(hands.right?.isFist || false);

    // Control envelope based on hand presence
    const handsPresent = hands.activeHandsCount > 0;
    AudioEngine.setEnvelopeState(handsPresent);

    // Update audio parameters if hands are present
    if (handsPresent) {
      AudioEngine.update(hands.left, hands.right);
    }

    // Handle "no hands" message timing
    if (!handsPresent) {
      if (!this.noHandsTimer) {
        this.noHandsTimer = Date.now();
      }
    } else {
      this.noHandsTimer = null;
      this.noHandsOpacity = 0;
    }
  },

  /**
   * Main animation loop
   */
  animate() {
    const now = performance.now();
    const deltaTime = this.lastFrameTime
      ? (now - this.lastFrameTime) / 1000
      : 0;
    this.lastFrameTime = now;

    // Update "no hands" message opacity
    if (
      this.noHandsTimer &&
      now - this.noHandsTimer > AppConfig.ui.noHandsMessageDelay
    ) {
      this.noHandsOpacity = Math.min(
        1,
        this.noHandsOpacity + deltaTime / AppConfig.ui.messageFadeInDuration
      );
    }

    // Render frame
    Renderer.drawFrame(
      null,
      HandInput.handPositions,
      this.noHandsTimer !== null && this.noHandsOpacity > 0,
      this.noHandsOpacity,
      PatchManager.getCurrentPatch()
    );

    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.animate());
  },

  /**
   * Clean up resources on page unload
   */
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

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => App.init());

// Clean up on page unload
window.addEventListener('beforeunload', () => App.cleanup());
