// js/config.js

/**
 * Global configuration for the SORCERER application.
 * These settings provide defaults for audio synthesis and visual rendering.
 * Specific instrument patches can override parts of this configuration.
 */
export const AppConfig = {
  // Audio Engine Defaults
  audioDefaults: {
    oscillatorType: 'sine', // Default waveform: 'sine', 'square', 'sawtooth', 'triangle'
    attackTime: 0.5, // Seconds for envelope attack
    releaseTime: 0.8, // Seconds for envelope release
    overtoneCount: 7, // Number of overtones/partials for additive synthesis
    baseFrequency: 261.63, // C4 - Fundamental frequency reference
    lfoMinFreq: 1, // Minimum LFO frequency (Hz) for vibrato/modulation
    lfoMaxFreqMultiplier: 4, // Multiplier for LFO freq range (hand-controlled)
    lfoMaxDepthMultiplier: 20, // Multiplier for LFO depth range (hand-controlled)
    filterCutoff: 20000, // Default filter cutoff (Hz), high to be effectively off
    filterQ: 1, // Default filter Q (resonance)
    reverbMix: 0.3, // Default reverb mix (0 to 1)
    octaveOffset: 0, // Default global octave offset
  },

  // Arpeggiator Defaults (can be overridden by patches)
  arpDefaults: {
    interval: 200, // Milliseconds for arpeggiator step
    pattern: [-12, -8, -5, 0, 4, 7, 12, 7, 4, 0, -5, -8], // Semitones from root
  },

  // Visual Configuration
  visuals: {
    crosshairBaseSize: 150,
    crosshairFontSize: 18,
    pitchMarkerFontSize: 12,
    startOctave: 2,
    endOctave: 4,
    rayDensityMultiplier: 1.0, // Default density
    raySpeedMultiplier: 1.0, // Default speed
    rayColor: 'rgba(255, 255, 255, 0.7)', // Default ray color
  },
  // Hand Input & Gesture Configuration
  handInput: {
    gestureCooldown: 500, // Milliseconds cooldown for patch switch gesture
  },

  // UI & Interaction
  ui: {
    noHandsMessageDelay: 1000, // Milliseconds before showing "no hands" message
    messageFadeInDuration: 1.0, // Seconds for the "no hands" message to fade in
  },

  // Default patch file names to load on startup
  // These should correspond to files in the 'patches/' directory
  defaultPatches: [
    'classic_theremin.json',
    'bright_saw_lead.json',
    'brutal_brass_bass.json',
  ],

  debug: {
    enabled: false, // Master toggle for debug mode
    showFPS: false, // Show framerate on screen
    logPerformance: false, // Log slow frames to console
    slowFrameThreshold: 16.6, // Threshold for slow frame warnings (ms)
  },
};
