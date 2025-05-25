// patch_manager.js - Manages instrument patches (presets) for SORCERER
import { AppConfig } from './config.js';

/**
 * PatchManager loads and manages instrument patches.
 * Patches are JSON files that define synthesizer settings and visual effects.
 */
export const PatchManager = {
  patches: [], // Array of loaded patches
  currentPatchIndex: 0,

  /**
   * Load all default patches from the patches/ directory
   */
  async loadDefaultPatches() {
    console.log('PatchManager: Loading default patches...');

    // Try to load each default patch
    const loadPromises = AppConfig.defaultPatches.map((filename) =>
      this.loadPatchFromFile(`patches/${filename}`)
    );

    // Wait for all attempts to complete
    const results = await Promise.allSettled(loadPromises);

    // Count successful loads
    const successCount = results.filter((r) => r.status === 'fulfilled').length;

    if (successCount === 0) {
      throw new Error(
        'Failed to load any patches. Check patches/ directory and file permissions.'
      );
    }

    console.log(
      `PatchManager: Loaded ${successCount}/${AppConfig.defaultPatches.length} patches`
    );
  },

  /**
   * Load a single patch from a JSON file
   */
  async loadPatchFromFile(url) {
    try {
      // Fetch with retry logic for resilience
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) break;

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (err) {
          if (attempt === 2) throw err;
        }
      }

      if (!response?.ok) {
        throw new Error(
          `Failed to load ${url}: ${response?.status || 'unknown error'}`
        );
      }

      const patchData = await response.json();

      if (this.validatePatch(patchData)) {
        this.patches.push(patchData);
        console.log(`Loaded patch: ${patchData.name}`);
        return patchData;
      } else {
        console.warn(`Invalid patch structure in ${url}`);
        return null;
      }
    } catch (error) {
      console.error(`Error loading patch from ${url}:`, error);
      return null;
    }
  },

  /**
   * Add a patch from JSON data (e.g., from the LLM input textarea)
   */
  addPatch(patchData) {
    if (!this.validatePatch(patchData)) {
      console.warn('Invalid patch structure:', patchData);
      return false;
    }

    // Ensure unique name
    if (!patchData.name) {
      patchData.name = `Custom Patch ${Date.now()}`;
    }

    this.patches.push(patchData);
    console.log(`Added patch: ${patchData.name}`);
    return true;
  },

  /**
   * Validate that a patch has the required structure
   */
  validatePatch(patch) {
    // Check basic structure
    if (!patch || typeof patch !== 'object') return false;
    if (!patch.name || !patch.audio) return false;

    // Check required audio properties
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

    // Validate oscillator type
    const validOscTypes = ['sine', 'square', 'sawtooth', 'triangle'];
    if (!validOscTypes.includes(patch.audio.oscillatorType)) {
      console.warn(`Invalid oscillator type: ${patch.audio.oscillatorType}`);
      return false;
    }

    return true;
  },

  /**
   * Get the currently selected patch
   */
  getCurrentPatch() {
    if (this.patches.length === 0) {
      throw new Error('No patches loaded');
    }
    return this.patches[this.currentPatchIndex];
  },

  /**
   * Select a patch by index
   */
  selectPatch(index) {
    if (index >= 0 && index < this.patches.length) {
      this.currentPatchIndex = index;
      return this.patches[index];
    }
    return null;
  },

  /**
   * Cycle to the next patch
   */
  selectNextPatch() {
    this.currentPatchIndex = (this.currentPatchIndex + 1) % this.patches.length;
    return this.getCurrentPatch();
  },

  /**
   * Find a patch by name
   */
  getPatchByName(name) {
    return this.patches.find((p) => p.name === name);
  },

  /**
   * Get all loaded patches
   */
  getAllPatches() {
    return this.patches;
  },
};
