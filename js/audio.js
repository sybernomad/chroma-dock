/* Tiny synthesized sound effects (no audio files to download). */
(function () {
  'use strict';
  var ctx = null, master = null, enabled = true, noiseBuf = null;
  var NOTES = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0]; // one pitch per block colour

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function tone(freq, t0, dur, type, vol, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(t0, dur, f0, f1, vol) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  var S = {
    slide: function (dist) { var t = ctx.currentTime; noise(t, Math.min(0.08 + dist * 0.05, 0.4), 500, 2200, 0.18); },
    bump: function () { var t = ctx.currentTime; tone(140, t, 0.12, 'sine', 0.35, 70); },
    exit: function (c) { var t = ctx.currentTime, f = NOTES[c % NOTES.length]; tone(f, t, 0.18, 'triangle', 0.25); tone(f * 1.5, t + 0.07, 0.25, 'triangle', 0.2); tone(f * 2, t + 0.14, 0.3, 'sine', 0.12); },
    lift: function () { var t = ctx.currentTime; tone(220, t, 0.08, 'square', 0.05, 260); },
    spawn: function () { var t = ctx.currentTime; tone(330, t, 0.12, 'sine', 0.2, 660); },
    click: function () { var t = ctx.currentTime; tone(900, t, 0.04, 'square', 0.04); },
    undo: function () { var t = ctx.currentTime; tone(500, t, 0.1, 'sine', 0.15, 300); },
    coin: function () { var t = ctx.currentTime; tone(1318, t, 0.08, 'square', 0.06); tone(1760, t + 0.06, 0.18, 'square', 0.06); },
    win: function () { var t = ctx.currentTime; [523, 659, 784, 1046].forEach(function (f, i) { tone(f, t + i * 0.09, 0.35, 'triangle', 0.22); }); tone(1568, t + 0.4, 0.6, 'sine', 0.12); },
    error: function () { var t = ctx.currentTime; tone(200, t, 0.15, 'sawtooth', 0.06, 150); },
    hint: function () { var t = ctx.currentTime; tone(880, t, 0.12, 'sine', 0.15); tone(1175, t + 0.1, 0.2, 'sine', 0.12); },
    unlock: function () { var t = ctx.currentTime; tone(392, t, 0.08, 'square', 0.08); tone(784, t + 0.08, 0.12, 'square', 0.07); tone(1175, t + 0.18, 0.3, 'triangle', 0.15); },
    timeout: function () { var t = ctx.currentTime; tone(440, t, 0.2, 'triangle', 0.15, 330); }
  };
  window.Sfx = {
    setEnabled: function (v) { enabled = v; },
    unlock: function () { if (enabled) ensure(); },
    play: function (name, arg) { if (!enabled) return; if (!ensure()) return; try { S[name] && S[name](arg); } catch (e) { /* ignore */ } }
  };
})();
