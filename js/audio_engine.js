// audio_engine.js - Web Audio synthesis engine for SORCERER
import { AppConfig } from './config.js';

export const AudioEngine = {
  audioCtx: null,
  nodes: {},
  oscillators: [],

  isPlaying: false,
  isArpeggiating: false,
  arpCounter: 0,
  lastArpTime: 0,

  currentSettings: { ...AppConfig.audioDefaults },
  currentArpPattern: null,

  async init() {
    if (this.audioCtx) return;

    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const reverb = await this.createReverb();

      this.nodes = {
        masterGain: this.audioCtx.createGain(),
        envelope: this.audioCtx.createGain(),
        filter: this.audioCtx.createBiquadFilter(),
        reverb: reverb,
        reverbGain: this.audioCtx.createGain(),
        lfo: this.audioCtx.createOscillator(),
        lfoGain: this.audioCtx.createGain(),
      };

      this.nodes.filter.type = 'lowpass';
      this.nodes.filter.frequency.value = this.currentSettings.filterCutoff;
      this.nodes.filter.Q.value = this.currentSettings.filterQ;

      this.nodes.lfo.type = 'sine';
      this.nodes.lfo.frequency.value = this.currentSettings.lfoMinFreq;
      this.nodes.lfoGain.gain.value = 0;

      // Connect audio graph
      this.nodes.masterGain.connect(this.nodes.filter);
      this.nodes.filter.connect(this.nodes.envelope);
      this.nodes.envelope.connect(this.audioCtx.destination);

      // Reverb send
      this.nodes.envelope.connect(this.nodes.reverb);
      this.nodes.reverb.connect(this.nodes.reverbGain);
      this.nodes.reverbGain.connect(this.audioCtx.destination);
      this.nodes.reverbGain.gain.value = 0;

      // LFO
      this.nodes.lfo.connect(this.nodes.lfoGain);
      this.nodes.lfo.start();

      this.nodes.envelope.gain.value = 0;
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

  async createReverb() {
    const duration = 3;
    const decay = 2;
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);

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

  applyPatch(patch) {
    if (!patch?.audio) {
      console.error('Invalid patch data');
      return;
    }

    const needsRebuild =
      this.currentSettings.oscillatorType !== patch.audio.oscillatorType ||
      this.currentSettings.overtoneCount !== patch.audio.overtoneCount;

    this.currentSettings = {
      ...AppConfig.audioDefaults,
      ...patch.audio,
      octaveOffset: patch.octaveOffset || 0,
    };

    this.currentArpPattern = patch.arpeggiator;

    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

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

    this.nodes.lfo.frequency.setTargetAtTime(
      this.currentSettings.lfoMinFreq,
      now,
      0.01
    );

    if (needsRebuild) {
      this.buildOscillators();
    }

    console.log(`Applied patch: ${patch.name}`);
  },

  buildOscillators() {
    if (!this.audioCtx) return;

    this.oscillators.forEach((osc) => {
      try {
        this.nodes.lfoGain.disconnect(osc.oscillator.frequency);
        osc.oscillator.stop();
        osc.oscillator.disconnect();
        osc.gain.disconnect();
      } catch (e) {}
    });
    this.oscillators = [];

    const numOscillators = Math.max(1, this.currentSettings.overtoneCount);

    for (let i = 0; i < numOscillators; i++) {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = this.currentSettings.oscillatorType;
      osc.connect(gain);
      gain.connect(this.nodes.masterGain);
      osc.start();

      this.nodes.lfoGain.connect(osc.frequency);
      gain.gain.value = 0;

      this.oscillators.push({ oscillator: osc, gain });
    }

    console.log(
      `Built ${numOscillators} oscillators of type ${this.currentSettings.oscillatorType}`
    );
  },

  update(leftHandData, rightHandData) {
    if (!this.audioCtx || !this.isPlaying) return;

    const now = this.audioCtx.currentTime;

    let pitchControl = 0.5;
    let reverbControl = 0.5;
    let vibratoControl = 0.5;
    let overtoneControl = 0.5;

    if (leftHandData) {
      pitchControl = leftHandData.y;
      reverbControl = leftHandData.x;
    }

    if (rightHandData) {
      overtoneControl = rightHandData.y;
      vibratoControl = rightHandData.x;
    }

    const octaveRange =
      AppConfig.visuals.endOctave - AppConfig.visuals.startOctave + 1;
    const semitones = (1 - pitchControl) * (octaveRange * 12);
    let frequency =
      this.currentSettings.baseFrequency * Math.pow(2, semitones / 12);

    frequency *= Math.pow(2, this.currentSettings.octaveOffset);

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

    this.nodes.reverbGain.gain.setTargetAtTime(reverbControl * 0.7, now, 0.1);

    const vibratoAmount = 1 - vibratoControl;
    const lfoRate =
      this.currentSettings.lfoMinFreq +
      vibratoAmount * this.currentSettings.lfoMaxFreqMultiplier;
    const lfoDepth = vibratoAmount * this.currentSettings.lfoMaxDepthMultiplier;

    this.nodes.lfo.frequency.setTargetAtTime(lfoRate, now, 0.1);
    this.nodes.lfoGain.gain.setTargetAtTime(lfoDepth, now, 0.1);

    const overtoneIntensity = 1 - overtoneControl;
    const activeOvertones =
      1 +
      Math.floor(overtoneIntensity * (this.currentSettings.overtoneCount - 1));

    this.oscillators.forEach((osc, i) => {
      const harmonic = i + 1;
      osc.oscillator.frequency.setTargetAtTime(frequency * harmonic, now, 0.03);

      const active = i < activeOvertones;
      const gainValue = active ? 0.3 / Math.sqrt(harmonic) : 0;

      osc.gain.gain.setTargetAtTime(gainValue, now, 0.01);
    });
  },

  setEnvelopeState(shouldPlay) {
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    if (shouldPlay && !this.isPlaying) {
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

  setArpeggiatorState(isActive) {
    this.isArpeggiating = isActive;
    if (!isActive) {
      this.arpCounter = 0;
    }
  },

  cleanup() {
    this.oscillators.forEach((osc) => {
      try {
        osc.oscillator.stop();
        osc.oscillator.disconnect();
        osc.gain.disconnect();
      } catch (e) {}
    });
    this.oscillators = [];

    Object.values(this.nodes).forEach((node) => {
      try {
        node.disconnect();
      } catch (e) {}
    });

    if (this.nodes.lfo) {
      try {
        this.nodes.lfo.stop();
      } catch (e) {}
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }

    this.audioCtx = null;
    this.nodes = {};
    this.isPlaying = false;
    this.isArpeggiating = false;
  },
};
