// js/patch_manager.js
import { AppConfig } from './config.js'; // To access default patch list

/**
 * PatchManager handles loading, storing, and providing access to instrument patches
 * defined in JSON format.
 */
export const PatchManager = {
  patches: new Map(), // Stores loaded patches, keyed by patch name or filename
  defaultPatchNames: [...AppConfig.defaultPatches], // From config.js

  /**
   * Loads the default set of patches specified in AppConfig.
   * @returns {Promise<void>} A promise that resolves when all default patches are loaded or attempted.
   */
  async loadDefaultPatches() {
    console.log('PatchManager: Loading default patches...');
    const patchPromises = this.defaultPatchNames.map(
      (patchFilename) =>
        this.loadPatchFromFile(`patches/${patchFilename}`, true) // true to indicate it's a default patch
    );

    await Promise.allSettled(patchPromises); // Wait for all to load or fail

    if (this.patches.size === 0 && this.defaultPatchNames.length > 0) {
      console.warn(
        "PatchManager: No default patches were successfully loaded. Check paths and JSON files in 'patches/' directory."
      );
      // Potentially create a very basic fallback patch here if needed
    } else {
      console.log(`PatchManager: ${this.patches.size} default patches loaded.`);
    }
  },

  /**
   * Loads a single patch from a given URL (path to JSON file).
   * @param {string} patchUrl - The URL/path to the patch JSON file.
   * @param {boolean} isDefault - Internal flag if it's a default patch.
   * @returns {Promise<object|null>} A promise that resolves with the patch object or null on error.
   */
  // In patch_manager.js, improve the loadPatchFromFile method:
  async loadPatchFromFile(patchUrl, isDefault = false) {
    try {
      let response;
      let retries = 0;
      const maxRetries = 2;

      // Add retry logic for more resilient loading
      while (retries <= maxRetries) {
        try {
          response = await fetch(patchUrl, { cache: 'no-cache' }); // Avoid stale caches
          if (response.ok) break;

          retries++;
          console.warn(
            `Retry ${retries}/${maxRetries} for ${patchUrl} - status: ${response.status}`
          );
          // Short delay between retries
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (fetchError) {
          retries++;
          console.warn(
            `Fetch error (retry ${retries}/${maxRetries}) for ${patchUrl}:`,
            fetchError
          );
          // Short delay between retries
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      if (!response || !response.ok) {
        throw new Error(
          `HTTP error ${
            response?.status || 'unknown'
          } while fetching patch: ${patchUrl}`
        );
      }

      const patchData = await response.json();

      if (this._isValidPatch(patchData)) {
        // Use patchData.name as key if available, otherwise fall back to URL/filename
        const key = patchData.name || patchUrl.split('/').pop();
        this.patches.set(key, patchData);
        console.log(`PatchManager: Loaded patch "${key}" from ${patchUrl}`);
        return patchData;
      } else {
        console.warn(
          `PatchManager: Invalid patch data structure in ${patchUrl}.`,
          patchData
        );
        return null;
      }
    } catch (error) {
      console.error(
        `PatchManager: Error loading patch from ${patchUrl}:`,
        error
      );
      return null;
    }
  },

  /**
   * Adds a patch object directly (e.g., from LLM input or dynamically created).
   * @param {object} patchObject - The patch object to add.
   * @param {string} [preferredName] - An optional name to use as the key. If not provided, uses patchObject.name.
   * @returns {boolean} True if the patch was added successfully, false otherwise.
   */
  addPatch(patchObject, preferredName) {
    if (this._isValidPatch(patchObject)) {
      const key =
        preferredName || patchObject.name || `customPatch-${Date.now()}`;
      if (this.patches.has(key) && !preferredName) {
        // If generated name conflicts, create a more unique one
        console.warn(
          `PatchManager: Patch with name "${key}" already exists. Overwriting or consider a unique name.`
        );
      }
      this.patches.set(key, patchObject);
      console.log(`PatchManager: Added/Updated patch "${key}".`);
      return true;
    } else {
      console.warn(
        'PatchManager: Attempted to add invalid patch object.',
        patchObject
      );
      return false;
    }
  },

  /**
   * Retrieves a loaded patch by its key (name or filename).
   * @param {string} key - The key of the patch to retrieve.
   * @returns {object|undefined} The patch object if found, otherwise undefined.
   */
  getPatch(key) {
    return this.patches.get(key);
  },

  /**
   * Gets the first loaded patch, typically used as a fallback or initial patch.
   * @returns {object|undefined} The first patch object or undefined if none are loaded.
   */
  getFirstPatch() {
    if (this.patches.size > 0) {
      // Try to get the first default patch by its configured name first
      if (this.defaultPatchNames.length > 0) {
        const firstDefaultName = this.defaultPatchNames[0].replace(
          'patches/',
          ''
        ); // Assuming defaultPatches in config are filenames
        const firstDefaultPatchKey = Array.from(this.patches.keys()).find((k) =>
          k.includes(firstDefaultName.replace('.json', ''))
        );
        if (firstDefaultPatchKey && this.patches.has(firstDefaultPatchKey)) {
          return this.patches.get(firstDefaultPatchKey);
        }
      }
      // Fallback to the very first entry in the map
      return this.patches.values().next().value;
    }
    return undefined;
  },

  /**
   * Returns an array of all loaded patch objects.
   * @returns {Array<object>} An array of patch objects.
   */
  getAllPatches() {
    return Array.from(this.patches.values());
  },

  /**
   * Returns an array of the names (keys) of all loaded patches.
   * Useful for populating UI selectors.
   * @returns {Array<string>} An array of patch names/keys.
   */
  getPatchNames() {
    return Array.from(this.patches.keys());
  },

  /**
   * Basic validation for the patch object structure.
   * @param {object} patchData - The patch data to validate.
   * @returns {boolean} True if the structure seems valid, false otherwise.
   */
  _isValidPatch(patchData) {
    if (!patchData || typeof patchData !== 'object') return false;
    // Check for essential top-level properties
    if (
      typeof patchData.name !== 'string' ||
      !patchData.audio ||
      typeof patchData.audio !== 'object'
    ) {
      console.warn(
        "Patch Validation: Missing 'name' or 'audio' object.",
        patchData
      );
      return false;
    }
    // Check for essential audio properties
    const audio = patchData.audio;
    if (
      typeof audio.oscillatorType !== 'string' ||
      typeof audio.overtoneCount !== 'number' ||
      typeof audio.attackTime !== 'number' ||
      typeof audio.releaseTime !== 'number'
    ) {
      console.warn(
        'Patch Validation: Missing essential audio properties (oscillatorType, overtoneCount, attackTime, releaseTime).',
        audio
      );
      return false;
    }
    // Add more checks as needed (e.g., for LFO, filter, ranges of values)
    return true;
  },
};
