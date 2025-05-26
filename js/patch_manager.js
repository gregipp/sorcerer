// patch_manager.js - Manages instrument patches (presets) for SORCERER
import { AppConfig } from './config.js';

export const PatchManager = {
  patches: [],
  currentPatchIndex: 0,

  async loadDefaultPatches() {
    console.log('PatchManager: Loading patches...');

    // Always look for embedded patches
    const embeddedPatches = document.querySelectorAll(
      'script[type="application/json"][data-patch]'
    );

    if (embeddedPatches.length > 0) {
      embeddedPatches.forEach((scriptTag) => {
        try {
          const patchData = JSON.parse(scriptTag.textContent);
          if (this.validatePatch(patchData)) {
            this.patches.push(patchData);
            console.log(`Loaded patch: ${patchData.name}`);
          }
        } catch (error) {
          console.error('Failed to parse embedded patch:', error);
        }
      });
    }

    // In dev mode, also try loading from files
    if (this.patches.length === 0 && import.meta.env.DEV) {
      for (const filename of AppConfig.defaultPatches) {
        try {
          const response = await fetch(`patches/${filename}`);
          if (response.ok) {
            const patchData = await response.json();
            if (this.validatePatch(patchData)) {
              this.patches.push(patchData);
              console.log(`Loaded patch: ${patchData.name}`);
            }
          }
        } catch (error) {
          console.error(`Error loading patch ${filename}:`, error);
        }
      }
    }

    if (this.patches.length === 0) {
      throw new Error('Failed to load any patches');
    }

    console.log(`PatchManager: Loaded ${this.patches.length} patches`);
  },

  addPatch(patchData) {
    if (!this.validatePatch(patchData)) {
      console.warn('Invalid patch structure:', patchData);
      return false;
    }

    if (!patchData.name) {
      patchData.name = `Custom Patch ${Date.now()}`;
    }

    this.patches.push(patchData);
    console.log(`Added patch: ${patchData.name}`);
    return true;
  },

  validatePatch(patch) {
    if (!patch?.name || !patch?.audio) return false;

    const requiredAudioProps = [
      'oscillatorType',
      'overtoneCount',
      'attackTime',
      'releaseTime',
    ];

    const hasRequiredProps = requiredAudioProps.every(
      (prop) => patch.audio[prop] !== undefined
    );

    if (!hasRequiredProps) {
      console.warn('Patch missing required audio properties');
      return false;
    }

    const validOscTypes = ['sine', 'square', 'sawtooth', 'triangle'];
    if (!validOscTypes.includes(patch.audio.oscillatorType)) {
      console.warn(`Invalid oscillator type: ${patch.audio.oscillatorType}`);
      return false;
    }

    return true;
  },

  getCurrentPatch() {
    if (this.patches.length === 0) {
      throw new Error('No patches loaded');
    }
    return this.patches[this.currentPatchIndex];
  },

  selectPatch(index) {
    if (index >= 0 && index < this.patches.length) {
      this.currentPatchIndex = index;
      return this.patches[index];
    }
    return null;
  },

  selectNextPatch() {
    this.currentPatchIndex = (this.currentPatchIndex + 1) % this.patches.length;
    return this.getCurrentPatch();
  },

  getAllPatches() {
    return this.patches;
  },
};
