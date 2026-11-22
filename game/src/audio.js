// All sound is synthesised with WebAudio: no audio files, nothing fetched.
// The game creates the context on the first user gesture (autoplay policy).
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    alarmOn: false,
    alarmNodes: null,
    padNodes: null,
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.startPad();
        return true;
      } catch {
        return false;
      }
    },
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },
    // A quiet two-note drone that keeps the heist tense.
    startPad() {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      gain.connect(this.master);
      const oscA = ctx.createOscillator();
      oscA.type = 'triangle';
      oscA.frequency.value = 55;
      const oscB = ctx.createOscillator();
      oscB.type = 'sine';
      oscB.frequency.value = 82.4;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      oscA.connect(gain);
      oscB.connect(gain);
      oscA.start();
      oscB.start();
      lfo.start();
      this.padNodes = { gain, oscA, oscB, lfo };
    },
    tone(freq, dur, type, vol, when = 0, slideTo = null) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },
    noiseBurst(dur, vol, lowpass) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = ctx.createGain();
      gain.gain.value = vol || 0.25;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
    },
    step(sneak) {
      this.noiseBurst(0.05, sneak ? 0.03 : 0.07, sneak ? 500 : 900);
    },
    pickup() {
      this.tone(660, 0.1, 'sine', 0.22);
      this.tone(880, 0.14, 'sine', 0.22, 0.07);
      this.tone(1320, 0.2, 'sine', 0.16, 0.14);
    },
    target() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, i * 0.08));
    },
    lockTick() {
      this.tone(1400, 0.04, 'square', 0.08);
    },
    lockDone() {
      this.tone(520, 0.12, 'triangle', 0.2);
      this.tone(780, 0.18, 'triangle', 0.2, 0.09);
    },
    spotted() {
      this.tone(220, 0.16, 'square', 0.2, 0, 440);
      this.tone(330, 0.2, 'square', 0.14, 0.1, 660);
    },
    smoke() {
      this.noiseBurst(0.5, 0.3, 600);
    },
    emp() {
      this.tone(1800, 0.35, 'sawtooth', 0.12, 0, 120);
      this.noiseBurst(0.3, 0.15, 3000);
    },
    caught() {
      this.tone(392, 0.25, 'sawtooth', 0.22);
      this.tone(311, 0.3, 'sawtooth', 0.22, 0.18);
      this.tone(233, 0.6, 'sawtooth', 0.22, 0.36);
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, i * 0.11));
    },
    doorOpen() {
      this.tone(180, 0.18, 'triangle', 0.14, 0, 320);
    },
    // Two-tone siren while the alarm is high; call every frame, it manages itself.
    alarmTick(high) {
      if (!this.ctx) return;
      if (high && !this.alarmOn) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 620;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 1.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        lfo.start();
        this.alarmNodes = { osc, lfo, gain };
        this.alarmOn = true;
      } else if (!high && this.alarmOn) {
        const n = this.alarmNodes;
        try { n.osc.stop(); n.lfo.stop(); } catch { /* already stopped */ }
        this.alarmNodes = null;
        this.alarmOn = false;
      }
    },
  };
  return audio;
}
