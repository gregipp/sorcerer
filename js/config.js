// config.js - Global configuration for SORCERER
export const AppConfig = {
  // Audio synthesis defaults
  audioDefaults: {
    baseFrequency: 261.63, // C4 reference pitch
    oscillatorType: 'sine', // sine, square, sawtooth, triangle
    overtoneCount: 7, // Number of harmonics for additive synthesis
    octaveOffset: 0, // Global pitch shift in octaves

    // Envelope
    attackTime: 0.5, // Seconds to reach full volume
    releaseTime: 0.8, // Seconds to fade to silence

    // Filter
    filterCutoff: 20000, // Hz - high value = effectively bypassed
    filterQ: 1, // Resonance/emphasis at cutoff

    // Effects
    reverbMix: 0.3, // 0-1 reverb wet/dry mix
    lfoMinFreq: 1, // Hz - base vibrato rate
    lfoMaxFreqMultiplier: 4, // Maximum LFO rate multiplier
    lfoMaxDepthMultiplier: 20, // Maximum vibrato depth
  },

  // Visual rendering
  visuals: {
    // Pitch display range
    startOctave: 2,
    endOctave: 4,

    // Crosshair sizing
    crosshairBaseSize: 150, // Base size in pixels
    crosshairFontSize: 18, // Text label font size
    pitchMarkerFontSize: 12, // Note marker font size

    // Ray effects
    rayDensityMultiplier: 1.0, // Ray spawn rate multiplier
    raySpeedMultiplier: 1.0, // Ray movement speed multiplier
    rayColor: 'rgba(255, 255, 255, 0.7)', // Default ray color
  },

  // User interface
  ui: {
    gestureCooldown: 500, // ms between patch switch gestures
    noHandsMessageDelay: 1000, // ms before showing "no hands" message
    messageFadeInDuration: 1.0, // seconds for message fade-in
  },

  // Default patch files to load on startup
  defaultPatches: [
    'classic_theremin.json',
    'bright_saw_lead.json',
    'brutal_brass_bass.json',
  ],
};
