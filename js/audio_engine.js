// audio_engine.js - Web Audio synthesis engine for SORCERER
import { AppConfig } from './config.js';

/**
 * AudioEngine manages all sound generation using the Web Audio API.
 * It creates oscillators, applies effects, and responds to hand movements.
 */
export const AudioEngine = {
  audioCtx: null,
  nodes: {}, // Audio graph nodes
  oscillators: [], // Active oscillator instances

  isPlaying: false,
  isArpeggiating: false,
  arpCounter: 0,
  lastArpTime: 0,

  // Current settings (merged from defaults and active patch)
  currentSettings: { ...AppConfig.audioDefaults },
  currentArpPattern: null,

  /**
   * Initialize the audio context and create the audio graph
   */
  async init() {
    if (this.audioCtx) return;

    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Create audio nodes
      this.nodes = {
        masterGain: this.audioCtx.createGain(),
        envelope: this.audioCtx.createGain(),
        filter: this.audioCtx.createBiquadFilter(),
        reverb: await this.createReverb(),
        reverbGain: this.audioCtx.createGain(),
        lfo: this.audioCtx.createOscillator(),
        lfoGain: this.audioCtx.createGain(),
      };

      // Configure filter
      this.nodes.filter.type = 'lowpass';
      this.nodes.filter.frequency.value = this.currentSettings.filterCutoff;
      this.nodes.filter.Q.value = this.currentSettings.filterQ;

      // Configure LFO (Low Frequency Oscillator for vibrato effect)
      this.nodes.lfo.type = 'sine';
      this.nodes.lfo.frequency.value = this.currentSettings.lfoMinFreq;
      this.nodes.lfoGain.gain.value = 0; // Start with no vibrato

      // Connect audio graph
      // Main signal path: oscillators -> master -> envelope -> filter -> output
      this.nodes.masterGain.connect(this.nodes.envelope);
      this.nodes.envelope.connect(this.nodes.filter);
      this.nodes.filter.connect(this.audioCtx.destination);

      // Reverb (parallel to main output)
      this.nodes.envelope.connect(this.nodes.reverb);
      this.nodes.reverb.connect(this.nodes.reverbGain);
      this.nodes.reverbGain.connect(this.audioCtx.destination);
      this.nodes.reverbGain.gain.value = this.currentSettings.reverbMix;

      // LFO setup
      this.nodes.lfo.connect(this.nodes.lfoGain);
      this.nodes.lfo.start();

      // Initialize envelope at zero (silent)
      this.nodes.envelope.gain.value = 0;

      // Build initial oscillators
      this.buildOscillators();

      console.log(
        'AudioEngine initialized. Sample rate:',
        this.audioCtx.sampleRate
      );
    } catch (e) {
      console.error('Failed to initialize audio:', e);
      throw new Error(
        'Could not start audio system. Please check browser compatibility.'
      );
    }
  },

  /**
   * Create a simple reverb using convolution
   */
  async createReverb() {
    const duration = 1.5; // seconds
    const decay = 1.0;
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);

    // Generate reverb impulse response
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Random noise that decays over time
        channelData[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    const reverb = this.audioCtx.createConvolver();
    reverb.buffer = impulse;
    return reverb;
  },

  /**
   * Apply settings from a patch
   */
  applyPatch(patch) {
    // Merge patch audio settings with defaults
    this.currentSettings = {
      ...AppConfig.audioDefaults,
      ...patch.audio,
      octaveOffset: patch.octaveOffset || 0,
    };

    // Store arpeggiator pattern if present
    this.currentArpPattern = patch.arpeggiator;

    if (!this.audioCtx) return; // Not initialized yet

    const now = this.audioCtx.currentTime;

    // Update filter
    this.nodes.filter.frequency.setTargetAtTime(
      this.currentSettings.filterCutoff,
      now,
      0.02
    );
    this.nodes.filter.Q.setTargetAtTime(
      this.currentSettings.filterQ,
      now,
      0.02
    );

    // Update reverb
    this.nodes.reverbGain.gain.setTargetAtTime(
      this.currentSettings.reverbMix,
      now,
      0.1
    );

    // Update LFO base frequency
    this.nodes.lfo.frequency.setTargetAtTime(
      this.currentSettings.lfoMinFreq,
      now,
      0.01
    );

    // build oscillators if type or count changed
    this.buildOscillators();
  },

  /**
   * build oscillators based on current settings
   */
  buildOscillators() {
    if (!this.audioCtx) return;

    // Clean up old oscillators
    this.oscillators.forEach((osc) => {
      osc.oscillator.stop();
      osc.oscillator.disconnect();
      osc.gain.disconnect();
      if (this.nodes.lfoGain) {
        try {
          this.nodes.lfoGain.disconnect(osc.oscillator.frequency);
        } catch (e) {}
      }
    });
    this.oscillators = [];

    // Create new oscillators for additive synthesis
    const numOscillators = Math.max(1, this.currentSettings.overtoneCount);

    for (let i = 0; i < numOscillators; i++) {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = this.currentSettings.oscillatorType;
      osc.connect(gain);
      gain.connect(this.nodes.masterGain);
      osc.start();

      // Connect LFO to each oscillator for vibrato
      this.nodes.lfoGain.connect(osc.frequency);

      // Start silent
      gain.gain.value = 0;

      this.oscillators.push({ oscillator: osc, gain });
    }
  },

  /**
   * Update audio parameters based on hand positions
   */
  update(leftHandData, rightHandData) {
    if (!this.audioCtx || !this.isPlaying) return;

    const now = this.audioCtx.currentTime;

    // Default values when hands not detected
    let pitchControl = 0.5;
    let reverbControl = this.currentSettings.reverbMix;
    let vibratoControl = 0.5;
    let overtoneControl = 0.5;

    if (leftHandData) {
      // Left hand: Y controls pitch (inverted - higher hand = higher pitch)
      // X controls reverb amount
      pitchControl = leftHandData.y;
      reverbControl = leftHandData.x;
    }

    if (rightHandData) {
      // Right hand: Y controls overtone intensity (inverted)
      // X controls vibrato rate/depth (inverted - left = less, right = more)
      overtoneControl = rightHandData.y;
      vibratoControl = rightHandData.x;
    }

    // Calculate base frequency from hand position
    const octaveRange =
      AppConfig.visuals.endOctave - AppConfig.visuals.startOctave;
    const semitones = (1 - pitchControl) * (octaveRange * 12);
    let frequency =
      this.currentSettings.baseFrequency * Math.pow(2, semitones / 12);

    // Apply octave offset from patch
    frequency *= Math.pow(2, this.currentSettings.octaveOffset);

    // Apply arpeggiator if active
    if (this.isArpeggiating && this.currentArpPattern) {
      const currentTime = Date.now();
      if (currentTime - this.lastArpTime >= this.currentArpPattern.interval) {
        this.arpCounter =
          (this.arpCounter + 1) % this.currentArpPattern.pattern.length;
        this.lastArpTime = currentTime;
      }
      const arpSemitones = this.currentArpPattern.pattern[this.arpCounter];
      frequency *= Math.pow(2, arpSemitones / 12);
    }

    // Update reverb mix (0 to 0.7 range)
    this.nodes.reverbGain.gain.setTargetAtTime(reverbControl * 0.7, now, 0.1);

    // Update vibrato (LFO)
    const lfoRate =
      this.currentSettings.lfoMinFreq +
      (1 - vibratoControl) *
        (this.currentSettings.lfoMaxFreqMultiplier - 1) *
        this.currentSettings.lfoMinFreq;
    const lfoDepth =
      (1 - vibratoControl) * this.currentSettings.lfoMaxDepthMultiplier;

    this.nodes.lfo.frequency.setTargetAtTime(lfoRate, now, 0.1);
    this.nodes.lfoGain.gain.setTargetAtTime(lfoDepth, now, 0.1);

    // Update oscillators (fundamental + overtones)
    const overtoneIntensity = 1 - overtoneControl; // Higher hand = more overtones

    this.oscillators.forEach((osc, i) => {
      // Harmonic series: fundamental, 2x, 3x, 4x, etc.
      const harmonic = i + 1;
      osc.oscillator.frequency.setTargetAtTime(
        frequency * harmonic,
        now,
        0.015
      );

      // Calculate gain for this harmonic
      let gain = 0;
      if (i === 0) {
        // Fundamental always plays
        gain = 0.5;
      } else {
        // Higher harmonics fade based on hand position and harmonic number
        const falloff = 1 / Math.sqrt(harmonic);
        gain = 0.5 * falloff * Math.pow(overtoneIntensity, 0.5 + i * 0.1);
        gain = Math.min(gain, 0.5 / this.oscillators.length); // Prevent clipping
      }

      osc.gain.gain.setTargetAtTime(gain, now, 0.01);
    });
  },

  /**
   * Control the main envelope (start/stop sound)
   */
  setEnvelopeState(shouldPlay) {
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    if (shouldPlay && !this.isPlaying) {
      // Attack phase
      this.isPlaying = true;
      this.nodes.envelope.gain.cancelScheduledValues(now);
      this.nodes.envelope.gain.setValueAtTime(
        this.nodes.envelope.gain.value,
        now
      );
      this.nodes.envelope.gain.linearRampToValueAtTime(
        1,
        now + this.currentSettings.attackTime
      );
    } else if (!shouldPlay && this.isPlaying) {
      // Release phase
      this.isPlaying = false;
      this.nodes.envelope.gain.cancelScheduledValues(now);
      this.nodes.envelope.gain.setValueAtTime(
        this.nodes.envelope.gain.value,
        now
      );
      this.nodes.envelope.gain.linearRampToValueAtTime(
        0,
        now + this.currentSettings.releaseTime
      );
    }
  },

  /**
   * Toggle arpeggiator on/off
   */
  setArpeggiatorState(isActive) {
    this.isArpeggiating = isActive;
    if (!isActive) {
      this.arpCounter = 0;
    }
  },

  /**
   * Clean up audio resources
   */
  cleanup() {
    // Stop all oscillators
    this.oscillators.forEach((osc) => {
      try {
        osc.oscillator.stop();
        osc.oscillator.disconnect();
        osc.gain.disconnect();
      } catch (e) {}
    });
    this.oscillators = [];

    // Disconnect nodes
    Object.values(this.nodes).forEach((node) => {
      try {
        node.disconnect();
      } catch (e) {}
    });

    // Stop LFO
    if (this.nodes.lfo) {
      try {
        this.nodes.lfo.stop();
      } catch (e) {}
    }

    // Close context
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx
        .close()
        .catch((err) => console.warn('Error closing audio context:', err));
    }

    // Reset state
    this.audioCtx = null;
    this.nodes = {};
    this.isPlaying = false;
    this.isArpeggiating = false;
  },
};
