/* Chroma Dock — app: screens, input, timer/gems, store, persistence. */
(function () {
  'use strict';
  var E = window.Engine, BR = window.BlockRender, LEVELS = window.LEVELS, Sfx = window.Sfx;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ---------------- Debug ----------------
  // Shows the Debug section in Settings (unlock all levels, infinite gems). Set to false before publishing.
  var DEBUG_MENU = true;
  // Shown in Settings. tools/release.js keeps this in step with VERSION in sw.js.
  var APP_VERSION = '1.2.0';

  // ---------------- Save data ----------------
  var SAVE_KEY = 'chromadock-save-v1';
  var OLD_SAVE_KEY = 'blockout-save-v1'; // the game's original name; progress is carried over once
  var DEFAULT = {
    gems: 25, unlocked: 1, stars: {}, best: {}, cleared: {}, tipsSeen: {},
    inv: { hint: 3, boost: 1, skip: 0 },
    owned: { skin: ['classic'], theme: ['midnight'] },
    skin: 'classic', theme: 'midnight', sound: true, music: true, haptics: true, symbols: true,
    debug: { unlockAll: false, infiniteGems: false }
  };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    var d = clone(DEFAULT);
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY) || 'null');
      if (s) { Object.keys(s).forEach(function (k) { d[k] = s[k]; }); d.inv = Object.assign(clone(DEFAULT.inv), s.inv || {}); d.owned = Object.assign(clone(DEFAULT.owned), s.owned || {}); d.debug = Object.assign(clone(DEFAULT.debug), s.debug || {}); }
      if (!DEBUG_MENU) d.debug = clone(DEFAULT.debug);
    } catch (e) { /* private mode etc. */ }
    return d;
  }
  var save = load();
  // New levels can be added after a player finished the old last level: open the next one up.
  while (save.cleared[save.unlocked] && save.unlocked < LEVELS.length) save.unlocked++;
  persist(); // also moves progress saved under the old name to the new key
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // ---------------- Catalog ----------------
  var CHAPTERS = [
    { name: 'Warm Up', from: 1, to: 10 }, { name: 'Going Up', from: 11, to: 20 }, { name: 'Factory Floor', from: 21, to: 30 },
    { name: 'Clockwork', from: 31, to: 40 }, { name: 'Rush Hour', from: 41, to: 50 }, { name: 'Grand Machine', from: 51, to: 60 },
    { name: 'Heavy Cargo', from: 61, to: 70 }, { name: 'Odd Shapes', from: 71, to: 80 },
    { name: 'Twists & Turns', from: 81, to: 90 }, { name: 'Grand Finale', from: 91, to: 100 },
    { name: 'Locked Gates', from: 101, to: 110 }, { name: 'Crowd Control', from: 111, to: 120 }
  ];
  var STORE = {
    power: [
      { id: 'hint', name: 'Hint Pack', desc: 'Get 3 hints. Each one shows a move that leads toward a solution.', price: 30, qty: 3, icon: '💡' },
      { id: 'boost', name: 'Time Boost Pack', desc: 'Get 3 boosts. Each one adds 15 seconds to the bonus clock, even after it runs out.', price: 25, qty: 3, icon: '⏱' },
      { id: 'skip', name: 'Level Skip', desc: 'Unlock the next level without clearing this one. Use it from the pause menu.', price: 120, qty: 1, icon: '⏭' }
    ],
    skin: [
      { id: 'classic', name: 'Classic', desc: 'Glossy candy tiles.', price: 0 },
      { id: 'jelly', name: 'Jelly', desc: 'Soft, wobbly and shiny.', price: 120 },
      { id: 'pixel', name: 'Pixel', desc: 'Old-school 8-bit bevels.', price: 200 },
      { id: 'gem', name: 'Gemstone', desc: 'Cut facets with a sparkle.', price: 300 },
      { id: 'neon', name: 'Neon', desc: 'Glowing tubes for night owls.', price: 400 }
    ],
    theme: [
      { id: 'midnight', name: 'Midnight', desc: 'Deep indigo. The original.', price: 0 },
      { id: 'sunset', name: 'Sunset', desc: 'Warm plum and coral.', price: 150 },
      { id: 'mint', name: 'Mint', desc: 'Cool teal workshop.', price: 150 },
      { id: 'paper', name: 'Paper', desc: 'Bright and easy on the eyes in daylight.', price: 220 },
      { id: 'space', name: 'Deep Space', desc: 'Twinkling stars behind the board.', price: 300 }
    ]
  };
  var THEME_COLORS = { midnight: '#12122a', sunset: '#2a0f22', mint: '#061a1d', paper: '#efe5d3', space: '#03051a' };

  // ---------------- Helpers ----------------
  function haptic(ms) { if (save.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  var toastTimer = null;
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200); }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function gemsHTML(n) { return '<i class="gem"></i> ' + n; }
  // Debug-aware accessors (debug never changes real progress, so switching it off restores everything).
  function maxUnlocked() { return save.debug.unlockAll ? LEVELS.length : save.unlocked; }
  function infinite() { return !!save.debug.infiniteGems; }
  function canAfford(price) { return infinite() || save.gems >= price; }
  var gemShown = null; // while gems fly to the counter it counts up instead of jumping
  function refreshGems(bump) { $$('.gem-count').forEach(function (el) { el.textContent = infinite() ? '∞' : (gemShown === null ? save.gems : gemShown); }); if (bump) $$('.gem-pill').forEach(function (p) { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }); }
  function starsFor(moves, opt) { return moves <= opt ? 3 : moves <= Math.ceil(opt * 1.5) + 1 ? 2 : 1; }
  function timeLimit(lv) { return Math.max(20, Math.round((15 + lv.opt * 4.5) / 5) * 5); }
  function bonusFor(remaining) { return remaining > 0 ? Math.min(12, Math.ceil(remaining / 4)) : 0; }

  // ---------------- Screens ----------------
  var current = 'home', backTo = { levels: 'home', store: 'home', settings: 'home' };
  function show(name, from) {
    if (from) backTo[name] = from;
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + name); });
    if (current === 'game' && name !== 'game') pauseTimer();
    current = name;
    if (name === 'levels') renderLevels();
    if (name === 'store') renderStore();
    if (name === 'home') renderHome();
    if (name !== 'game') Sfx.setMood(0, true);
    if (name === 'game') { setTimeout(function () { renderer.layout(); renderer.snap(G.state); }, 30); if (!G.won && !modalOpen()) resumeTimer(); }
    refreshGems();
  }
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', function () { Sfx.play('click'); show(backTo[current] || 'home'); }); });

  // ---------------- Modal ----------------
  var modalOnClose = null;
  function modalOpen() { return !$('#modal').classList.contains('hidden'); }
  function openModal(html, onClose) { $('#modal-card').innerHTML = html; $('#modal').classList.remove('hidden'); modalOnClose = onClose || null; pauseTimer(); }
  function closeModal() { $('#modal').classList.add('hidden'); var f = modalOnClose; modalOnClose = null; if (f) f(); if (current === 'game' && !G.won) resumeTimer(); }

  // ---------------- Home ----------------
  function nextLevel() { for (var i = 1; i <= LEVELS.length; i++) if (!save.cleared[i] && i <= maxUnlocked()) return i; return Math.min(maxUnlocked(), LEVELS.length); }
  function renderHome() {
    var n = nextLevel();
    $('#play-sub').textContent = 'Level ' + n + ' · ' + (LEVELS[n - 1].name || '');
    var cleared = 0, stars = 0;
    for (var i = 1; i <= LEVELS.length; i++) { if (save.cleared[i]) cleared++; stars += save.stars[i] || 0; }
    var ch = CHAPTERS.find(function (c) { return n >= c.from && n <= c.to; }) || CHAPTERS[0];
    $('#hc-chapter').textContent = 'Chapter ' + (CHAPTERS.indexOf(ch) + 1) + ' · ' + ch.name;
    $('#hc-stars').textContent = '★ ' + stars + ' / ' + LEVELS.length * 3;
    $('#hc-cleared').textContent = cleared + ' of ' + LEVELS.length + ' levels cleared';
    $('#hc-fill').style.width = (100 * cleared / LEVELS.length) + '%';
  }
  $('#btn-play').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); startLevel(nextLevel()); });
  $('#btn-levels').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); show('levels', 'home'); });
  $('#btn-store').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); show('store', 'home'); });
  $('#btn-settings').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); show('settings', 'home'); });

  // Home animation: blocks queue up in a dock and slide out through a glowing gate, on a loop.
  (function dockScene() {
    var cv = $('#logo-canvas'), ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 3), W = 300, H = 130;
    cv.width = W * dpr; cv.height = H * dpr;
    var SZ = 46, GAP = 56, X0 = 34, Y = 66, CYCLE = 2600, row = [0, 1, 2, 3], next = 4, t0 = null, flash = 0;
    function easeIO(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function f(t) {
      requestAnimationFrame(f);
      if (current !== 'home') { t0 = null; return; }
      if (t0 === null) t0 = t;
      var k = (t - t0) / CYCLE;
      if (k >= 1) { row.pop(); row.unshift(next); next = (next + 1) % 6; t0 = t; k = 0; }
      var out = Math.min(1, Math.max(0, (k - 0.3) / 0.2)), shift = easeIO(Math.min(1, Math.max(0, (k - 0.52) / 0.3)));
      if (out >= 1 && k < 0.56) flash = 1;
      flash = Math.max(0, flash - 0.03);
      var gc = BR.COLORS[row[3]];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      // dock tray
      BR.rr(ctx, 8, Y - 34, 240, 68, 20); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
      // gate
      ctx.save(); ctx.shadowColor = gc; ctx.shadowBlur = 14 + flash * 26 + Math.sin(t / 400) * 4;
      BR.rr(ctx, 256, Y - 30, 30, 60, 12); ctx.fillStyle = BR.shade(gc, -0.25 + flash * 0.5); ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = BR.shade(gc, 0.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var bob = (t / 700) % 1 * 6;
      ctx.globalAlpha = 0.8 - (bob / 6) * 0.5; ctx.beginPath(); ctx.moveTo(266 + bob, Y - 8); ctx.lineTo(274 + bob, Y); ctx.lineTo(266 + bob, Y + 8); ctx.stroke();
      ctx.restore();
      // blocks
      var opt = { time: t, symbols: save.symbols };
      for (var i = 0; i < 4; i++) {
        var x = X0 + i * GAP, a = 1, sc = 1;
        if (i === 3) { x += easeIO(out) * 62; a = 1 - Math.max(0, (out - 0.55) / 0.45); sc = 1 - out * 0.25; }
        else x += shift * GAP;
        if (a <= 0) continue;
        ctx.save(); ctx.globalAlpha = a; BR.drawBlock(ctx, save.skin, row[i], x, Y, SZ * sc, opt); ctx.restore();
      }
      if (shift > 0) { ctx.save(); ctx.globalAlpha = shift; BR.drawBlock(ctx, save.skin, next, X0 - GAP + shift * GAP, Y, SZ * (0.6 + 0.4 * shift), opt); ctx.restore(); }
    }
    requestAnimationFrame(f);
  })();

  // ---------------- Level select ----------------
  function renderLevels() {
    var html = '', nextUp = nextLevel();
    CHAPTERS.forEach(function (ch) {
      if (ch.from > LEVELS.length) return;
      var got = 0, max = 0;
      for (var i = ch.from; i <= Math.min(ch.to, LEVELS.length); i++) { got += save.stars[i] || 0; max += 3; }
      html += '<div class="chapter"><h3>' + ch.name + '</h3><small>★ ' + got + '/' + max + '</small></div><div class="level-grid">';
      for (i = ch.from; i <= Math.min(ch.to, LEVELS.length); i++) {
        var locked = i > maxUnlocked(), st = save.stars[i] || 0, cls = 'lvl' + (locked ? ' locked' : save.cleared[i] ? ' cleared' : i === nextUp ? ' current' : '');
        html += '<button class="' + cls + '" data-lvl="' + i + '"' + (locked ? ' aria-label="Level ' + i + ' locked"' : '') + '>' + (locked ? '🔒' : i) +
          '<span class="stars">' + (locked ? '' : [1, 2, 3].map(function (k) { return '<span class="' + (k <= st ? '' : 'off') + '">★</span>'; }).join('')) + '</span></button>';
      }
      html += '</div>';
    });
    $('#level-list').innerHTML = html;
  }
  $('#level-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lvl]'); if (!b) return;
    var n = +b.dataset.lvl;
    if (n > maxUnlocked()) { Sfx.play('error'); toast('Clear level ' + (n - 1) + ' to unlock this one'); return; }
    Sfx.play('click'); startLevel(n);
  });

  // ---------------- Game ----------------
  var renderer = new BR.Renderer($('#board'));
  renderer.onUnlock = function () { Sfx.play('unlock'); haptic([15, 30, 15]); };
  var G = { n: 1, lv: null, C: null, state: null, init: null, history: [], moves: 0, limit: 30, elapsed: 0, running: false, last: 0, won: false, overNotified: false, hintBusy: false };

  function applyLook() {
    document.body.dataset.theme = save.theme; renderer.setTheme(save.theme); renderer.setSkin(save.skin); renderer.setSymbols(save.symbols);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEME_COLORS[save.theme] || '#12122a');
    Sfx.setEnabled(save.sound); Sfx.setMusic(save.music);
  }

  function startLevel(n) {
    n = Math.max(1, Math.min(LEVELS.length, n));
    var lv = LEVELS[n - 1];
    G.n = n; G.lv = lv; G.C = E.compile(lv); G.init = E.initialState(G.C); G.state = G.init;
    G.history = []; G.moves = 0; G.limit = timeLimit(lv); G.elapsed = 0; G.running = false; G.started = false; G.docked = 0; G.won = false; G.overNotified = false;
    hudCache = ''; Sfx.setMood(Math.floor((n - 1) / 10), false);
    renderer.selected = null; renderer.hint = null;
    $('#lvl-num').textContent = 'Level ' + n; $('#lvl-name').textContent = lv.name || '';
    $('#par-text').textContent = lv.opt;
    updateHud(); updateTools();
    show('game');
    renderer.setLevel(G.C, G.state);
    if (lv.tip && !save.tipsSeen[n]) {
      var icon = /Elevator/.test(lv.tip) ? '🛗' : /Generator/.test(lv.tip) ? '🏭' : /Locked|padlock/i.test(lv.tip) ? '🔒' : /Crowd/.test(lv.tip) ? '🚦' : /T-block|zigzag/i.test(lv.tip) ? '🔀' : /Heavy|Long/.test(lv.tip) ? '🚚' : /shape|L-block|Crate/i.test(lv.tip) ? '🧩' : '👆';
      openModal('<div class="tip-icon">' + icon + '</div><h2>' + (lv.name || 'Tip') + '</h2><p>' + lv.tip + '</p><div class="btns"><button class="btn btn-primary" data-act="ok">Got it</button></div>',
        function () { save.tipsSeen[n] = true; persist(); });
    } else resumeTimer();
  }

  function pauseTimer() { if (G.running) { G.elapsed += (performance.now() - G.last) / 1000; G.running = false; } }
  function resumeTimer() { if (G.started && !G.running && !G.won && current === 'game') { G.running = true; G.last = performance.now(); } }
  function elapsedNow() { return G.elapsed + (G.running ? (performance.now() - G.last) / 1000 : 0); }

  var hudCache = '';
  function updateHud() {
    var rem = G.limit - elapsedNow(), frac = Math.max(0, Math.min(1, rem / G.limit));
    var key = Math.ceil(rem) + '|' + G.moves + '|' + G.limit + '|' + G.started;
    var fill = $('#timer-fill');
    fill.style.transform = 'scaleX(' + frac + ')';
    if (key === hudCache) return; hudCache = key;
    fill.classList.toggle('warn', rem > 0 && frac < 0.3); fill.classList.toggle('over', rem <= 0);
    $('#moves-text').textContent = G.moves;
    var bt = $('#bonus-text');
    if (!G.started) { $('#timer-text').innerHTML = fmt(rem) + ' <span class="wait">· starts on first move</span>'; bt.innerHTML = 'Bonus <i class="gem"></i> +' + bonusFor(rem); bt.classList.remove('over'); }
    else if (rem > 0) { $('#timer-text').textContent = fmt(rem); bt.innerHTML = 'Bonus <i class="gem"></i> +' + bonusFor(rem); bt.classList.remove('over'); }
    else { $('#timer-text').textContent = 'Time’s up'; bt.textContent = 'No rush, keep going'; bt.classList.add('over'); }
    if (rem <= 0 && !G.overNotified && G.running) { G.overNotified = true; Sfx.play('timeout'); toast('Bonus time is over. Take as long as you need!'); }
  }
  function updateTools() {
    var hc = $('#hint-count'), bc = $('#boost-count');
    hc.textContent = save.inv.hint > 0 ? save.inv.hint : '+'; hc.classList.toggle('empty', save.inv.hint <= 0);
    bc.textContent = save.inv.boost > 0 ? save.inv.boost : '+'; bc.classList.toggle('empty', save.inv.boost <= 0);
    $('#btn-undo').disabled = !G.history.length || G.won;
  }
  (function hudLoop() { if (current === 'game') updateHud(); requestAnimationFrame(hudLoop); })();

  var hooks = {
    slide: function (d) { Sfx.play('slide', d); haptic(6); },
    bump: function () { Sfx.play('bump'); },
    exit: function () { Sfx.play('exit', G.docked++); haptic(18); },
    lift: function () { Sfx.play('lift'); },
    spawn: function () { Sfx.play('spawn'); }
  };

  function tryMove(id, dir) {
    if (G.won) return;
    if (renderer.busy()) renderer.finish();
    var bi = G.state.blocks.findIndex(function (b) { return b.id === id; });
    if (bi < 0) return;
    var r = E.move(G.C, G.state, bi, dir);
    if (!r) { Sfx.play('bump'); haptic(4); wiggle(id, dir); return; }
    G.history.push(G.state); G.state = r.state; G.moves++;
    if (!G.started) { G.started = true; resumeTimer(); hudCache = ''; }   // the clock starts on the first move
    renderer.hint = null;
    if (renderer.selected && !G.state.blocks.some(function (b) { return b.id === renderer.selected; })) renderer.selected = null;
    var won = E.isWon(G.C, G.state);
    if (won) { pauseTimer(); G.won = true; }
    updateHud(); updateTools();
    renderer.animateMove(r.events, G.state, function () { if (won) setTimeout(winSequence, 250); }, hooks);
  }
  function wiggle(id, dir) { var b = renderer.vis.get(id); if (b) { b.sq = 1; b.sqd = dir; b.sqt = performance.now(); } }

  function undo() {
    if (G.won || !G.history.length) return;
    renderer.finish(); G.state = G.history.pop(); G.moves--; renderer.hint = null; renderer.snap(G.state);
    Sfx.play('undo'); haptic(5); updateHud(); updateTools();
  }
  function restart() {
    if (G.won) return;
    renderer.finish(); G.state = G.init; G.history = []; G.moves = 0; renderer.hint = null; renderer.selected = null; renderer.snap(G.state);
    Sfx.play('undo'); updateHud(); updateTools();
  }
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-restart').addEventListener('click', restart);

  function offerBuy(id) {
    var item = STORE.power.find(function (p) { return p.id === id; });
    var can = canAfford(item.price);
    openModal('<div class="tip-icon">' + item.icon + '</div><h2>Out of ' + (id === 'hint' ? 'hints' : 'boosts') + '</h2><p>' + item.desc + '</p>' +
      '<div class="btns"><button class="btn btn-gold" data-act="buy" data-id="' + id + '"' + (can ? '' : ' disabled') + '>Buy ' + item.qty + ' for ' + gemsHTML(item.price) + '</button>' +
      (can ? '' : '<p style="margin:0">You need ' + (item.price - save.gems) + ' more gems. Beat the clock to earn them!</p>') +
      '<button class="btn" data-act="close">Not now</button></div>');
  }

  $('#btn-hint').addEventListener('click', function () {
    if (G.won || G.hintBusy) return;
    if (save.inv.hint <= 0) { offerBuy('hint'); return; }
    renderer.finish();
    G.hintBusy = true; $('#btn-hint').classList.add('busy');
    var snapshotHash = E.hash(G.C, G.state);
    solveHint(G.lv, G.state, function (res) {
      G.hintBusy = false; $('#btn-hint').classList.remove('busy');
      if (E.hash(G.C, G.state) !== snapshotHash || current !== 'game') return;
      if (res.move) {
        save.inv.hint--; persist(); updateTools();
        renderer.hint = res.move; var b = E.blockByAnchor(G.state, res.move.x, res.move.y, res.move.s); if (b >= 0) renderer.selected = G.state.blocks[b].id;
        Sfx.play('hint'); haptic(10);
      } else if (res.capped) { toast('This position is too tangled to work out. Try undoing a few moves.', 3000); }
      else { Sfx.play('error'); toast('There’s no way to finish from here. Undo or restart (no hint used).', 3200); }
    });
  });
  function solveHint(level, state, cb) {
    var done = false;
    try {
      var w = new Worker('js/hint-worker.js');
      var to = setTimeout(function () { if (!done) { done = true; w.terminate(); cb({ move: null, capped: true }); } }, 12000);
      w.onmessage = function (e) { if (done) return; done = true; clearTimeout(to); w.terminate(); cb(e.data); };
      w.onerror = function (ev) { ev.preventDefault && ev.preventDefault(); if (done) return; done = true; clearTimeout(to); w.terminate(); syncHint(); };
      w.postMessage({ id: 1, level: level, state: state });
    } catch (e) { syncHint(); }
    function syncHint() {
      setTimeout(function () {
        var r = E.solveAny(E.compile(level), state, { bfsCap: 40000, bestCap: 120000, weights: [2], firstOnly: true });
        cb({ move: r.moves && r.moves[0], capped: !!r.capped });
      }, 30);
    }
  }

  $('#btn-boost').addEventListener('click', function () {
    if (G.won) return;
    if (save.inv.boost <= 0) { offerBuy('boost'); return; }
    var rem = G.limit - elapsedNow();
    if (rem < 0) G.limit += -rem; // revive the bonus clock from zero
    G.limit += 15; G.overNotified = false; save.inv.boost--; persist(); updateTools(); hudCache = '';
    Sfx.play('coin'); haptic(10); toast('+15 seconds of bonus time!');
  });

  $('#btn-game-back').addEventListener('click', function () {
    Sfx.play('click');
    if (G.won) { show('levels', 'home'); return; }
    var canSkip = save.inv.skip > 0 && G.n < LEVELS.length && !save.cleared[G.n];
    openModal('<h2>Paused</h2><p>Level ' + G.n + ' · ' + (G.lv.name || '') + '</p><div class="btns">' +
      '<button class="btn btn-primary" data-act="close">Resume</button>' +
      '<div class="row"><button class="btn" data-act="restart">Restart</button><button class="btn" data-act="levels">Levels</button></div>' +
      '<div class="row"><button class="btn" data-act="store">Store</button><button class="btn" data-act="home">Home</button></div>' +
      (canSkip ? '<button class="btn btn-gold" data-act="skip">Skip level (' + save.inv.skip + ' left)</button>' : '') + '</div>');
  });

  // ---------------- Win ----------------
  function winSequence() {
    var n = G.n, lv = G.lv;
    var rem = G.limit - G.elapsed, stars = starsFor(G.moves, lv.opt);
    var prevStars = save.stars[n] || 0, first = !save.cleared[n];
    var timeGems = bonusFor(rem), starGems = Math.max(0, stars - prevStars) * 3, firstGems = first ? 5 : 0;
    var total = timeGems + starGems + firstGems;
    save.gems += total; save.stars[n] = Math.max(prevStars, stars); save.cleared[n] = true;
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, n + 1));
    if (!save.best[n] || G.moves < save.best[n]) save.best[n] = G.moves;
    persist();
    Sfx.play('win'); haptic([20, 40, 20, 40, 60]); celebrate();
    for (var si = 1; si <= stars; si++) (function (k) { setTimeout(function () { Sfx.play('star', k - 1); }, 250 + k * 180); })(si);
    if (total && !infinite()) { gemShown = save.gems - total; refreshGems(); setTimeout(function () { flyGems(total); }, 1000); }
    var last = n >= LEVELS.length;
    var rows = '';
    if (firstGems) rows += '<div><span>First clear</span><span>' + gemsHTML(firstGems) + '</span></div>';
    rows += '<div><span>Time bonus' + (rem > 0 ? ' (' + fmt(rem) + ' left)' : '') + '</span><span>' + (timeGems ? gemsHTML(timeGems) : '—') + '</span></div>';
    if (starGems) rows += '<div><span>New stars</span><span>' + gemsHTML(starGems) + '</span></div>';
    rows += '<div class="total"><span>Total</span><span>' + gemsHTML(total) + '</span></div>';
    var starHtml = [1, 2, 3].map(function (k) { return '<span class="' + (k <= stars ? 'on' : '') + '" style="animation-delay:' + (0.15 + k * 0.18) + 's">★</span>'; }).join('');
    openModal('<h2>' + (last ? 'You did it!' : 'Level clear!') + '</h2><div class="big-stars">' + starHtml + '</div>' +
      '<p style="margin:0">' + G.moves + (G.moves === 1 ? ' move' : ' moves') + ' · par ' + lv.opt + (stars < 3 ? ' · finish in ' + lv.opt + ' or fewer for ★★★' : '') + '</p>' +
      '<div class="rewards">' + rows + '</div>' +
      (last ? '<p>You cleared every level in Chroma Dock. Go back for any missing stars, or spend your gems in the store.</p>' : '') +
      '<div class="btns">' + (last ? '' : '<button class="btn btn-primary" data-act="next">Next level</button>') +
      '<div class="row"><button class="btn" data-act="replay">Replay</button><button class="btn" data-act="levels">Levels</button></div></div>');
  }

  // Win celebration: a soft pulse of light and slow rising motes in the level's colours.
  var fx = $('#fx'), fxc = fx.getContext('2d'), motes = [], pulseT = 0, fxRunning = false, fxLast = 0;
  function celebrate() {
    var r = fx.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = r.width * dpr; fx.height = r.height * dpr; fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cols = (G.lv.doors || []).map(function (d) { return BR.COLORS[d[2]]; }); if (!cols.length) cols = BR.COLORS;
    motes = [];
    for (var i = 0; i < 44; i++) motes.push({ x: Math.random() * r.width, y: r.height * (0.45 + Math.random() * 0.65), vy: 18 + Math.random() * 46, r: 1.5 + Math.random() * 4.5,
      c: cols[i % cols.length], ph: Math.random() * 6, life: 1, decay: 0.16 + Math.random() * 0.16, delay: Math.random() * 0.9 });
    pulseT = 1;
    if (!fxRunning) { fxRunning = true; fxLast = performance.now(); requestAnimationFrame(fxLoop); }
  }
  function fxLoop(now) {
    var r = fx.getBoundingClientRect(), dt = Math.min(0.05, (now - fxLast) / 1000); fxLast = now;
    fxc.clearRect(0, 0, r.width, r.height);
    fxc.globalCompositeOperation = save.theme === 'paper' ? 'source-over' : 'lighter';
    if (pulseT > 0) {
      var k = 1 - pulseT, cx = r.width / 2, cy = r.height * 0.4, rad = r.width * (0.25 + 0.9 * (1 - Math.pow(1 - k, 3)));
      var g = fxc.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(255,255,255,' + 0.22 * pulseT + ')'); g.addColorStop(0.6, 'rgba(160,190,255,' + 0.1 * pulseT + ')'); g.addColorStop(1, 'rgba(160,190,255,0)');
      fxc.fillStyle = g; fxc.fillRect(0, 0, r.width, r.height);
      pulseT -= dt * 1.1;
    }
    motes = motes.filter(function (m) {
      if (m.delay > 0) { m.delay -= dt; return true; }
      m.y -= m.vy * dt; m.life -= m.decay * dt; m.ph += dt * 1.6;
      var x = m.x + Math.sin(m.ph) * 10, a = Math.min(1, (1 - m.life) * 6) * Math.max(0, m.life);
      var gg = fxc.createRadialGradient(x, m.y, 0, x, m.y, m.r * 4);
      gg.addColorStop(0, hexA(m.c, 0.55 * a)); gg.addColorStop(1, hexA(m.c, 0));
      fxc.fillStyle = gg; fxc.fillRect(x - m.r * 4, m.y - m.r * 4, m.r * 8, m.r * 8);
      fxc.fillStyle = 'rgba(255,255,255,' + 0.7 * a + ')'; fxc.beginPath(); fxc.arc(x, m.y, m.r * 0.45, 0, 7); fxc.fill();
      return m.life > 0;
    });
    if (motes.length || pulseT > 0) requestAnimationFrame(fxLoop); else { fxRunning = false; fxc.clearRect(0, 0, r.width, r.height); }
  }
  function hexA(h, a) { var n = parseInt(h.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

  // Earned gems fly from the reward total up to the gem counter, which counts up as they land.
  function flyGems(total) {
    var from = document.querySelector('.rewards .total .gem'), to = document.querySelector('#screen-game .gem-pill .gem'), app = $('#app');
    var done = function () { gemShown = null; refreshGems(true); };
    if (!from || !to || !from.animate) { Sfx.play('coin'); done(); return; }
    var ar = app.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    var n = Math.min(total, 8), landed = 0, start = gemShown;
    for (var i = 0; i < n; i++) (function (i) {
      var el = document.createElement('i'); el.className = 'gem fly'; app.appendChild(el);
      var x0 = a.left - ar.left, y0 = a.top - ar.top, x1 = b.left - ar.left, y1 = b.top - ar.top, mx = (x0 + x1) / 2 - 60 - Math.random() * 60, my = (y0 + y1) / 2;
      var an = el.animate([
        { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.6)', opacity: 0 },
        { transform: 'translate(' + x0 + 'px,' + (y0 - 14) + 'px) scale(1.2)', opacity: 1, offset: 0.15 },
        { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.1)', opacity: 1, offset: 0.6 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.8)', opacity: 1 }
      ], { duration: 700, delay: i * 90, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
      an.onfinish = function () {
        el.remove(); landed++;
        if (gemShown !== null) { gemShown = start + Math.round(total * landed / n); refreshGems(true); }
        Sfx.play('gem', i); if (landed === n) done();
      };
    })(i);
    setTimeout(function () { if (gemShown !== null) done(); }, 700 + n * 90 + 600); // safety net
  }

  // ---------------- Modal actions ----------------
  $('#modal').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) { if (e.target === $('#modal') && !G.won && current === 'game') { Sfx.play('click'); closeModal(); } return; }
    var act = b.dataset.act; Sfx.play('click');
    if (act === 'ok' || act === 'close') closeModal();
    else if (act === 'next') { closeModal(); startLevel(G.n + 1); }
    else if (act === 'replay') { closeModal(); startLevel(G.n); }
    else if (act === 'levels') { closeModal(); show('levels', 'home'); }
    else if (act === 'home') { closeModal(); show('home'); }
    else if (act === 'restart') { closeModal(); restart(); }
    else if (act === 'store') { closeModal(); show('store', 'game'); }
    else if (act === 'skip') {
      save.inv.skip--; save.unlocked = Math.max(save.unlocked, G.n + 1); persist(); closeModal();
      toast('Level ' + (G.n + 1) + ' unlocked'); startLevel(G.n + 1);
    }
    else if (act === 'buy') { if (buy('power', b.dataset.id)) closeModal(); }
    else if (act === 'reset') {
      localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); save = load(); persist(); applyLook(); closeModal(); refreshGems(); syncSettings(); show('home'); toast('Progress reset');
    }
  });

  // ---------------- Board input ----------------
  var board = $('#board'), drag = null;
  function nearestBlock(cell) {
    var best = -1, bd = 0.8;
    var hit = E.blockAt(G.state, cell.x, cell.y);
    if (hit >= 0) return hit;
    G.state.blocks.forEach(function (b, i) {
      E.cellsOf(b).forEach(function (c) { var d = Math.hypot(cell.fx - (c[0] + 0.5), cell.fy - (c[1] + 0.5)); if (d < bd) { bd = d; best = i; } });
    });
    return best;
  }
  board.addEventListener('pointerdown', function (e) {
    Sfx.unlock(); if (G.won || modalOpen()) return;
    if (renderer.busy()) renderer.finish();
    var cell = renderer.cellFromPoint(e.clientX, e.clientY), bi = nearestBlock(cell);
    if (bi >= 0) {
      drag = { id: G.state.blocks[bi].id, sx: e.clientX, sy: e.clientY, moved: false };
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    } else if (renderer.selected) {
      // tap-to-move: tap a spot in the same row/column as the selected block
      var sb = G.state.blocks.find(function (b) { return b.id === renderer.selected; });
      var sh = sb && E.SHAPES[sb.s || 0];
      var inCols = sb && cell.x >= sb.x && cell.x < sb.x + sh.w, inRows = sb && cell.y >= sb.y && cell.y < sb.y + sh.h;
      if (sb && inCols !== inRows) {
        var dir = inCols ? (cell.y < sb.y ? 'up' : 'down') : (cell.x < sb.x ? 'left' : 'right');
        tryMove(sb.id, dir);
      } else renderer.selected = null;
    }
  });
  board.addEventListener('pointermove', function (e) {
    if (!drag || drag.moved) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, th = Math.max(10, renderer.cs * 0.22);
    if (Math.hypot(dx, dy) < th) return;
    drag.moved = true;
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    tryMove(drag.id, dir);
  });
  function endDrag() {
    if (drag && !drag.moved) { renderer.selected = renderer.selected === drag.id ? null : drag.id; Sfx.play('click'); }
    drag = null;
  }
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', function () { drag = null; });

  document.addEventListener('keydown', function (e) {
    if (current !== 'game' || modalOpen()) return;
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    var dir = map[e.key];
    if (dir) {
      e.preventDefault(); if (G.won) return;
      if (!renderer.selected || !G.state.blocks.some(function (b) { return b.id === renderer.selected; })) { if (G.state.blocks[0]) renderer.selected = G.state.blocks[0].id; else return; }
      tryMove(renderer.selected, dir); return;
    }
    if (e.key === 'Tab') {
      e.preventDefault(); var bl = G.state.blocks; if (!bl.length) return;
      var i = bl.findIndex(function (b) { return b.id === renderer.selected; });
      renderer.selected = bl[(i + (e.shiftKey ? bl.length - 1 : 1)) % bl.length].id; return;
    }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') undo();
    else if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'h' || e.key === 'H') $('#btn-hint').click();
  });

  window.addEventListener('resize', function () { if (G.C) { renderer.layout(); renderer.snap(G.state); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseTimer(); else if (current === 'game' && !modalOpen()) resumeTimer(); });

  // ---------------- Store ----------------
  var storeTab = 'power';
  $('#store-tabs').addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]'); if (!t) return;
    storeTab = t.dataset.tab; Sfx.play('click');
    $$('#store-tabs .tab').forEach(function (x) { x.classList.toggle('active', x === t); });
    renderStore();
  });
  function renderStore() {
    var list = STORE[storeTab], html = '';
    list.forEach(function (it) {
      var right, sub = '';
      if (storeTab === 'power') {
        sub = '<div class="own">You have ' + (save.inv[it.id] || 0) + '</div>';
        right = '<button class="btn btn-gold" data-buy="' + it.id + '">' + gemsHTML(it.price) + '</button>';
      } else {
        var owned = save.owned[storeTab].indexOf(it.id) >= 0, equipped = save[storeTab] === it.id;
        right = equipped ? '<button class="btn" disabled>Equipped</button>' : owned ? '<button class="btn" data-equip="' + it.id + '">Equip</button>' : '<button class="btn btn-gold" data-buy="' + it.id + '">' + gemsHTML(it.price) + '</button>';
        if (owned && !equipped) sub = '<div class="own">Owned</div>';
      }
      var ico = storeTab === 'power' ? '<div class="ico">' + it.icon + '</div>' : '<canvas data-prev="' + it.id + '" width="128" height="128"></canvas>';
      html += '<div class="item">' + ico + '<div><h4>' + it.name + '</h4><p>' + it.desc + '</p>' + sub + '</div>' + right + '</div>';
    });
    $('#store-list').innerHTML = html;
    $$('#store-list canvas[data-prev]').forEach(function (cv) {
      var ctx = cv.getContext('2d'), id = cv.dataset.prev;
      if (storeTab === 'skin') {
        BR.drawBlock(ctx, id, 0, 40, 42, 50, { symbols: save.symbols }); BR.drawBlock(ctx, id, 1, 88, 42, 50, { symbols: save.symbols });
        BR.drawBlock(ctx, id, 2, 40, 90, 50, { symbols: save.symbols }); BR.drawBlock(ctx, id, 3, 88, 90, 50, { symbols: save.symbols });
      } else {
        var T = BR.THEMES[id];
        for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) { ctx.fillStyle = (x === 0 || y === 0 || x === 3 || y === 3) ? T.wall : ((x + y) % 2 ? T.floor : T.floorAlt); ctx.fillRect(x * 32, y * 32, 32, 32); }
        BR.drawBlock(ctx, save.skin, 0, 48, 48, 28, { symbols: false }); BR.drawBlock(ctx, save.skin, 1, 80, 80, 28, { symbols: false });
      }
    });
  }
  function buy(cat, id) {
    var it = STORE[cat].find(function (x) { return x.id === id; });
    if (!canAfford(it.price)) { Sfx.play('error'); toast('You need ' + (it.price - save.gems) + ' more gems'); return false; }
    if (!infinite()) save.gems -= it.price;
    if (cat === 'power') { save.inv[id] = (save.inv[id] || 0) + it.qty; toast(it.name + ' added'); }
    else { save.owned[cat].push(id); save[cat] = id; applyLook(); toast(it.name + ' unlocked & equipped'); }
    persist(); Sfx.play('coin'); haptic(15); refreshGems(true); updateTools();
    if (current === 'store') renderStore();
    return true;
  }
  $('#store-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-buy],[data-equip]'); if (!b) return;
    if (b.dataset.buy) buy(storeTab, b.dataset.buy);
    else { save[storeTab] = b.dataset.equip; persist(); applyLook(); Sfx.play('click'); renderStore(); }
  });

  // ---------------- Settings ----------------
  function syncSettings() {
    $('#set-sound').checked = save.sound; $('#set-music').checked = save.music; $('#set-haptics').checked = save.haptics; $('#set-symbols').checked = save.symbols;
    $('#debug-section').hidden = !DEBUG_MENU;
    $('#set-unlock-all').checked = save.debug.unlockAll; $('#set-inf-gems').checked = save.debug.infiniteGems;
  }
  $('#set-unlock-all').addEventListener('change', function (e) { save.debug.unlockAll = e.target.checked; persist(); Sfx.play('click'); toast(e.target.checked ? 'All ' + LEVELS.length + ' levels unlocked' : 'Back to your real progress'); });
  $('#set-inf-gems').addEventListener('change', function (e) { save.debug.infiniteGems = e.target.checked; persist(); refreshGems(true); Sfx.play('click'); toast(e.target.checked ? 'Infinite gems on: store purchases are free' : 'Infinite gems off'); });
  $('#set-sound').addEventListener('change', function (e) { save.sound = e.target.checked; persist(); Sfx.setEnabled(save.sound); Sfx.unlock(); Sfx.play('click'); });
  $('#set-music').addEventListener('change', function (e) { save.music = e.target.checked; persist(); Sfx.setMusic(save.music); Sfx.unlock(); });
  function credits() {
    Sfx.play('click');
    openModal('<h2>Credits</h2><div class="credits">' +
      '<p style="margin:0">Chroma Dock ' + APP_VERSION + '</p>' +
      '<h4>Font</h4>Outfit, © 2021 The Outfit Project Authors. Used under the <a href="fonts/OFL-Outfit.txt" target="_blank" rel="noopener">SIL Open Font License 1.1</a>.' +
      '<h4>Sound and music</h4>Synthesized live in your browser by the game. No recordings or samples are used.' +
      '<h4>Graphics and icons</h4>Drawn by the game’s own code. Emoji in tips and the store come from your device.' +
      '</div><div class="btns"><button class="btn btn-primary" data-act="close">Close</button></div>');
  }
  $('#btn-credits').addEventListener('click', credits);
  $('#btn-credits-home').addEventListener('click', credits);
  $('#set-haptics').addEventListener('change', function (e) { save.haptics = e.target.checked; persist(); haptic(20); });
  $('#set-symbols').addEventListener('change', function (e) { save.symbols = e.target.checked; persist(); applyLook(); });
  $('#btn-reset').addEventListener('click', function () {
    openModal('<h2>Reset progress?</h2><p>This deletes your levels, stars, gems and purchases on this device. It can’t be undone.</p><div class="btns"><button class="btn btn-danger" style="margin:0" data-act="reset">Reset everything</button><button class="btn" data-act="close">Cancel</button></div>');
  });

  // ---------------- Boot ----------------
  applyLook(); syncSettings(); refreshGems(); renderHome();
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  // ---------------- Install (PWA) ----------------
  var deferredInstall = null;
  var isStandalone = function () { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; };
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function refreshInstallButtons() {
    var show = !isStandalone() && (!!deferredInstall || isIOS);
    $('#btn-install').hidden = !show; $('#btn-install-2').hidden = !show;
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; refreshInstallButtons(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; refreshInstallButtons(); toast('Chroma Dock installed! Find it on your home screen.'); });
  function install() {
    Sfx.play('click');
    if (deferredInstall) {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; refreshInstallButtons(); });
    } else if (isIOS) {
      openModal('<div class="tip-icon">📲</div><h2>Install on iPhone</h2><p>Add Chroma Dock to your home screen. It opens full screen and works offline.</p>' +
        '<ol class="ios-steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</li></ol>' +
        '<div class="btns"><button class="btn btn-primary" data-act="close">Got it</button></div>');
    }
  }
  $('#btn-install').addEventListener('click', install);
  $('#btn-install-2').addEventListener('click', install);
  refreshInstallButtons();

  // ---------------- Updates ----------------
  $('#app-version').textContent = 'Version ' + APP_VERSION + (isStandalone() ? ' · installed' : '');
  var swReg = null, reloading = false, waitingWorker = null;
  function midLevel() { return current === 'game' && !G.won && G.moves > 0; }
  function applyUpdate() {
    if (!waitingWorker) return;
    $('#update-bar').hidden = true;
    waitingWorker.postMessage('SKIP_WAITING');
  }
  function updateReady(worker) {
    waitingWorker = worker;
    if (!midLevel()) { applyUpdate(); return; }     // nothing to lose: update straight away
    $('#update-bar').hidden = false;                // mid-level: let the player choose when
  }
  function watch(reg) {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) updateReady(reg.waiting);
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) updateReady(nw);
      });
    });
  }
  function checkForUpdates(manual) {
    if (!swReg) { if (manual) toast('Updates work once the game is online over https'); return; }
    swReg.update().then(function () {
      if (manual && !swReg.installing && !swReg.waiting) toast('You have the latest version (' + APP_VERSION + ')');
    }).catch(function () { if (manual) toast('Couldn’t check for updates. Are you offline?'); });
  }
  $('#btn-update-now').addEventListener('click', function () { Sfx.play('click'); applyUpdate(); });
  $('#btn-check-update').addEventListener('click', function () { Sfx.play('click'); checkForUpdates(true); });
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloading) return; reloading = true; location.reload(); });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      watch(reg);
      setInterval(function () { checkForUpdates(false); }, 30 * 60 * 1000);       // every 30 minutes
      document.addEventListener('visibilitychange', function () { if (!document.hidden) checkForUpdates(false); });
    }).catch(function () { /* offline support is optional */ });
  }
  // If an update arrived mid-level, apply it as soon as the player is back on a menu.
  setInterval(function () { if (waitingWorker && !midLevel() && !reloading && current !== 'game') applyUpdate(); }, 2000);
  // Debug/test hook (harmless): lets automated tests drive the game.
  window.ChromaDock = { G: G, startLevel: startLevel, tryMove: tryMove, save: function () { return save; }, renderer: renderer };
})();
