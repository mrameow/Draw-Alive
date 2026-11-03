/* Draw Alive – tiny sound effects made with Web Audio (no sound files needed). */
(function () {
  'use strict';
  const DA = window.DA;
  let ac = null;
  let enabled = false;

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  function tone(freq, endFreq, dur, type, vol, delay) {
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    pop: () => tone(520, 900, 0.09, 'sine', 0.16),
    boing: () => { tone(220, 520, 0.18, 'triangle', 0.2); tone(520, 300, 0.2, 'triangle', 0.12, 0.16); },
    magic: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, null, 0.22, 'sine', 0.12, i * 0.07)),
    whoosh: () => tone(900, 140, 0.32, 'sawtooth', 0.06),
    yay: () => [392, 523, 659].forEach((f, i) => tone(f, f * 1.01, 0.3, 'square', 0.05, i * 0.1)),
    nope: () => tone(220, 160, 0.25, 'square', 0.06)
  };

  DA.Sound = {
    setEnabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    play(name) {
      if (!enabled || !SOUNDS[name]) return;
      try { SOUNDS[name](); } catch (e) { /* audio not available */ }
    }
  };
})();
