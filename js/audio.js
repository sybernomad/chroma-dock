/*
 * Chroma Dock sound. Everything is synthesized in the browser: no audio files to ship, load or license.
 *
 *   master ─ compressor ─ speakers
 *     ├── sfx bus     (slides, soft thuds, marimba notes when blocks dock, bells)
 *     ├── music bus   (a slow generative piece: warm pad chords, a soft bass, sparse plucks and bells)
 *     └── reverb      (a generated room impulse), fed by both
 *
 * "Sound effects" and "Music" in Settings switch the two buses on and off.
 * Nothing starts until the first tap, because browsers block sound before that.
 */
(function () {
  'use strict';
  var ctx = null, master = null, sfxBus = null, musBus = null, verbIn = null, noiseBuf = null, brownBuf = null;
  var sfxOn = true, musicOn = true;
  var musTimer = null, musStep = 0, musNext = 0, keyShift = 0, calm = false;

  function impulse(seconds, decay) {
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  function build() {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    var verb = ctx.createConvolver(); verb.buffer = impulse(2.6, 2.6);
    verbIn = ctx.createGain(); verbIn.gain.value = 0.32; verbIn.connect(verb); verb.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0; musBus.connect(master);
    var n = ctx.sampleRate * 2, i;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); var w = noiseBuf.getChannelData(0); for (i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, n, ctx.sampleRate); var b = brownBuf.getChannelData(0), last = 0;
    for (i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    return true;
  }
  function ensure() {
    try { if (!ctx && !build()) return null; if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); } catch (e) { return null; }
    return ctx;
  }
  function out(bus, wet) {
    var g = ctx.createGain(); g.connect(bus || sfxBus);
    if (wet) { var send = ctx.createGain(); send.gain.value = wet; g.connect(send); send.connect(verbIn); }
    return g;
  }
  // One oscillator with a quick attack and an exponential tail.
  function tone(o) {
    var t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.2, osc = ctx.createOscillator();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.freq, t);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    var g = out(o.bus, o.wet), peak = o.gain == null ? 0.08 : o.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (o.attack || 0.006));
    if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + (o.attack || 0.006) + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); osc.start(t); osc.stop(t + dur + 0.05);
  }
  // Filtered noise: slides, soft thuds, air.
  function noise(o) {
    var t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.2, src = ctx.createBufferSource();
    src.buffer = o.brown ? brownBuf : noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    f.Q.value = o.q == null ? 0.8 : o.q;
    var g = out(o.bus, o.wet), peak = o.gain == null ? 0.1 : o.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  // A struck bell: a few inharmonic partials ringing down at different speeds.
  function bell(freq, o) {
    o = o || {}; var g = o.gain == null ? 0.05 : o.gain;
    [[1, 1, 1.4], [2.76, 0.42, 0.7], [5.4, 0.2, 0.35], [8.9, 0.08, 0.2]].forEach(function (p) {
      tone({ freq: freq * p[0], gain: g * p[1], dur: (o.dur || 1.2) * p[2], at: o.at, wet: o.wet == null ? 0.5 : o.wet, attack: 0.002, bus: o.bus });
    });
  }
  function marimba(freq, o) {
    o = o || {}; var g = o.gain || 0.09;
    tone({ freq: freq, gain: g, dur: o.dur || 0.6, at: o.at, attack: 0.002, wet: 0.35, bus: o.bus });
    tone({ freq: freq * 4, gain: g * 0.18, dur: 0.09, at: o.at, attack: 0.001, bus: o.bus });
    tone({ freq: freq * 2, type: 'triangle', gain: g * 0.12, dur: 0.25, at: o.at, attack: 0.002, wet: 0.3, bus: o.bus });
  }
  function pluck(freq, o) {
    o = o || {}; var g = o.gain || 0.03;
    tone({ freq: freq, type: 'triangle', gain: g, dur: o.dur || 2.4, at: o.at, attack: 0.004, bus: o.bus, wet: 0.7 });
    tone({ freq: freq * 2, gain: g * 0.35, dur: (o.dur || 2.4) * 0.5, at: o.at, attack: 0.003, bus: o.bus, wet: 0.7 });
  }
  function NOTE(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // ----- Sound effects -----
  // Docking notes climb a major pentatonic scale, one step per block cleared in the level.
  var DOCK = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
  var S = {
    slide: function (dist) {
      var d = Math.min(0.12 + (dist || 1) * 0.045, 0.42);
      noise({ filter: 'bandpass', freq: 380, sweepTo: 1500, q: 0.9, gain: 0.055, dur: d, attack: d * 0.35 });
    },
    bump: function () {
      tone({ freq: 132, glideTo: 62, gain: 0.16, dur: 0.16 });
      noise({ filter: 'lowpass', freq: 700, brown: true, gain: 0.1, dur: 0.09, wet: 0.1 });
    },
    exit: function (step) {
      var n = DOCK[Math.min(step || 0, DOCK.length - 1)] + keyShift;
      marimba(NOTE(n), { gain: 0.11 }); bell(NOTE(n + 12), { gain: 0.022, dur: 1.4, at: 0.03 });
      noise({ filter: 'bandpass', freq: 900, sweepTo: 3600, q: 1.4, gain: 0.035, dur: 0.22, attack: 0.08, wet: 0.3 });
    },
    lift: function () {
      tone({ freq: 196, glideTo: 246, type: 'triangle', gain: 0.03, dur: 0.16, attack: 0.03 });
      noise({ filter: 'highpass', freq: 5200, gain: 0.012, dur: 0.03, at: 0.15 });
    },
    spawn: function () { marimba(NOTE(55 + keyShift), { gain: 0.06, dur: 0.3 }); tone({ freq: 220, glideTo: 520, gain: 0.03, dur: 0.14 }); },
    click: function () { tone({ freq: 1700, gain: 0.02, dur: 0.035 }); noise({ filter: 'highpass', freq: 4200, gain: 0.02, dur: 0.02 }); },
    undo: function () { noise({ filter: 'bandpass', freq: 1400, sweepTo: 420, q: 1, gain: 0.05, dur: 0.16, attack: 0.03 }); },
    coin: function () { bell(NOTE(88), { gain: 0.03, dur: 0.9 }); bell(NOTE(93), { gain: 0.03, dur: 1.1, at: 0.09 }); },
    gem: function (i) { bell(NOTE(84 + [0, 2, 4, 7, 9][(i || 0) % 5]), { gain: 0.016, dur: 0.6, wet: 0.3 }); },
    star: function (i) { bell(NOTE(76 + [0, 4, 7][(i || 0) % 3] + keyShift), { gain: 0.04, dur: 1.5 }); },
    win: function () {
      [60, 64, 67, 72].forEach(function (n, i) { marimba(NOTE(n + keyShift), { gain: 0.08, at: i * 0.1 }); });
      [48, 55, 64].forEach(function (n) { tone({ freq: NOTE(n + keyShift), type: 'triangle', gain: 0.03, dur: 2.6, at: 0.3, attack: 0.5, wet: 0.6 }); });
    },
    unlock: function () {
      noise({ filter: 'highpass', freq: 3000, gain: 0.05, dur: 0.03 }); tone({ freq: 240, glideTo: 120, gain: 0.08, dur: 0.08 });
      bell(NOTE(79 + keyShift), { gain: 0.04, dur: 1.4, at: 0.06 }); bell(NOTE(86 + keyShift), { gain: 0.035, dur: 1.6, at: 0.2 });
    },
    error: function () { tone({ freq: 150, glideTo: 110, type: 'triangle', gain: 0.07, dur: 0.12 }); tone({ freq: 140, glideTo: 100, type: 'triangle', gain: 0.06, dur: 0.14, at: 0.11 }); },
    hint: function () { bell(NOTE(81), { gain: 0.035, dur: 1.2 }); bell(NOTE(88), { gain: 0.03, dur: 1.4, at: 0.12 }); },
    timeout: function () { bell(NOTE(69), { gain: 0.03, dur: 1.4 }); bell(NOTE(64), { gain: 0.03, dur: 1.8, at: 0.2 }); }
  };

  // ----- Music -----
  // A slow four-chord loop (two bars per chord). Each chord: a warm pad, a soft bass note, and a
  // few plucked or bell notes chosen at random from the chord's scale, so it never repeats exactly.
  var BPM = 58;
  var CHORDS = [
    { root: 48, pad: [0, 7, 16, 23], scale: [12, 14, 16, 19, 23, 24, 28] },   // Cmaj7
    { root: 45, pad: [0, 7, 15, 22], scale: [12, 15, 17, 19, 22, 24, 27] },   // Am7
    { root: 41, pad: [0, 7, 16, 23], scale: [12, 16, 19, 21, 23, 24, 28] },   // Fmaj7
    { root: 43, pad: [0, 7, 14, 21], scale: [12, 14, 16, 19, 21, 24, 26] }    // G6/9
  ];
  function playStep(step, time) {
    var at = Math.max(0, time - ctx.currentTime), beat = 60 / BPM;
    var s = step % 32, ch = CHORDS[Math.floor(step / 32) % CHORDS.length], root = ch.root + keyShift;
    if (s === 0) {
      ch.pad.forEach(function (n, i) {
        tone({ bus: musBus, at: at, freq: NOTE(root + n), gain: 0.02, dur: beat * 8.6, attack: beat * 2.2, hold: beat * 2, wet: 0.6, detune: i % 2 ? 5 : -5 });
        tone({ bus: musBus, at: at, freq: NOTE(root + n), type: 'triangle', gain: 0.006, dur: beat * 8.4, attack: beat * 3, hold: beat * 2, wet: 0.6, detune: i % 2 ? -7 : 7 });
      });
      tone({ bus: musBus, at: at, freq: NOTE(root - 12), gain: 0.07, dur: beat * 6, attack: 0.35, hold: beat * 1.5 });
    }
    if (s === 16 && !calm) tone({ bus: musBus, at: at, freq: NOTE(root - 5), gain: 0.04, dur: beat * 3.5, attack: 0.3 });
    // melody: sparse, favours on-beats
    var chance = (s % 4 === 0 ? 0.34 : s % 2 === 0 ? 0.16 : 0.05) * (calm ? 0.55 : 1);
    if (s !== 0 && Math.random() < chance) {
      var n = ch.scale[Math.floor(Math.random() * ch.scale.length)], f = NOTE(root + n);
      if (Math.random() < 0.3) bell(f * 2, { bus: musBus, at: at, gain: 0.011, dur: 2.2, wet: 0.7 });
      else pluck(f, { bus: musBus, at: at, gain: 0.022 * (0.8 + Math.random() * 0.4), dur: 2.6 });
      if (Math.random() < 0.25) pluck(NOTE(root + ch.scale[Math.floor(Math.random() * ch.scale.length)]), { bus: musBus, at: at + beat * 0.5, gain: 0.014, dur: 2.2 });
    }
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    var stepDur = 60 / BPM / 4;
    // If the tab slept, skip ahead instead of firing a burst of old notes.
    if (musNext < ctx.currentTime - 0.25) musNext = ctx.currentTime + 0.05;
    while (musNext < ctx.currentTime + 0.3) { playStep(musStep, musNext); musNext += stepDur; musStep = (musStep + 1) % (32 * CHORDS.length); }
  }
  function startMusic() {
    if (musTimer || !musicOn || !ensure()) return;
    musStep = 0; musNext = ctx.currentTime + 0.2;
    var t = ctx.currentTime; musBus.gain.cancelScheduledValues(t); musBus.gain.setValueAtTime(musBus.gain.value, t); musBus.gain.setTargetAtTime(0.85, t, 1.6);
    musTimer = setInterval(schedule, 70); schedule();
  }
  function stopMusic() {
    if (!musTimer) return;
    clearInterval(musTimer); musTimer = null;
    if (ctx) { var t = ctx.currentTime; musBus.gain.cancelScheduledValues(t); musBus.gain.setValueAtTime(musBus.gain.value, t); musBus.gain.setTargetAtTime(0, t, 0.4); }
  }

  var KEYS = [0, -2, 3, -4, 5, 2, -5, 0, 3, -2, 5, -4];
  window.Sfx = {
    setEnabled: function (v) { sfxOn = !!v; if (ctx) sfxBus.gain.setTargetAtTime(sfxOn ? 1 : 0, ctx.currentTime, 0.03); },
    setMusic: function (v) { musicOn = !!v; if (musicOn) { if (ctx) startMusic(); } else stopMusic(); },
    // Each chapter plays in its own key; the menus use a sparser, calmer arrangement.
    setMood: function (chapter, isMenu) { keyShift = isMenu ? 0 : KEYS[(chapter || 0) % KEYS.length]; calm = !!isMenu; },
    unlock: function () { if ((sfxOn || musicOn) && ensure()) startMusic(); },
    play: function (name, arg) { if (!sfxOn || !ensure()) return; try { S[name] && S[name](arg); } catch (e) { /* ignore */ } }
  };
  ['pointerdown', 'keydown'].forEach(function (type) { window.addEventListener(type, function () { window.Sfx.unlock(); }, { passive: true }); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (sfxOn || musicOn) ctx.resume();
  });
})();
