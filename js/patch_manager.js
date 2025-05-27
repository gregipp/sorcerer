// patch_manager.js - Manages instrument patches (presets) for SORCERER
import { AppConfig } from './config.js';

export const PatchManager = {
  patches: [],
  currentPatchIndex: 0,
  defaultPatchCount: 0,

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

    this.defaultPatchCount = this.patches.length;
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

  deletePatch(index) {
    // Don't allow deletion of default patches
    if (index < this.defaultPatchCount) {
      console.warn('Cannot delete default patches');
      return false;
    }

    if (index >= 0 && index < this.patches.length) {
      const deletedPatch = this.patches.splice(index, 1)[0];
      console.log(`Deleted patch: ${deletedPatch.name}`);
      return true;
    }
    return false;
  },

  validatePatch(patch) {
    // Basic structure validation
    if (!patch || typeof patch !== 'object') return false;
    if (!patch.name || !patch.audio) return false;

    // Check patchSchemaVersion if present (for LLM-generated patches)
    if (patch.patchSchemaVersion && patch.patchSchemaVersion !== '1.0') {
      console.warn('Invalid patch schema version');
      return false;
    }

    // Validate audio properties
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

    // Validate numeric ranges for audio properties
    const audio = patch.audio;
    if (
      typeof audio.overtoneCount !== 'number' ||
      audio.overtoneCount < 1 ||
      audio.overtoneCount > 20
    ) {
      console.warn('Invalid overtoneCount');
      return false;
    }
    if (
      typeof audio.attackTime !== 'number' ||
      audio.attackTime < 0.01 ||
      audio.attackTime > 5.0
    ) {
      console.warn('Invalid attackTime');
      return false;
    }
    if (
      typeof audio.releaseTime !== 'number' ||
      audio.releaseTime < 0.01 ||
      audio.releaseTime > 5.0
    ) {
      console.warn('Invalid releaseTime');
      return false;
    }

    // Validate optional audio properties if present
    if (
      audio.filterCutoff !== undefined &&
      (typeof audio.filterCutoff !== 'number' ||
        audio.filterCutoff < 200 ||
        audio.filterCutoff > 20000)
    ) {
      console.warn('Invalid filterCutoff');
      return false;
    }
    if (
      audio.filterQ !== undefined &&
      (typeof audio.filterQ !== 'number' ||
        audio.filterQ < 0.1 ||
        audio.filterQ > 10)
    ) {
      console.warn('Invalid filterQ');
      return false;
    }
    if (
      audio.reverbMix !== undefined &&
      (typeof audio.reverbMix !== 'number' ||
        audio.reverbMix < 0 ||
        audio.reverbMix > 1)
    ) {
      console.warn('Invalid reverbMix');
      return false;
    }
    if (
      audio.lfoMinFreq !== undefined &&
      (typeof audio.lfoMinFreq !== 'number' ||
        audio.lfoMinFreq < 0.1 ||
        audio.lfoMinFreq > 10)
    ) {
      console.warn('Invalid lfoMinFreq');
      return false;
    }
    if (
      audio.lfoMaxFreqMultiplier !== undefined &&
      (typeof audio.lfoMaxFreqMultiplier !== 'number' ||
        audio.lfoMaxFreqMultiplier < 1 ||
        audio.lfoMaxFreqMultiplier > 10)
    ) {
      console.warn('Invalid lfoMaxFreqMultiplier');
      return false;
    }
    if (
      audio.lfoMaxDepthMultiplier !== undefined &&
      (typeof audio.lfoMaxDepthMultiplier !== 'number' ||
        audio.lfoMaxDepthMultiplier < 1 ||
        audio.lfoMaxDepthMultiplier > 50)
    ) {
      console.warn('Invalid lfoMaxDepthMultiplier');
      return false;
    }

    // Validate octaveOffset if present
    if (
      patch.octaveOffset !== undefined &&
      (typeof patch.octaveOffset !== 'number' ||
        patch.octaveOffset < -4 ||
        patch.octaveOffset > 4)
    ) {
      console.warn('Invalid octaveOffset');
      return false;
    }

    // Validate arpeggiator if present
    if (patch.arpeggiator) {
      if (typeof patch.arpeggiator !== 'object') {
        console.warn('Invalid arpeggiator structure');
        return false;
      }
      if (
        patch.arpeggiator.interval !== undefined &&
        (typeof patch.arpeggiator.interval !== 'number' ||
          patch.arpeggiator.interval < 50 ||
          patch.arpeggiator.interval > 1000)
      ) {
        console.warn('Invalid arpeggiator interval');
        return false;
      }
      if (
        patch.arpeggiator.pattern !== undefined &&
        !Array.isArray(patch.arpeggiator.pattern)
      ) {
        console.warn('Invalid arpeggiator pattern');
        return false;
      }
    }

    // Validate visuals if present
    if (patch.visuals) {
      if (typeof patch.visuals !== 'object') {
        console.warn('Invalid visuals structure');
        return false;
      }
      if (
        patch.visuals.rayDensityMultiplier !== undefined &&
        (typeof patch.visuals.rayDensityMultiplier !== 'number' ||
          patch.visuals.rayDensityMultiplier < 0.1 ||
          patch.visuals.rayDensityMultiplier > 50)
      ) {
        console.warn('Invalid rayDensityMultiplier');
        return false;
      }
      if (
        patch.visuals.raySpeedMultiplier !== undefined &&
        (typeof patch.visuals.raySpeedMultiplier !== 'number' ||
          patch.visuals.raySpeedMultiplier < 0.1 ||
          patch.visuals.raySpeedMultiplier > 10)
      ) {
        console.warn('Invalid raySpeedMultiplier');
        return false;
      }
      if (
        patch.visuals.crosshairBaseSize !== undefined &&
        (typeof patch.visuals.crosshairBaseSize !== 'number' ||
          patch.visuals.crosshairBaseSize < 100 ||
          patch.visuals.crosshairBaseSize > 300)
      ) {
        console.warn('Invalid crosshairBaseSize');
        return false;
      }
      if (
        patch.visuals.rayColor !== undefined &&
        !patch.visuals.rayColor.match(
          /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/
        )
      ) {
        console.warn('Invalid rayColor format');
        return false;
      }
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
