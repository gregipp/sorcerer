// js/visual_effects_manager.js
import { AppConfig } from './config.js';

/**
 * VisualEffectsManager handles the configuration and combination of visual settings
 * from global defaults, global enhancements, and patch-specific overrides.
 */
export const VisualEffectsManager = {
  baseEnhancedVisualsConfig: {},

  /**
   * Initializes the VisualEffectsManager and computes the base enhanced visual configuration.
   * This should be called once when the application starts.
   */
  init() {
    // Create and store the base enhanced visual configuration.
    // This includes global visual tweaks like increased crosshair size
    // and could include default multipliers for ray effects.
    this.baseEnhancedVisualsConfig = {
      ...AppConfig.visuals, // Start with defaults from config.js
      crosshairBaseSize: AppConfig.visuals.crosshairBaseSize * 1.3,
      rayDensityMultiplier:
        (AppConfig.visuals.rayDensityMultiplier || 1.0) * 1.5, // Example: globally increase density
    };
    console.log(
      'VisualEffectsManager: Initialized with base enhanced visuals:',
      this.baseEnhancedVisualsConfig
    );
  },

  /**
   * Gets the initial base enhanced visual configuration.
   * Useful for setting up the Renderer before any specific patch is loaded.
   * @returns {object} The base enhanced visual configuration.
   */
  getBaseEnhancedVisuals() {
    if (Object.keys(this.baseEnhancedVisualsConfig).length === 0) {
      // Ensure init() has been called if accessed before App.init fully runs this.
      this.init();
    }
    return this.baseEnhancedVisualsConfig;
  },

  /**
   * Calculates the effective visual configuration for a given patch.
   * It merges the base enhanced visuals with the patch's specific visual settings.
   * @param {object | null} patch - The patch object, which may or may not have a 'visuals' property.
   * @returns {object} The final, effective visual configuration for the Renderer.
   */
  getEffectiveVisuals(patch) {
    if (Object.keys(this.baseEnhancedVisualsConfig).length === 0) {
      // Fallback in case init wasn't called, though it should be by App.init
      this.init();
    }

    if (patch && patch.visuals) {
      // Merge base enhanced with patch-specific, patch visuals take precedence
      const effectiveVisuals = {
        ...this.baseEnhancedVisualsConfig,
        ...patch.visuals,
      };
      // console.log(`VisualEffectsManager: Effective visuals for patch "${patch.name}":`, effectiveVisuals);
      return effectiveVisuals;
    } else {
      // No patch-specific visuals, use the base enhanced ones
      // console.log("VisualEffectsManager: Using base enhanced visuals (no patch-specific visuals found).");
      return this.baseEnhancedVisualsConfig;
    }
  },
};
