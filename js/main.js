// main.js - Main application controller for SORCERER
import { AppConfig } from './config.js';
import { AudioEngine } from './audio_engine.js';
import { HandInput } from './hand_input.js';
import { Renderer } from './renderer.js';
import { PatchManager } from './patch_manager.js';
import { LLMService } from './llm_anthropic_service.js';

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
    patchButtonsContainer: null,
    llmInputContainer: null,
    llmQueryInput: null,
    generatePatchButton: null,
    openLlmButton: null,
    closeLlmButton: null,
    llmStatus: null,
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
    this.elements.patchButtonsContainer = document.querySelector(
      '.patch-buttons-container'
    );
    this.elements.llmInputContainer = document.querySelector(
      '.llm-input-container'
    );
    this.elements.llmQueryInput = document.getElementById('llmQueryInput');
    this.elements.generatePatchButton = document.getElementById(
      'generatePatchButton'
    );
    this.elements.openLlmButton = document.getElementById('openLlmButton');
    this.elements.closeLlmButton = document.getElementById('closeLlmButton');
    this.elements.llmStatus = document.getElementById('llmStatus');

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

      // Initialize LLM service
      await LLMService.init();
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
    this.updateCustomPatchButtons();

    // LLM interface handlers
    this.elements.openLlmButton.addEventListener('click', () => {
      this.openLlmInterface();
    });

    this.elements.closeLlmButton.addEventListener('click', () => {
      this.closeLlmInterface();
    });

    this.elements.generatePatchButton.addEventListener('click', () => {
      this.generatePatchFromQuery();
    });

    this.elements.llmQueryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.generatePatchFromQuery();
      }
    });
  },

  openLlmInterface() {
    this.elements.patchPanel.classList.add('input-mode');
    this.elements.patchButtonsContainer.classList.add('hidden');
    this.elements.llmInputContainer.classList.add('visible');
    // Focus after animation completes
    setTimeout(() => {
      this.elements.llmQueryInput.focus();
    }, 300);
  },

  closeLlmInterface() {
    this.elements.patchPanel.classList.remove('input-mode');
    this.elements.patchButtonsContainer.classList.remove('hidden');
    this.elements.llmInputContainer.classList.remove('visible');
    this.elements.llmStatus.textContent = '';
  },

  async generatePatchFromQuery() {
    const query = this.elements.llmQueryInput.value.trim();
    if (!query) {
      this.elements.llmStatus.textContent = 'Please enter a description';
      return;
    }

    this.elements.generatePatchButton.disabled = true;
    this.elements.llmStatus.textContent = 'Generating patch...';

    try {
      let patch;

      // First, try to parse as JSON
      try {
        const jsonPatch = JSON.parse(query);
        // If it parses successfully and has the required structure, use it
        if (jsonPatch && typeof jsonPatch === 'object') {
          patch = jsonPatch;
          console.log('Using provided JSON patch');
        }
      } catch (jsonError) {
        // Not valid JSON, try LLM approach
        console.log('Input is not valid JSON, attempting LLM generation');
        this.elements.llmStatus.textContent = 'Calling LLM...';

        try {
          patch = await LLMService.generatePatch(query);
          console.log('LLM generated patch:', patch);
        } catch (llmError) {
          console.error('LLM generation failed:', llmError);
          this.elements.llmStatus.textContent =
            llmError.message || 'Failed to generate patch';
          return;
        }
      }

      if (PatchManager.addPatch(patch)) {
        const newIndex = PatchManager.getAllPatches().length - 1;
        const loadedPatch = PatchManager.selectPatch(newIndex);

        AudioEngine.applyPatch(loadedPatch);
        Renderer.updateConfigs(
          loadedPatch.visuals || {},
          loadedPatch.audio || AppConfig.audioDefaults
        );

        this.updateCustomPatchButtons();
        this.updatePatchButtons(newIndex);

        this.elements.llmStatus.textContent = `Created: ${patch.name}`;
        setTimeout(() => {
          this.closeLlmInterface();
          this.elements.llmQueryInput.value = '';
        }, 1500);
      } else {
        this.elements.llmStatus.textContent = 'Invalid patch format';
      }
    } catch (error) {
      console.error('Failed to generate patch:', error);
      this.elements.llmStatus.textContent = 'Failed to generate patch';
    } finally {
      this.elements.generatePatchButton.disabled = false;
    }
  },

  updatePatchButtons(activeIndex) {
    // Update built-in patch buttons
    this.elements.patchButtons.forEach((button, index) => {
      button.classList.toggle('active', index === activeIndex);
    });

    // Update custom patch buttons
    const customButtons = document.querySelectorAll('.custom-patch-button');
    customButtons.forEach((button, index) => {
      const customIndex = this.elements.patchButtons.length + index;
      button.classList.toggle('active', customIndex === activeIndex);
    });
  },

  updateCustomPatchButtons() {
    // Remove existing custom patch buttons
    const existingCustomButtons = document.querySelectorAll(
      '.custom-patch-button'
    );
    existingCustomButtons.forEach((button) => button.remove());

    // Get all patches and add buttons for custom ones
    const allPatches = PatchManager.getAllPatches();
    const defaultPatchCount = this.elements.patchButtons.length;

    // Check if we have custom patches
    const hasCustomPatch = allPatches.length > defaultPatchCount;

    // Enable/disable the plus button based on custom patch limit (1)
    this.elements.openLlmButton.disabled = hasCustomPatch;

    // Add custom patch buttons after the default patches and before the LLM button
    if (hasCustomPatch) {
      const patch = allPatches[defaultPatchCount];
      const button = this.createCustomPatchButton(patch, defaultPatchCount);
      this.elements.openLlmButton.parentNode.insertBefore(
        button,
        this.elements.openLlmButton
      );
    }
  },

  createCustomPatchButton(patch, index) {
    const button = document.createElement('button');
    button.className = 'custom-patch-button';
    button.title = patch.name;

    // Create wizard hat SVG
    button.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
        <!-- Wizard hat -->
        <path d="M12 2 L7 20 L17 20 Z"></path>
        <!-- Hat brim -->
        <path d="M4 20 L20 20" stroke-width="3"></path>
        <!-- Star on hat -->
        <path d="M12 8 L11.5 9.5 L10 9.5 L11 10.5 L10.5 12 L12 11 L13.5 12 L13 10.5 L14 9.5 L12.5 9.5 Z" stroke-width="1" fill="currentColor"></path>
      </svg>
    `;

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-patch-button';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.deleteCustomPatch(index);
    };
    button.appendChild(deleteBtn);

    // Add click handler
    button.addEventListener('click', () => {
      const selectedPatch = PatchManager.selectPatch(index);
      if (selectedPatch) {
        AudioEngine.applyPatch(selectedPatch);
        Renderer.updateConfigs(
          selectedPatch.visuals || {},
          selectedPatch.audio || AppConfig.audioDefaults
        );
        this.updatePatchButtons(index);
      }
    });

    return button;
  },

  deleteCustomPatch(index) {
    const currentIndex = PatchManager.currentPatchIndex;
    if (PatchManager.deletePatch(index)) {
      this.updateCustomPatchButtons();

      // If we deleted the current patch, select a new one
      if (currentIndex === index) {
        const newIndex = Math.min(
          currentIndex,
          PatchManager.getAllPatches().length - 1
        );
        const patch = PatchManager.selectPatch(newIndex);
        if (patch) {
          AudioEngine.applyPatch(patch);
          Renderer.updateConfigs(
            patch.visuals || {},
            patch.audio || AppConfig.audioDefaults
          );
        }
      } else if (currentIndex > index) {
        // Adjust the current index if needed
        PatchManager.currentPatchIndex = currentIndex - 1;
      }

      this.updatePatchButtons(PatchManager.currentPatchIndex);

      // Re-enable the plus button after deletion
      this.elements.openLlmButton.disabled = false;
    }
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
