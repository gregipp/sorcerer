// js/audio_engine.js
import { AppConfig } from './config.js'; // Import default configurations

/**
 * AudioEngine manages all Web Audio API related tasks, including sound generation,
 * effects, and applying instrument patch settings.
 */
export const AudioEngine = {
  audioCtx: null,
  masterGain: null,
  envelopeGain: null, // Main amplitude envelope
  reverb: null,
  reverbGain: null,
  lfo: null,
  lfoGain: null,
  lowPassFilter: null,

  oscillators: [], // Stores SynthOscillator instances

  isPlaying: false,
  isArpeggiating: false,
  arpCounter: 0,
  lastArpTime: 0,

  // Stores the current effective audio settings, merged from defaults and the active patch
  currentAudioSettings: { ...AppConfig.audioDefaults },
  currentArpSettings: { ...AppConfig.arpDefaults },

  // Internal class for individual oscillators (fundamental + overtones)
  SynthOscillator: class {
    constructor(audioCtx, destination, type = 'sine') {
      this.audioCtx = audioCtx;
      this.osc = this.audioCtx.createOscillator();
      this.gain = this.audioCtx.createGain();
      this.osc.type = type;

      this.osc.connect(this.gain);
      this.gain.connect(destination);
      this.osc.start();
      this.gain.gain.setValueAtTime(0, this.audioCtx.currentTime); // Start silent
    }

    setFrequency(freq, time) {
      if (freq > 0 && this.osc && this.osc.frequency) {
        this.osc.frequency.setTargetAtTime(freq, time, 0.015); // Smooth pitch transition
      }
    }

    setGain(value, time) {
      if (this.gain && this.gain.gain) {
        this.gain.gain.setTargetAtTime(value, time, 0.01); // Smooth amplitude transition
      }
    }

    setType(type) {
      if (this.osc) {
        this.osc.type = type;
      }
    }

    stop() {
      if (this.osc) {
        this.osc.stop();
        this.osc.disconnect();
      }
      if (this.gain) {
        this.gain.disconnect();
      }
    }
  },

  /**
   * Initializes the AudioContext and main audio nodes.
   * Must be called after a user interaction (e.g., click).
   */
  async init() {
    if (this.audioCtx) return; // Already initialized

    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Master Gain -> Envelope -> Filter -> Destination
      // Reverb is parallel to Filter -> Destination

      this.masterGain = this.audioCtx.createGain();
      this.envelopeGain = this.audioCtx.createGain();
      this.lowPassFilter = this.audioCtx.createBiquadFilter();

      // Configure filter
      this.lowPassFilter.type = 'lowpass';
      this.lowPassFilter.frequency.setValueAtTime(
        this.currentAudioSettings.filterCutoff,
        this.audioCtx.currentTime
      );
      this.lowPassFilter.Q.setValueAtTime(
        this.currentAudioSettings.filterQ,
        this.audioCtx.currentTime
      );

      // Connections
      this.masterGain.connect(this.envelopeGain);
      this.envelopeGain.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.audioCtx.destination);

      // Initialize envelope gain to 0 (silent)
      this.envelopeGain.gain.setValueAtTime(0, this.audioCtx.currentTime);

      // Setup LFO for vibrato/modulation
      this.lfo = this.audioCtx.createOscillator();
      this.lfoGain = this.audioCtx.createGain();
      this.lfo.type = 'sine'; // Standard vibrato LFO type
      this.lfo.frequency.setValueAtTime(
        this.currentAudioSettings.lfoMinFreq,
        this.audioCtx.currentTime
      );
      this.lfoGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // LFO depth, initially zero
      this.lfo.connect(this.lfoGain);
      // LFO gain will be connected to oscillator frequencies when oscillators are built/rebuilt
      this.lfo.start();

      // Setup Reverb
      await this._createReverb();
      if (this.reverb && this.reverbGain) {
        this.envelopeGain.connect(this.reverb); // Send signal from envelope to reverb
        this.reverbGain.gain.setValueAtTime(
          this.currentAudioSettings.reverbMix,
          this.audioCtx.currentTime
        );
      }

      // Initial build of oscillators based on default/current settings
      await this._rebuildOscillators();

      console.log(
        'AudioEngine Initialized. Sample rate:',
        this.audioCtx.sampleRate
      );
    } catch (e) {
      console.error('Error initializing AudioContext:', e);
      // Potentially update UI to inform user audio cannot start
    }
  },

  /**
   * Creates a simple convolution reverb impulse.
   */
  async _createReverb() {
    if (!this.audioCtx) return;
    const duration = 1.5; // Shorter, more typical reverb
    const decay = 1.0;
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        channelData[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    this.reverb = this.audioCtx.createConvolver();
    this.reverb.buffer = impulse;

    this.reverbGain = this.audioCtx.createGain();
    this.reverbGain.connect(this.audioCtx.destination); // Reverb output to destination
  },

  /**
   * Rebuilds oscillators based on currentAudioSettings (overtoneCount, oscillatorType).
   * Connects LFO to new oscillators.
   */
  async _rebuildOscillators() {
    if (!this.audioCtx || !this.masterGain) return;

    // Stop and disconnect old oscillators
    this.oscillators.forEach((oscWrapper) => {
      if (this.lfoGain && oscWrapper.osc && oscWrapper.osc.frequency) {
        try {
          this.lfoGain.disconnect(oscWrapper.osc.frequency);
        } catch (e) {
          /* ignore if already disconnected */
        }
      }
      oscWrapper.stop();
    });
    this.oscillators = [];

    // Create new oscillators
    const numOscillators = Math.max(1, this.currentAudioSettings.overtoneCount); // Ensure at least one oscillator

    for (let i = 0; i < numOscillators; i++) {
      const oscWrapper = new this.SynthOscillator(
        this.audioCtx,
        this.masterGain, // Connect each oscillator's gain to the masterGain
        this.currentAudioSettings.oscillatorType
      );
      this.oscillators.push(oscWrapper);

      // Connect LFO to each oscillator's frequency for vibrato
      if (this.lfoGain && oscWrapper.osc && oscWrapper.osc.frequency) {
        this.lfoGain.connect(oscWrapper.osc.frequency);
      }
    }
    // console.log(`Oscillators rebuilt: ${numOscillators} of type ${this.currentAudioSettings.oscillatorType}`);
  },

  /**
   * Applies settings from a new instrument patch.
   * @param {object} patch - The patch object containing audio settings.
   */
  applyPatch(patch) {
    if (!this.audioCtx) {
      // console.warn("AudioEngine not initialized. Cannot apply patch yet.");
      // Store patch settings to be applied after init, or merge into currentAudioSettings
      this.currentAudioSettings = {
        ...AppConfig.audioDefaults, // Start with global defaults
        ...patch.audio, // Overlay patch-specific audio settings
        octaveOffset:
          patch.octaveOffset !== undefined
            ? patch.octaveOffset
            : AppConfig.audioDefaults.octaveOffset,
      };
      if (patch.arpeggiator) {
        this.currentArpSettings = {
          ...AppConfig.arpDefaults,
          ...patch.arpeggiator,
        };
      } else {
        this.currentArpSettings = { ...AppConfig.arpDefaults };
      }
      return;
    }

    const oldOvertoneCount = this.currentAudioSettings.overtoneCount;
    const oldOscillatorType = this.currentAudioSettings.oscillatorType;

    // Merge patch settings with defaults
    this.currentAudioSettings = {
      ...AppConfig.audioDefaults, // Start with global defaults
      ...patch.audio, // Overlay patch-specific audio settings
      octaveOffset:
        patch.octaveOffset !== undefined
          ? patch.octaveOffset
          : AppConfig.audioDefaults.octaveOffset,
    };

    if (patch.arpeggiator) {
      this.currentArpSettings = {
        ...AppConfig.arpDefaults,
        ...patch.arpeggiator,
      };
    } else {
      this.currentArpSettings = { ...AppConfig.arpDefaults }; // Reset to defaults if patch has no arp
    }

    // Update LFO base frequency
    if (this.lfo && this.lfo.frequency) {
      this.lfo.frequency.setTargetAtTime(
        this.currentAudioSettings.lfoMinFreq,
        this.audioCtx.currentTime,
        0.01
      );
    }

    // Update filter settings
    if (
      this.lowPassFilter &&
      this.lowPassFilter.frequency &&
      this.lowPassFilter.Q
    ) {
      this.lowPassFilter.frequency.setTargetAtTime(
        this.currentAudioSettings.filterCutoff,
        this.audioCtx.currentTime,
        0.02
      );
      this.lowPassFilter.Q.setTargetAtTime(
        this.currentAudioSettings.filterQ,
        this.audioCtx.currentTime,
        0.02
      );
    }

    // Update reverb mix
    if (this.reverbGain && this.reverbGain.gain) {
      this.reverbGain.gain.setTargetAtTime(
        this.currentAudioSettings.reverbMix,
        this.audioCtx.currentTime,
        0.1
      );
    }

    // Rebuild oscillators if count or type changed
    if (
      this.currentAudioSettings.overtoneCount !== oldOvertoneCount ||
      this.currentAudioSettings.oscillatorType !== oldOscillatorType
    ) {
      this._rebuildOscillators();
    } else {
      // If only type changed but not count, just update type on existing oscillators
      this.oscillators.forEach((oscWrapper) =>
        oscWrapper.setType(this.currentAudioSettings.oscillatorType)
      );
    }
    // console.log("Patch applied:", patch.name, this.currentAudioSettings);
  },

  /**
   * Updates audio parameters based on hand input.
   * @param {object | null} leftHandData - { x, y, isFist } or null
   * @param {object | null} rightHandData - { x, y, isFist } or null
   */
  update(leftHandData, rightHandData) {
    if (!this.audioCtx || !this.oscillators.length || !this.isPlaying) return;

    const now = this.audioCtx.currentTime;

    // Default control values if hands are not detected (or to avoid errors)
    let fundamentalControlY = 0.5; // Mid-pitch
    let reverbControlX = this.currentAudioSettings.reverbMix; // Default reverb from patch

    let vibratoControlX = 0.5; // Mid-vibrato rate/depth
    let overtoneControlY = 0.5; // Mid-overtone intensity

    if (leftHandData) {
      // Left Hand: Y for pitch (inverted), X for reverb mix
      fundamentalControlY = leftHandData.y; // Y is 0 (top) to 1 (bottom)
      reverbControlX = leftHandData.x; // X is 0 (left) to 1 (right)
    }
    if (rightHandData) {
      // Right Hand: Y for overtone intensity (inverted), X for LFO (vibrato) rate/depth (inverted)
      overtoneControlY = rightHandData.y; // Y is 0 (top) to 1 (bottom)
      vibratoControlX = rightHandData.x; // X is 0 (left) to 1 (right)
    }

    // --- Pitch Calculation (Left Hand Y) ---
    const totalOctaves =
      AppConfig.visuals.endOctave - AppConfig.visuals.startOctave; // Corrected: was +1
    // (1 - fundamentalControlY) inverts Y-axis: higher on screen = higher pitch
    const semitoneOffset = (1 - fundamentalControlY) * (totalOctaves * 12);
    let pitchMultiplier = Math.pow(2, semitoneOffset / 12);

    // Apply patch-specific octave offset
    if (this.currentAudioSettings.octaveOffset !== undefined) {
      pitchMultiplier *= Math.pow(2, this.currentAudioSettings.octaveOffset);
    }

    // Apply arpeggiator if active
    if (this.isArpeggiating) {
      const currentTimeMs = Date.now();
      if (
        currentTimeMs - this.lastArpTime >=
        this.currentArpSettings.interval
      ) {
        this.arpCounter =
          (this.arpCounter + 1) % this.currentArpSettings.pattern.length;
        this.lastArpTime = currentTimeMs;
      }
      const arpSemitoneShift = this.currentArpSettings.pattern[this.arpCounter];
      pitchMultiplier *= Math.pow(2, arpSemitoneShift / 12);
    }
    const baseFundamentalFreq =
      this.currentAudioSettings.baseFrequency * pitchMultiplier;

    // --- Reverb Mix (Left Hand X) ---
    // reverbControlX (0 to 1) directly maps to reverb gain.
    if (this.reverbGain && this.reverbGain.gain) {
      this.reverbGain.gain.setTargetAtTime(reverbControlX * 0.7, now, 0.1); // Max reverb gain 0.7
    }

    // --- LFO/Vibrato (Right Hand X) ---
    // (1 - vibratoControlX) inverts X: left on screen = lower rate/depth
    const lfoRate =
      this.currentAudioSettings.lfoMinFreq +
      (1 - vibratoControlX) *
        (this.currentAudioSettings.lfoMaxFreqMultiplier - 1) *
        this.currentAudioSettings.lfoMinFreq; // Multiplier is of minFreq
    const lfoDepth =
      (1 - vibratoControlX) * this.currentAudioSettings.lfoMaxDepthMultiplier;
    if (this.lfo && this.lfo.frequency)
      this.lfo.frequency.setTargetAtTime(lfoRate, now, 0.1);
    if (this.lfoGain && this.lfoGain.gain)
      this.lfoGain.gain.setTargetAtTime(lfoDepth, now, 0.1);

    // --- Overtone Intensity/Distribution (Right Hand Y) ---
    // (1 - overtoneControlY) inverts Y: higher on screen = more/brighter overtones
    const overtoneIntensity = 1 - overtoneControlY; // 0 (bottom) to 1 (top)
    const numOscillators = this.oscillators.length;

    this.oscillators.forEach((oscWrapper, i) => {
      const isFundamental = i === 0;
      const overtoneIndex = i; // For harmonic series: 0=fund, 1=2nd harm, etc.

      const freq = baseFundamentalFreq * (overtoneIndex + 1); // Harmonic series

      // Gain calculation:
      // Fundamental is always at full specified relative volume.
      // Overtones fade based on overtoneIntensity and their index.
      let gainValue = 0;
      if (numOscillators <= 1) {
        // Only fundamental
        gainValue = isFundamental ? 0.5 : 0; // Main volume for single oscillator
      } else {
        // For multiple oscillators (fundamental + overtones)
        if (isFundamental) {
          gainValue = 0.5; // Base volume for fundamental
        } else {
          // Higher `overtoneIntensity` makes higher harmonics louder.
          // Falloff factor: higher harmonics are naturally quieter.
          const falloff = 1 / Math.sqrt(overtoneIndex + 1); // Or Math.pow(overtoneIndex + 1, 0.75)
          // Intensity scaling: 0 means only fundamental, 1 means all overtones at their 'natural' falloff.
          gainValue =
            0.5 *
            falloff *
            Math.pow(overtoneIntensity, 0.5 + overtoneIndex * 0.1);
          // Clamp gain to prevent extreme loudness
          gainValue = Math.min(gainValue, 0.5 / numOscillators);
        }
      }
      // Ensure gainValue is not NaN or excessively large
      gainValue = isNaN(gainValue) ? 0 : Math.max(0, Math.min(gainValue, 0.7));

      oscWrapper.setFrequency(freq, now);
      oscWrapper.setGain(gainValue, now);
    });
  },

  /**
   * Controls the main amplitude envelope.
   * @param {boolean} shouldPlay - True to start/sustain sound, false to release.
   */
  setEnvelopeState(shouldPlay) {
    if (!this.audioCtx || !this.envelopeGain || !this.envelopeGain.gain) return;

    const now = this.audioCtx.currentTime;
    if (shouldPlay && !this.isPlaying) {
      // Attack phase
      this.isPlaying = true;
      this.envelopeGain.gain.cancelScheduledValues(now);
      this.envelopeGain.gain.setValueAtTime(this.envelopeGain.gain.value, now); // Start from current value
      this.envelopeGain.gain.linearRampToValueAtTime(
        1,
        now + this.currentAudioSettings.attackTime
      );
    } else if (!shouldPlay && this.isPlaying) {
      // Release phase
      this.isPlaying = false;
      this.envelopeGain.gain.cancelScheduledValues(now);
      this.envelopeGain.gain.setValueAtTime(this.envelopeGain.gain.value, now); // Start from current value
      this.envelopeGain.gain.linearRampToValueAtTime(
        0,
        now + this.currentAudioSettings.releaseTime
      );
    }
  },

  /**
   * Toggles the arpeggiator state.
   * @param {boolean} isActive - True to activate arpeggiator, false to deactivate.
   */
  setArpeggiatorState(isActive) {
    this.isArpeggiating = isActive;
    if (!isActive) {
      this.arpCounter = 0; // Reset arpeggiator position when turned off
    }
    // console.log("Arpeggiator state:", this.isArpeggiating);
  },

  /**
   * Utility to get the current AudioContext time.
   */
  getCurrentTime() {
    return this.audioCtx ? this.audioCtx.currentTime : 0;
  },

  // In audio_engine.js, add a cleanup method:

  cleanup() {
    // Stop all oscillators
    this.oscillators.forEach((oscWrapper) => {
      if (oscWrapper.osc) {
        try {
          oscWrapper.osc.stop();
          oscWrapper.osc.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
      if (oscWrapper.gain) {
        try {
          oscWrapper.gain.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
    });

    // Reset oscillator array
    this.oscillators = [];

    // Disconnect and clean up other audio nodes
    if (this.masterGain) this.masterGain.disconnect();
    if (this.envelopeGain) this.envelopeGain.disconnect();
    if (this.reverb) this.reverb.disconnect();
    if (this.reverbGain) this.reverbGain.disconnect();
    if (this.lfo) {
      this.lfo.stop();
      this.lfo.disconnect();
    }
    if (this.lfoGain) this.lfoGain.disconnect();
    if (this.lowPassFilter) this.lowPassFilter.disconnect();

    // Close audio context
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx
        .close()
        .catch((err) => console.warn('Error closing AudioContext:', err));
    }

    // Reset state
    this.isPlaying = false;
    this.isArpeggiating = false;
  },
};
