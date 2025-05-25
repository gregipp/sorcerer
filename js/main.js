// js/main.js
import { AppConfig } from './config.js';
import { AudioEngine } from './audio_engine.js';
import { HandInput } from './hand_input.js';
import { Renderer } from './renderer.js';
import { PatchManager } from './patch_manager.js';
import { VisualEffectsManager } from './visual_effects_manager.js';

/**
 * Main application controller for SORCERER.
 * Initializes and coordinates all modules (AudioEngine, HandInput, Renderer, PatchManager).
 */
const App = {
  isInitialized: false,
  currentPatch: null,
  patchKeys: [], // To store the keys/names of loaded patches for cycling

  // For "No Hands Detected" message logic
  noHandsDetectedTimestamp: null,
  isNoHandsMessageVisible: false,
  noHandsMessageCurrentOpacity: 0,
  lastFrameTimeForDelta: 0,

  domElements: {
    videoElement: null,
    canvasElement: null,
    logoContainer: null,
    subtitle: null,
    backgroundImage: null,
    patchPanel: null,
    patchButtons: {
      thereminPatch: null,
      synthPatch: null,
      bassSynthPatch: null,
    },
    llmJsonTextarea: null,
    loadLlmPatchButton: null,
    llmPatchInputContainer: null, // Added this to easily show/hide
  },

  eventHandlers: {
    resize: null,
    startExperience: null,
    patchButtons: {},
    loadLlmPatch: null,
  },

  /**
   * Initializes the entire application.
   * This is typically called once after the DOM is loaded.
   */
  async init() {
    // Cache all core DOM elements at initialization
    this.domElements.videoElement = document.getElementById('video');
    this.domElements.canvasElement = document.getElementById('canvas');
    this.domElements.logoContainer = document.querySelector('.logo-container');
    this.domElements.subtitle = document.querySelector('.subtitle');
    this.domElements.backgroundImage =
      document.querySelector('.background-image');
    this.domElements.patchPanel = document.querySelector('.patch-panel');
    this.domElements.llmJsonTextarea = document.getElementById('llmPatchJson');
    this.domElements.loadLlmPatchButton =
      document.getElementById('loadLlmPatch');
    this.domElements.llmPatchInputContainer = document.querySelector(
      '.llm-patch-input-container'
    );

    // Cache patch buttons
    this.domElements.patchButtons.thereminPatch =
      document.getElementById('thereminPatch');
    this.domElements.patchButtons.synthPatch =
      document.getElementById('synthPatch');
    this.domElements.patchButtons.bassSynthPatch =
      document.getElementById('bassSynthPatch');

    // Create and store bound event handlers
    this.eventHandlers.resize = () => Renderer.resize();
    this.eventHandlers.startExperience = this.startExperience.bind(this);
    this.eventHandlers.loadLlmPatch = this.handleLlmPatchLoad.bind(this);

    // Set up the main click listener with the stored handler
    document.body.addEventListener(
      'click',
      this.eventHandlers.startExperience,
      {
        once: true,
      }
    );

    window.addEventListener('resize', this.eventHandlers.resize);

    if (!this.domElements.videoElement || !this.domElements.canvasElement) {
      console.error('App: Critical HTML elements (video or canvas) not found.');
      return;
    }

    // Initialize Renderer with cached elements
    Renderer.init(
      this.domElements.canvasElement,
      this.domElements.videoElement
    );

    // Initialize VisualEffectsManager
    VisualEffectsManager.init();

    // Load all patches
    try {
      await PatchManager.loadDefaultPatches();
      this.patchKeys = PatchManager.getPatchNames();
      console.log(
        'App: Loaded patch keys:',
        this.patchKeys,
        `(Count: ${this.patchKeys.length})`
      ); // Diagnostic log

      if (this.patchKeys.length > 0) {
        this.currentPatch = PatchManager.getFirstPatch();
        if (!this.currentPatch) {
          console.error(
            'App: Could not get a valid first patch, though patch keys exist.'
          );
          this.currentPatch = this._createFallbackPatch();
        }
      } else {
        console.warn(
          'App: No patches loaded. Application might not function correctly. Using fallback.'
        );
        this.currentPatch = this._createFallbackPatch();
        this.patchKeys = [this.currentPatch.name]; // Ensure patchKeys has at least the fallback
      }
      // Apply initial patch settings to AudioEngine
      AudioEngine.applyPatch(this.currentPatch);
    } catch (error) {
      console.error('App: Error loading patches:', error);
      this.currentPatch = this._createFallbackPatch();
      this.patchKeys = [this.currentPatch.name];
      AudioEngine.applyPatch(this.currentPatch);
    }

    // Initial render
    Renderer.resize();
    Renderer.updateConfigs(
      VisualEffectsManager.getEffectiveVisuals(this.currentPatch),
      this.currentPatch.audio || AppConfig.audioDefaults
    );

    this.animationFrameLoop();
    console.log(
      'App: Initialized. Waiting for user interaction to start audio and hand tracking.'
    );
  },

  /**
   * Creates a very basic fallback patch if no patches can be loaded.
   */
  _createFallbackPatch() {
    console.warn('App: Creating a minimal fallback patch.');
    return {
      patchSchemaVersion: '1.0',
      name: 'Fallback Sine',
      description: 'A basic sine wave sound.',
      audio: { ...AppConfig.audioDefaults },
      visuals: { ...VisualEffectsManager.getBaseEnhancedVisuals() },
      octaveOffset: 0,
      arpeggiator: null,
    };
  },

  /**
   * Starts the main audio-visual experience after user interaction.
   */
  async startExperience() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('App: User interaction detected. Starting full experience...');

    this.animateLogoAndBG();

    try {
      await AudioEngine.init();
      AudioEngine.applyPatch(this.currentPatch);
      console.log('App: AudioEngine started and initial patch applied.');

      await HandInput.init(
        this.domElements.videoElement,
        this.onHandResults.bind(this)
      );
      console.log('App: HandInput started.');

      this.setupPatchUIListeners();
    } catch (error) {
      console.error('App: Error starting experience:', error);
      this.isInitialized = false;
      alert(
        'Could not initialize audio or camera. Please check permissions and refresh.'
      );
    }

    this.lastFrameTimeForDelta = performance.now();
    if (!this._animationFrameId) {
      this.animationFrameLoop();
    }
  },

  /**
   * Sets up event listeners for the patch selection UI.
   */
  setupPatchUIListeners() {
    const patchButtonsInfo = [
      {
        id: 'thereminPatch',
        defaultKeyHint: PatchManager.defaultPatchNames[0]
          ?.replace('patches/', '')
          .replace('.json', ''),
      },
      {
        id: 'synthPatch',
        defaultKeyHint: PatchManager.defaultPatchNames[1]
          ?.replace('patches/', '')
          .replace('.json', ''),
      },
      {
        id: 'bassSynthPatch',
        defaultKeyHint: PatchManager.defaultPatchNames[2]
          ?.replace('patches/', '')
          .replace('.json', ''),
      },
    ];

    patchButtonsInfo.forEach((btnInfo) => {
      const button = this.domElements.patchButtons[btnInfo.id];
      if (!button) {
        console.warn(`App: Button with ID "${btnInfo.id}" not found.`);
        return;
      }

      let patchKeyForButton = this.patchKeys.find((pk) => {
        const patch = PatchManager.getPatch(pk);
        const hint = btnInfo.defaultKeyHint?.toLowerCase();
        return (
          patch &&
          hint &&
          (patch.name.toLowerCase().includes(hint) ||
            pk.toLowerCase().includes(hint))
        );
      });

      if (
        !patchKeyForButton &&
        this.patchKeys.length >= patchButtonsInfo.indexOf(btnInfo) + 1
      ) {
        patchKeyForButton = this.patchKeys[patchButtonsInfo.indexOf(btnInfo)];
      }

      if (
        button &&
        patchKeyForButton &&
        PatchManager.getPatch(patchKeyForButton)
      ) {
        // Store the bound handler and add the listener
        this.eventHandlers.patchButtons[btnInfo.id] = () =>
          this.selectPatch(patchKeyForButton);
        button.addEventListener(
          'click',
          this.eventHandlers.patchButtons[btnInfo.id]
        );
      } else if (button) {
        button.disabled = true;
        button.title = 'Patch not loaded or key mismatch';
        console.warn(
          `App: Button ${btnInfo.id} (hint: ${
            btnInfo.defaultKeyHint
          }) - corresponding patch not reliably found or loaded. PatchKey tried: ${patchKeyForButton}. Available keys: ${this.patchKeys.join(
            ', '
          )}`
        );
      }
    });

    // Set up LLM patch input handling if present - FIXED EVENT LISTENER SETUP
    if (
      this.domElements.loadLlmPatchButton &&
      this.domElements.llmJsonTextarea
    ) {
      this.domElements.loadLlmPatchButton.addEventListener(
        'click',
        this.eventHandlers.loadLlmPatch
      );
      console.log('App: LLM patch load button event listener attached');
    } else {
      console.warn('App: LLM patch button or textarea not found');
    }

    this.updateActivePatchButton();
    console.log('App: Patch UI listeners set up.');
  },

  /**
   * Handles loading a patch from the LLM JSON textarea.
   */
  handleLlmPatchLoad() {
    // FIXED: Use domElements consistently
    if (!this.domElements.llmJsonTextarea) {
      console.error('App: LLM JSON textarea not found');
      return;
    }

    const jsonString = this.domElements.llmJsonTextarea.value;
    console.log(
      'App: Attempting to load LLM patch JSON:',
      jsonString.substring(0, 50) + '...'
    );

    try {
      const patchObject = JSON.parse(jsonString);
      const patchName = patchObject.name || `Custom LLM Patch ${Date.now()}`;

      if (PatchManager.addPatch(patchObject, patchName)) {
        this.patchKeys = PatchManager.getPatchNames();
        this.selectPatch(patchName);
        this.domElements.llmJsonTextarea.value = '';
        alert(`Custom patch "${patchName}" loaded successfully!`);
        console.log('App: Successfully loaded custom patch:', patchName);
      } else {
        alert(
          'Failed to add custom patch. Invalid JSON structure or data (check console).'
        );
        console.error(
          'App: Failed to add patch. PatchManager validation rejected it.'
        );
      }
    } catch (error) {
      console.error('App: Error parsing LLM JSON patch:', error);
      alert('Invalid JSON format. Please check the patch data.');
    }
  },

  /**
   * Callback function for when HandInput processes new hand tracking results.
   * @param {object} rawResults - Raw results from MediaPipe.
   * @param {object} processedHands - Processed hand data { left, right, activeHandsCount }.
   */
  onHandResults(rawResults, processedHands) {
    if (!this.isInitialized || !AudioEngine.audioCtx) return;

    const currentTime = performance.now();
    let deltaTime = this.lastFrameTimeForDelta
      ? (currentTime - this.lastFrameTimeForDelta) / 1000.0
      : 1 / 60.0;
    if (deltaTime <= 0) deltaTime = 1 / 60.0;
    this.lastFrameTimeForDelta = currentTime;

    if (processedHands.left && processedHands.left.cyclePatchGesture) {
      this.cycleNextPatch();
    }

    if (processedHands.right) {
      AudioEngine.setArpeggiatorState(processedHands.right.isFist);
    } else {
      AudioEngine.setArpeggiatorState(false);
    }

    const handsArePresent = processedHands.activeHandsCount > 0;
    AudioEngine.setEnvelopeState(handsArePresent);

    if (handsArePresent) {
      AudioEngine.update(processedHands.left, processedHands.right);
    }

    const HAND_ABSENCE_THRESHOLD_MS = AppConfig.ui.noHandsMessageDelay;
    const MESSAGE_FADE_IN_DURATION_SECONDS = AppConfig.ui.messageFadeInDuration;
    const opacityIncrementPerFrame =
      MESSAGE_FADE_IN_DURATION_SECONDS > 0
        ? (1.0 / MESSAGE_FADE_IN_DURATION_SECONDS) * deltaTime
        : 1.0;

    if (!handsArePresent) {
      if (this.noHandsDetectedTimestamp === null) {
        this.noHandsDetectedTimestamp = currentTime;
      }
      if (
        currentTime - this.noHandsDetectedTimestamp >=
        HAND_ABSENCE_THRESHOLD_MS
      ) {
        this.isNoHandsMessageVisible = true;
        if (this.noHandsMessageCurrentOpacity < 1) {
          this.noHandsMessageCurrentOpacity = Math.min(
            1,
            this.noHandsMessageCurrentOpacity + opacityIncrementPerFrame
          );
        }
      } else {
        this.isNoHandsMessageVisible = false;
        this.noHandsMessageCurrentOpacity = 0;
      }
    } else {
      this.noHandsDetectedTimestamp = null;
      this.isNoHandsMessageVisible = false;
      this.noHandsMessageCurrentOpacity = 0;
    }
  },

  /**
   * Selects and applies a new instrument patch.
   * @param {string} patchKey - The key/name of the patch to select.
   */
  selectPatch(patchKey) {
    const newPatch = PatchManager.getPatch(patchKey);
    if (newPatch) {
      this.currentPatch = newPatch;
      AudioEngine.applyPatch(this.currentPatch);

      // Get the effective visuals for this patch using VisualEffectsManager
      const visualConfig = VisualEffectsManager.getEffectiveVisuals(newPatch);

      // Update the renderer with new configs
      Renderer.updateConfigs(
        visualConfig,
        newPatch.audio || AppConfig.audioDefaults
      );

      this.updateActivePatchButton();
      console.log(
        `App: Selected patch "${newPatch.name}" (Key: "${patchKey}").`
      );
    } else {
      console.warn(
        `App: Patch with key "${patchKey}" not found when trying to select.`
      );
    }
  },

  /**
   * Cycles to the next available patch.
   */
  cycleNextPatch() {
    if (!this.patchKeys || this.patchKeys.length === 0) {
      console.warn('App: No patch keys available to cycle.');
      return;
    }

    let currentPatchKey = this.currentPatch
      ? this.patchKeys.find(
          (key) => PatchManager.getPatch(key)?.name === this.currentPatch.name
        ) || this.patchKeys[0]
      : this.patchKeys[0];
    let currentIndex = this.patchKeys.indexOf(currentPatchKey);

    if (currentIndex === -1) {
      console.warn(
        'App: Current patch key not found in patchKeys array, defaulting to first patch for cycling.'
      );
      currentIndex = 0;
    }

    const nextIndex = (currentIndex + 1) % this.patchKeys.length;
    this.selectPatch(this.patchKeys[nextIndex]);
  },

  /**
   * Updates the UI to show which patch button is active.
   */
  updateActivePatchButton() {
    // Simple direct mapping of patch names to button keys
    const patchButtonMap = {
      'Classic Theremin': 'thereminPatch',
      'Bright Saw Lead': 'synthPatch',
      'Brutal Brass Bass': 'bassSynthPatch',
    };

    // Clear all active states
    Object.values(this.domElements.patchButtons).forEach((btn) => {
      if (btn) btn.classList.remove('active');
    });

    // Set active state on the matching button
    if (this.currentPatch && this.currentPatch.name) {
      const buttonKey = patchButtonMap[this.currentPatch.name];
      if (buttonKey && this.domElements.patchButtons[buttonKey]) {
        this.domElements.patchButtons[buttonKey].classList.add('active');
      }
    }
  },

  /**
   * Main animation loop using requestAnimationFrame.
   */
  _animationFrameId: null,

  animationFrameLoop() {
    const frameStart = performance.now();

    if (this.isInitialized && AudioEngine.audioCtx) {
      Renderer.drawFrame(
        null,
        HandInput.handPositions || {
          left: null,
          right: null,
          activeHandsCount: 0,
        },
        this.isNoHandsMessageVisible,
        this.noHandsMessageCurrentOpacity,
        this.currentPatch
      );
    } else if (Renderer.ctx) {
      Renderer.ctx.clearRect(
        0,
        0,
        Renderer.canvasElement.width,
        Renderer.canvasElement.height
      );
      if (
        Renderer.canvasElement.width > 0 &&
        Renderer.canvasElement.height > 0
      ) {
        Renderer._drawPitchMarkers();
      }
    }

    // Performance monitoring
    if (AppConfig.debug.enabled) {
      const frameTime = performance.now() - frameStart;

      if (AppConfig.debug.showFPS) {
        Renderer.drawDebugInfo(1000 / frameTime, frameTime);
      }

      if (
        AppConfig.debug.logPerformance &&
        frameTime > AppConfig.debug.slowFrameThreshold
      ) {
        console.warn(`Slow frame: ${frameTime.toFixed(2)}ms`);
      }
    }

    this._animationFrameId = requestAnimationFrame(
      this.animationFrameLoop.bind(this)
    );
  },

  /**
   * Stops the animation loop.
   */
  stopAnimationFrameLoop() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  },

  animateLogoAndBG() {
    if (this.domElements.logoContainer) {
      this.domElements.logoContainer.classList.add('moved');
    }
    if (this.domElements.backgroundImage) {
      this.domElements.backgroundImage.classList.add('hidden');
    }

    // Make patch panel slide in after a short delay
    setTimeout(() => {
      if (this.domElements.patchPanel) {
        this.domElements.patchPanel.classList.add('visible');
      }
      // FIXED: Use cached DOM element instead of querying again
      if (this.domElements.llmPatchInputContainer) {
        this.domElements.llmPatchInputContainer.style.display = 'flex';
        console.log('App: Showing LLM patch input container');
      } else {
        console.warn('App: LLM patch input container not found in DOM cache');
      }
    }, 600);
  },

  cleanup() {
    // Remove window events
    if (this.eventHandlers.resize) {
      window.removeEventListener('resize', this.eventHandlers.resize);
    }

    // Remove patch button listeners
    Object.entries(this.eventHandlers.patchButtons).forEach(
      ([buttonId, handler]) => {
        const button = this.domElements.patchButtons[buttonId];
        if (button && handler) {
          button.removeEventListener('click', handler);
        }
      }
    );

    // Remove LLM patch load listener
    if (
      this.eventHandlers.loadLlmPatch &&
      this.domElements.loadLlmPatchButton
    ) {
      this.domElements.loadLlmPatchButton.removeEventListener(
        'click',
        this.eventHandlers.loadLlmPatch
      );
    }

    // Clear event handler references
    this.eventHandlers = {
      resize: null,
      startExperience: null,
      patchButtons: {},
      loadLlmPatch: null, // FIXED: Added this to properly clean up
    };

    // Clean up other modules
    Renderer.cleanup();
    AudioEngine.cleanup();
    HandInput.cleanup();

    // Reset application state
    this.isInitialized = false;
    this.noHandsDetectedTimestamp = null;
    this.isNoHandsMessageVisible = false;
    this.noHandsMessageCurrentOpacity = 0;

    console.log('App: Cleaned up all resources.');
  },
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
