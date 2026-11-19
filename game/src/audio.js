// All sound is synthesised with WebAudio — no audio files, nothing to load. Short noise and
// oscillator blips cover shots, hits, crashes, doors, alarms and the little jingles; a soft
// two-tone siren fades with the nearest police car. The context starts on the first user
// gesture (a menu click), as browsers require, and M toggles mute.

export const Sound = {
  ctx: null,
  master: null,
  muted: false,
  sirenOsc: null,
  sirenGain: null,
  sirenFlip: 0,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  },

  shot() {
    this.noise(0.11, 0.5, 2600);
    this.tone(150, 0.09, 'square', 0.25, 60);
  },

  enemyShot() {
    this.noise(0.09, 0.28, 2000);
    this.tone(130, 0.08, 'square', 0.15, 55);
  },

  dryFire() {
    this.tone(900, 0.04, 'square', 0.12);
  },

  reload() {
    this.tone(500, 0.05, 'square', 0.15);
    this.tone(700, 0.05, 'square', 0.15, null, 0.12);
  },

  hit() {
    this.noise(0.08, 0.35, 700);
  },

  hurt() {
    this.tone(220, 0.14, 'sawtooth', 0.25, 110);
  },

  crash(big = false) {
    this.noise(big ? 0.32 : 0.16, big ? 0.55 : 0.32, 500);
    this.tone(90, 0.2, 'triangle', 0.3, 40);
  },

  door() {
    this.tone(180, 0.07, 'triangle', 0.25, 90);
    this.noise(0.05, 0.12, 900, 0.02);
  },

  alarm() {
    for (let i = 0; i < 3; i++) {
      this.tone(1180, 0.11, 'square', 0.16, null, i * 0.24);
      this.tone(880, 0.11, 'square', 0.16, null, i * 0.24 + 0.12);
    }
  },

  cash() {
    this.tone(1320, 0.07, 'square', 0.18);
    this.tone(1760, 0.12, 'square', 0.18, null, 0.07);
  },

  pickup() {
    this.tone(660, 0.08, 'triangle', 0.25);
    this.tone(990, 0.1, 'triangle', 0.25, null, 0.08);
  },

  missionStart() {
    this.tone(523, 0.12, 'triangle', 0.22);
    this.tone(659, 0.12, 'triangle', 0.22, null, 0.11);
    this.tone(784, 0.2, 'triangle', 0.22, null, 0.22);
  },

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.16, 'triangle', 0.24, null, i * 0.1));
  },

  missionFail() {
    this.tone(392, 0.18, 'triangle', 0.22);
    this.tone(330, 0.18, 'triangle', 0.22, null, 0.16);
    this.tone(262, 0.3, 'triangle', 0.22, null, 0.32);
  },

  busted() {
    this.tone(740, 0.14, 'square', 0.2);
    this.tone(554, 0.14, 'square', 0.2, null, 0.15);
    this.tone(440, 0.34, 'square', 0.2, null, 0.3);
  },

  // A continuous siren whose volume the main loop sets from the nearest police car.
  setSiren(level) {
    if (!this.ctx) return;
    if (level > 0.02 && !this.muted) {
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain).connect(this.master);
        this.sirenOsc.start();
      }
      this.sirenFlip += 0.06;
      const high = Math.sin(this.sirenFlip) > 0;
      this.sirenOsc.frequency.value = high ? 960 : 720;
      this.sirenGain.gain.value = level * 0.12;
    } else if (this.sirenGain) {
      this.sirenGain.gain.value = 0;
    }
  },
};
