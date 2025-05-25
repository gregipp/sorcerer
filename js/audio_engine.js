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

      // Create reverb first
      const reverb = await this.createReverb();

      // Create audio nodes
      this.nodes = {
        masterGain: this.audioCtx.createGain(),
        envelope: this.audioCtx.createGain(),
        filter: this.audioCtx.createBiquadFilter(),
        reverb: reverb,
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

      // Connect audio graph - matching original signal flow
      // oscillators -> masterGain -> filter -> envelope -> destination
      this.nodes.masterGain.connect(this.nodes.filter);
      this.nodes.filter.connect(this.nodes.envelope);
      this.nodes.envelope.connect(this.audioCtx.destination);

      // Reverb send (from envelope)
      this.nodes.envelope.connect(this.nodes.reverb);
      this.nodes.reverb.connect(this.nodes.reverbGain);
      this.nodes.reverbGain.connect(this.audioCtx.destination);
      this.nodes.reverbGain.gain.value = 0; // Start with no reverb

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
   * Create a simple reverb using convolution - matching original
   */
  async createReverb() {
    const duration = 3; // seconds
    const decay = 2;
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);

    // Generate reverb impulse response
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
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
    if (!patch || !patch.audio) {
      console.error('Invalid patch data');
      return;
    }

    // Check if we need to rebuild oscillators
    const needsRebuild =
      this.currentSettings.oscillatorType !== patch.audio.oscillatorType ||
      this.currentSettings.overtoneCount !== patch.audio.overtoneCount;

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

    // Update LFO base frequency
    this.nodes.lfo.frequency.setTargetAtTime(
      this.currentSettings.lfoMinFreq,
      now,
      0.01
    );

    // Only rebuild oscillators if necessary
    if (needsRebuild) {
      this.buildOscillators();
    }

    console.log(`Applied patch: ${patch.name}`);
  },

  /**
   * Build oscillators based on current settings
   */
  buildOscillators() {
    if (!this.audioCtx) return;

    // Store current playing state
    const wasPlaying = this.isPlaying;

    // Clean up old oscillators
    this.oscillators.forEach((osc) => {
      try {
        // Disconnect LFO first
        if (this.nodes.lfoGain) {
          try {
            this.nodes.lfoGain.disconnect(osc.oscillator.frequency);
          } catch (e) {
            // Ignore if already disconnected
          }
        }

        // Then stop and disconnect oscillator
        osc.oscillator.stop();
        osc.oscillator.disconnect();
        osc.gain.disconnect();
      } catch (e) {
        console.warn('Error cleaning up oscillator:', e);
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

    console.log(
      `Built ${numOscillators} oscillators of type ${this.currentSettings.oscillatorType}`
    );
  },

  /**
   * Update audio parameters based on hand positions
   */
  update(leftHandData, rightHandData) {
    if (!this.audioCtx || !this.isPlaying) return;

    const now = this.audioCtx.currentTime;

    // Default values when hands not detected
    let pitchControl = 0.5;
    let reverbControl = 0.5;
    let vibratoControl = 0.5;
    let overtoneControl = 0.5;

    if (leftHandData) {
      // Left hand: Y controls pitch, X controls reverb
      pitchControl = leftHandData.y;
      reverbControl = leftHandData.x;
    }

    if (rightHandData) {
      // Right hand: Y controls overtone intensity, X controls vibrato
      overtoneControl = rightHandData.y;
      vibratoControl = rightHandData.x;
    }

    // Calculate base frequency from hand position
    const octaveRange =
      AppConfig.visuals.endOctave - AppConfig.visuals.startOctave + 1;
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

    // Update vibrato (LFO) - inverted X control
    const vibratoAmount = 1 - vibratoControl;
    const lfoRate =
      this.currentSettings.lfoMinFreq +
      vibratoAmount * this.currentSettings.lfoMaxFreqMultiplier;
    const lfoDepth = vibratoAmount * this.currentSettings.lfoMaxDepthMultiplier;

    this.nodes.lfo.frequency.setTargetAtTime(lfoRate, now, 0.1);
    this.nodes.lfoGain.gain.setTargetAtTime(lfoDepth, now, 0.1);

    // Update oscillators (fundamental + overtones)
    const overtoneIntensity = 1 - overtoneControl; // Higher hand = more overtones
    const activeOvertones =
      1 +
      Math.floor(overtoneIntensity * (this.currentSettings.overtoneCount - 1));

    this.oscillators.forEach((osc, i) => {
      // Harmonic series: fundamental, 2x, 3x, 4x, etc.
      const harmonic = i + 1;
      osc.oscillator.frequency.setTargetAtTime(frequency * harmonic, now, 0.03);

      // Calculate gain for this harmonic
      const active = i < activeOvertones;
      const gainValue = active ? 0.3 / Math.sqrt(harmonic) : 0; // Simple harmonic falloff

      osc.gain.gain.setTargetAtTime(gainValue, now, 0.01);
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
