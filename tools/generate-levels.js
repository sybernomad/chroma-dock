#!/usr/bin/env node
/*
 * Chroma Dock level generator.
 * Builds hand-made tutorial levels plus seeded procedural levels, verifies every level with the
 * BFS solver, and writes js/levels.js. Re-run with:  node tools/generate-levels.js [seed]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');

const SEED = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 20261114);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- Hand-made tutorial levels ----------
const TUTORIAL = [
  { name: 'First Slide', tip: 'Swipe the block toward its matching gate. Blocks keep sliding until something stops them.',
    map: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    blocks: [[3, 5, 0]], doors: [[3, 0, 0]] },
  { name: 'Line It Up', tip: 'Walls stop a slide. Use them to line a block up with its gate.',
    map: ['#######', '##....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    blocks: [[1, 6, 0]], doors: [[6, 2, 0]] },
  { name: 'Stepping Stone', tip: 'Blocks stop each other too, so the order you move them matters. Undo is always free.',
    map: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    blocks: [[5, 1, 0], [5, 4, 1]], doors: [[0, 3, 0], [5, 7, 1]] },
];

// ---------- Difficulty curve ----------
// n = level number (1-based). Each tier lists ranges; target solution length rises within a tier.
const TIERS = [
  { from: 4,  to: 7,  w: [5, 5], h: [6, 6], colors: [2, 2], blocks: [2, 3], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.06, 0.14], len: [3, 6] },
  { from: 8,  to: 10, w: [5, 5], h: [7, 7], colors: [2, 3], blocks: [3, 3], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.08, 0.16], len: [6, 8] },
  { from: 11, to: 14, w: [5, 5], h: [6, 7], colors: [2, 2], blocks: [2, 2], lifts: [1, 1], gens: [0, 0], q: [0, 0], walls: [0.06, 0.12], len: [4, 7], tip: 'lift' },
  { from: 15, to: 20, w: [5, 6], h: [7, 7], colors: [2, 3], blocks: [3, 3], lifts: [1, 1], gens: [0, 0], q: [0, 0], walls: [0.08, 0.14], len: [7, 10] },
  { from: 21, to: 24, w: [5, 5], h: [6, 7], colors: [2, 2], blocks: [1, 2], lifts: [0, 0], gens: [1, 1], q: [2, 2], walls: [0.06, 0.12], len: [5, 8], tip: 'gen' },
  { from: 25, to: 30, w: [6, 6], h: [7, 7], colors: [3, 3], blocks: [2, 3], lifts: [0, 1], gens: [1, 1], q: [2, 3], walls: [0.10, 0.20], len: [10, 14], big: true },
  { from: 31, to: 40, w: [6, 6], h: [8, 8], colors: [3, 3], blocks: [3, 3], lifts: [1, 1], gens: [1, 1], q: [2, 2], walls: [0.10, 0.20], len: [12, 17], big: true },
  { from: 41, to: 50, w: [6, 6], h: [8, 8], colors: [3, 4], blocks: [3, 4], lifts: [1, 2], gens: [1, 1], q: [2, 3], walls: [0.10, 0.20], len: [14, 20], big: true },
  { from: 51, to: 60, w: [7, 7], h: [9, 9], colors: [4, 4], blocks: [3, 4], lifts: [2, 2], gens: [1, 2], q: [2, 2], walls: [0.10, 0.20], len: [16, 24], big: true },
  // ---- Shaped blocks (shape indexes from Engine.SHAPES) ----
  { from: 61, to: 64, w: [5, 5], h: [7, 7], colors: [2, 2], blocks: [2, 3], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.04, 0.10], len: [4, 8],
    shapes: [1, 2], minShaped: 1, mix: 0.5, tip: 'cargo' },
  { from: 65, to: 70, w: [6, 6], h: [8, 8], colors: [3, 3], blocks: [3, 4], lifts: [0, 1], gens: [0, 1], q: [2, 2], walls: [0.06, 0.14], len: [10, 15],
    shapes: [1, 2, 3, 4], minShaped: 2, mix: 0.5, big: true },
  { from: 71, to: 74, w: [6, 6], h: [7, 8], colors: [2, 3], blocks: [3, 3], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.04, 0.10], len: [6, 10],
    shapes: [5, 6, 7, 8, 9], extra: [1, 2], minShaped: 1, mix: 0.5, tip: 'odd' },
  { from: 75, to: 80, w: [7, 7], h: [9, 9], colors: [3, 4], blocks: [4, 4], lifts: [1, 2], gens: [1, 1], q: [2, 2], walls: [0.06, 0.14], len: [13, 22],
    shapes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], minShaped: 2, mix: 0.5, big: true },
  { from: 81, to: 84, w: [6, 6], h: [7, 8], colors: [2, 3], blocks: [3, 3], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.04, 0.10], len: [6, 11],
    shapes: [14, 15, 16, 17, 18, 19, 20, 21], extra: [1, 2, 6, 7], minShaped: 1, mix: 0.5, tip: 'twist' },
  { from: 85, to: 90, w: [7, 7], h: [9, 9], colors: [3, 4], blocks: [3, 4], lifts: [1, 1], gens: [0, 1], q: [2, 2], walls: [0.06, 0.12], len: [12, 18],
    shapes: [14, 15, 16, 17, 18, 19, 20, 21], extra: [1, 2, 3, 4, 5], minShaped: 2, mix: 0.5, big: true },
  { from: 91, to: 100, w: [7, 7], h: [9, 9], colors: [4, 4], blocks: [4, 4], lifts: [1, 2], gens: [1, 2], q: [2, 2], walls: [0.06, 0.13], len: [16, 24],
    shapes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], minShaped: 3, mix: 0.4, big: true },
  // ---- Locked gates: a gate opens once every block of its key colour has left ----
  { from: 101, to: 104, w: [6, 6], h: [7, 8], colors: [2, 3], blocks: [3, 3], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.06, 0.12], len: [6, 11],
    locks: [1, 1], shapes: [1, 2], mix: 0.3, tip: 'lock', introBlocks: [2, 3], introLen: [3, 6] },
  { from: 105, to: 110, w: [7, 7], h: [9, 9], colors: [3, 4], blocks: [4, 4], lifts: [0, 1], gens: [0, 1], q: [2, 2], walls: [0.06, 0.12], len: [12, 20],
    locks: [1, 2], shapes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 18, 19], mix: 0.4, big: true },
  // ---- Crowd control: boards packed with blocks ----
  { from: 111, to: 114, w: [6, 6], h: [8, 8], colors: [3, 3], blocks: [6, 7], lifts: [0, 0], gens: [0, 0], q: [0, 0], walls: [0.0, 0.06], len: [10, 16],
    locks: [0, 1], shapes: [1, 2], mix: 0.25, tip: 'crowd', introLen: [7, 11], big: true },
  { from: 115, to: 120, w: [7, 7], h: [9, 9], colors: [4, 4], blocks: [7, 8], lifts: [0, 1], gens: [0, 1], q: [2, 2], walls: [0.02, 0.08], len: [16, 26],
    locks: [1, 2], shapes: [1, 2, 3, 4, 5, 6, 7, 8, 9], mix: 0.3, big: true },
];
const TIPS = {
  lift: 'New: Elevators! A sliding block stops on an elevator pad. After every move, each elevator steps along its track and carries its block.',
  gen: 'New: Generators! When their outlet is clear, they drop a new block. Every generator block has to leave too.',
  cargo: 'New: Heavy cargo! Long blocks move as one piece, and they need a gate at least as wide as they are. They also can\u2019t ride elevators.',
  lock: 'New: Locked gates! A gate with a padlock stays shut until every block of the padlock\u2019s colour has left the board. Clear colours in the right order.',
  crowd: 'Crowd control! These docks are packed. Every block is in someone\u2019s way, so think about who moves first.',
  twist: 'New: T-blocks and zigzags! Their bumps catch on walls and other blocks, so watch every edge. A gate still has to be as wide as the whole block.',
  odd: 'New: Odd shapes! L-blocks and crates slide as one piece. Every part of the block needs a clear lane into its gate.',
};
const NAMES = ['Nudge', 'Crossing', 'Detour', 'Relay', 'Ricochet', 'Switchback', 'Bypass', 'Gridlock', 'Shuffle', 'Pivot', 'Cascade',
  'Overpass', 'Freight', 'Shuttle', 'Hoist', 'Pulley', 'Conveyor', 'Assembly', 'Dispatch', 'Junction', 'Sorting Yard', 'Signal',
  'Clockwork', 'Turnstile', 'Bottleneck', 'Labyrinth', 'Keystone', 'Counterweight', 'Rush Hour', 'Domino', 'Lockstep', 'Interchange',
  'Spillway', 'Paternoster', 'Foundry', 'Mainframe', 'Escapement', 'Kaleidoscope', 'Gearbox', 'Terminal', 'Switchyard', 'Overdrive',
  'Mechanism', 'Tangram', 'Gauntlet', 'Citadel', 'Orbit', 'Zenith', 'Apex', 'Paradox', 'Monolith', 'Odyssey', 'Grand Machine',
  'Megaplex', 'Finale', 'Encore', 'Masterwork',
  'Loading Dock', 'Flatbed', 'Long Haul', 'Payload', 'Forklift', 'Container Yard', 'Heavy Lift', 'Wide Load', 'Tonnage', 'Cargo Bay',
  'Elbow Room', 'Cornerstone', 'Crate Escape', 'Tetrad', 'Dogleg', 'Interlock', 'Jigsaw', 'Puzzle Box', 'Tessellate', 'Magnum Opus',
  'Plot Twist', 'Zigzag', 'Crossroads', 'Switchblade', 'Serpentine', 'Hairpin', 'Tangle', 'Slalom', 'Gridiron', 'Knot',
  'Overture', 'Crescendo', 'Labyrinth II', 'Clockmaker', 'Grandmaster', 'Long Night', 'Summit', 'Last Light', 'Endgame', 'Century',
  'Padlock', 'Keyholder', 'Combination', 'Deadbolt', 'Tumbler', 'Vault', 'Skeleton Key', 'Strongroom', 'Lockdown', 'Master Key',
  'Full House', 'Packed Lot', 'Sardines', 'Gridlock II', 'Bumper to Bumper', 'Standing Room', 'Peak Hour', 'Capacity', 'Overflow', 'Jam Session'];

function tierFor(n) { return TIERS.find(t => n >= t.from && n <= t.to); }

function makeCandidate(t, n) {
  const w = ri(t.w[0], t.w[1]), h = ri(t.h[0], t.h[1]);
  const W = w + 2, H = h + 2;
  const g = []; for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.'); }
  const interior = []; for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) interior.push([x, y]);
  const dens = t.walls[0] + rng() * (t.walls[1] - t.walls[0]);
  shuffle(interior).slice(0, Math.round(w * h * dens)).forEach(([x, y]) => { g[y][x] = '#'; });
  const isFloor = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && g[y][x] === '.';

  const nColors = ri(t.colors[0], t.colors[1]);
  const palette = shuffle([0, 1, 2, 3, 4, 5]).slice(0, nColors);
  const used = new Set();
  const key = (x, y) => x + ',' + y;

  // Decide block colours and shapes first so gates can be sized to fit them.
  const nBlocks = ri(t.blocks[0], t.blocks[1]);
  const specs = [];
  for (let i = 0; i < nBlocks; i++) {
    let sh = 0;
    if (t.shapes) {
      if (i < (t.minShaped || 0)) sh = pick(t.shapes);
      else if (rng() < (t.mix || 0)) sh = pick(t.shapes.concat(t.extra || []));
    }
    specs.push({ c: i < palette.length ? palette[i] : pick(palette), s: sh });
  }
  shuffle(specs);

  // Border slots: [x,y,inward dir]
  const border = [];
  for (let x = 1; x <= w; x++) { border.push([x, 0, 'down']); border.push([x, H - 1, 'up']); }
  for (let y = 1; y <= h; y++) { border.push([0, y, 'right']); border.push([W - 1, y, 'left']); }
  shuffle(border);
  const borderUsed = new Set();
  const nearUsed = (x, y) => { for (const u of borderUsed) { const [ux, uy] = u.split(',').map(Number); if (Math.abs(ux - x) + Math.abs(uy - y) <= 1) return true; } return false; };
  // Take a run of `len` border cells on one side (gate span). Returns array of [x,y,dir].
  function takeSpan(len) {
    for (const b of border) {
      const v = E.DIRS[b[2]], ax = v[1] ? 1 : 0, ay = v[0] ? 1 : 0;
      const cells = [];
      for (let k = 0; k < len; k++) cells.push([b[0] + ax * k, b[1] + ay * k, b[2]]);
      const ok = cells.every(([x, y]) => {
        if (borderUsed.has(key(x, y)) || nearUsed(x, y)) return false;
        if (ax && (x < 1 || x > w)) return false; if (ay && (y < 1 || y > h)) return false;
        return isFloor(x + v[0], y + v[1]);
      });
      if (!ok) continue;
      cells.forEach(([x, y]) => borderUsed.add(key(x, y)));
      return cells;
    }
    return null;
  }

  const doors = [];
  for (const c of palette) {
    // gate side is unknown until chosen, so size it for the widest footprint either way, then trim
    const mine = specs.filter(sp => sp.c === c).map(sp => E.SHAPES[sp.s]);
    const needH = Math.max(1, ...mine.map(sh => sh.w)), needV = Math.max(1, ...mine.map(sh => sh.h));
    const horizFirst = rng() < 0.5;
    let span = null;
    for (const horiz of (horizFirst ? [true, false] : [false, true])) {
      const len = horiz ? needH : needV;
      // try only slots on matching sides: horizontal gates live on top/bottom borders
      const saved = border.slice();
      border.sort((a, b) => ((a[2] === 'up' || a[2] === 'down') === horiz ? 0 : 1) - ((b[2] === 'up' || b[2] === 'down') === horiz ? 0 : 1));
      span = takeSpan(len);
      border.length = 0; saved.forEach(x => border.push(x));
      if (span && ((span[0][2] === 'up' || span[0][2] === 'down') === horiz)) break;
      if (span) { span.forEach(([x, y]) => borderUsed.delete(key(x, y))); span = null; }
    }
    if (!span) return null;
    span.forEach(([x, y]) => doors.push([x, y, c]));
  }

  // Locks: order the colours; a gate may only be keyed to a colour earlier in the order (no deadlocks).
  if (t.locks) {
    const order = shuffle(palette.slice()), nLocks = Math.min(ri(t.locks[0], t.locks[1]), order.length - 1);
    const lockable = shuffle(order.slice(1));
    for (let k = 0; k < nLocks; k++) {
      const c = lockable[k], p = order.indexOf(c), key = order[Math.floor(rng() * p)];
      doors.forEach(d => { if (d[2] === c) d[3] = key; });
    }
  }

  const gens = [];
  const nGens = ri(t.gens[0], t.gens[1]);
  for (let i = 0; i < nGens; i++) {
    const sp = takeSpan(1); if (!sp) return null; const b = sp[0];
    const qn = ri(t.q[0], t.q[1]); const queue = []; for (let k = 0; k < qn; k++) queue.push(pick(palette));
    gens.push({ x: b[0], y: b[1], dir: b[2], queue });
    const v = E.DIRS[b[2]]; used.add(key(b[0] + v[0], b[1] + v[1]));
  }

  const lifts = [];
  const nLifts = ri(t.lifts[0], t.lifts[1]);
  for (let i = 0; i < nLifts; i++) {
    let ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      const [sx, sy] = pick(interior); const horiz = rng() < 0.5; const L = ri(2, Math.min(4, (horiz ? w : h)));
      const p = []; let good = true;
      for (let k = 0; k < L; k++) { const x = sx + (horiz ? k : 0), y = sy + (horiz ? 0 : k); if (!isFloor(x, y) || used.has(key(x, y))) { good = false; break; } p.push([x, y]); }
      if (!good) continue;
      if (rng() < 0.5) p.reverse();
      p.forEach(([x, y]) => used.add(key(x, y)));
      lifts.push({ path: p }); ok = true;
    }
    if (!ok) return null;
  }

  // Place blocks (biggest first) on free floor.
  const blocks = [];
  specs.sort((a, b) => E.SHAPES[b.s].cells.length - E.SHAPES[a.s].cells.length);
  for (const sp of specs) {
    const cells = E.SHAPES[sp.s].cells; let placed = false;
    for (const [x, y] of shuffle(interior.slice())) {
      if (cells.every(([dx, dy]) => isFloor(x + dx, y + dy) && !used.has(key(x + dx, y + dy)))) {
        cells.forEach(([dx, dy]) => used.add(key(x + dx, y + dy)));
        blocks.push(sp.s ? [x, y, sp.c, sp.s] : [x, y, sp.c]); placed = true; break;
      }
    }
    if (!placed) return null;
  }
  // every palette colour must be present somewhere (block or generator) so no gate is decorative
  const present = new Set(blocks.map(b => b[2]).concat(...gens.map(gg => gg.queue)));
  if (palette.some(c => !present.has(c))) return null;

  return { map: g.map(r => r.join('')), blocks, doors, lifts, gens };
}

function evaluate(level, big, refine) {
  const C = E.compile(level);
  const s0 = E.initialState(C);
  const r = !big ? E.solve(C, s0, 400000)
    : refine ? E.solveAny(C, s0, { bfsCap: 300000, bestCap: 1500000, weights: [1.0, 1.15, 1.3, 1.6] })
    : E.solveAny(C, s0, { bfsCap: 40000, bestCap: 150000 });
  if (!r.moves) return null;
  // replay: count elevator carries
  let s = s0, carries = 0;
  for (const m of r.moves) {
    const bi = E.blockByAnchor(s, m.x, m.y, m.s); const res = E.move(C, s, bi, m.dir);
    carries += res.events.lifts.filter(l => l.carry).length; s = res.state;
  }
  if (!E.isWon(C, s)) throw new Error('replay mismatch');
  return { len: r.moves.length, states: r.work || r.states, carries, exact: r.exact !== false };
}

const FROM = Number((process.argv.find(a => a.startsWith('--from=')) || '--from=1').split('=')[1]);
const LAST = TIERS[TIERS.length - 1].to;

function generate() {
  const out = [];
  if (FROM > 1) {
    const existing = require('../js/levels.js');
    for (let i = 0; i < FROM - 1; i++) out.push(existing[i]);
    console.log('Keeping levels 1-' + (FROM - 1) + ' unchanged');
  }
  if (FROM <= 1) TUTORIAL.forEach((lv, i) => {
    const ev = evaluate(lv); if (!ev) throw new Error('tutorial ' + (i + 1) + ' unsolvable');
    out.push(Object.assign({}, lv, { opt: ev.len }));
  });
  for (let n = Math.max(4, FROM); n <= LAST; n++) {
    const t = tierFor(n);
    const pos = (n - t.from) / Math.max(1, t.to - t.from);
    const intro = !!(t.shapes && t.tip && n === t.from);   // first level with a new mechanic: keep it gentle
    const iLen = t.introLen || [3, 6];
    const minLen = intro ? iLen[0] : Math.round(t.len[0] + pos * (t.len[1] - t.len[0]) * 0.8);
    const maxLen = intro ? iLen[1] : Math.max(minLen + 1, t.len[1] + (pos > 0.5 ? 1 : 0));
    let best = null, bestScore = -Infinity, found = 0, attempts = 0, fallback = null;
    const t0 = Date.now();
    const budget = t.big ? 45000 : 60000, want = t.big ? 4 : 5;
    while (found < want && attempts < 4000 && Date.now() - t0 < budget) {
      attempts++;
      const lv = makeCandidate(intro && !t.introLen ? Object.assign({}, t, { blocks: [2, 2], walls: [0.08, 0.16] })
        : intro && t.introBlocks ? Object.assign({}, t, { blocks: t.introBlocks }) : t, n); if (!lv) continue;
      const ev = evaluate(lv, t.big); if (!ev) continue;
      if (lv.lifts.length && ev.carries === 0) continue;          // elevator must matter
      if (!t.big && lv.doors.some(d => d[3] !== undefined)) {      // a lock must change the solution
        const free = evaluate(Object.assign({}, lv, { doors: lv.doors.map(d => d.slice(0, 3)) }), false);
        if (free && free.len >= ev.len) continue;
      }
      if (ev.len < minLen || ev.len > maxLen) {
        // remember the closest miss in case the window can't be filled in time
        const miss = ev.len < minLen ? minLen - ev.len : ev.len - maxLen;
        if (!fallback || miss < fallback.miss) fallback = { miss, lv: Object.assign(lv, { opt: ev.len }) };
        continue;
      }
      found++;
      const score = intro ? -ev.len : t.big ? Math.log10(ev.states) * 3 + ev.len * 0.2 : ev.len + Math.log10(ev.states) * 0.8;
      if (score > bestScore) { bestScore = score; best = Object.assign(lv, { opt: ev.len, states: ev.states }); }
    }
    if (!best && fallback) { best = fallback.lv; console.log('  (L' + n + ': using closest candidate, ' + fallback.miss + ' moves outside target)'); }
    if (!best) throw new Error('could not generate level ' + n);
    if (t.big) { const ev2 = evaluate(best, true, true); if (ev2 && ev2.len < best.opt) best.opt = ev2.len; }
    best.name = NAMES[n - 4];
    if (t.tip && n === t.from) best.tip = TIPS[t.tip];
    delete best.states;
    out.push(best);
    if (n >= FROM) writeOut(out);   // save progress so a long run can be resumed with --from
    console.log(`L${n} ${best.name.padEnd(14)} opt=${best.opt} size=${best.map[0].length - 2}x${best.map.length - 2} blocks=${best.blocks.length} lifts=${best.lifts.length} gens=${best.gens.length} (${attempts} tries)`);
  }
  return out;
}

function writeOut(levels) {
  const body = levels.map(l => '  ' + JSON.stringify(l)).join(',\n');
  const file = `/* Generated by tools/generate-levels.js (seed ${SEED}). Every level is verified solvable; "opt" is the par move count. */\n` +
    `(function (root) {\n  var LEVELS = [\n${body}\n  ];\n  if (typeof module === 'object' && module.exports) module.exports = LEVELS; else root.LEVELS = LEVELS;\n})(typeof self !== 'undefined' ? self : this);\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'levels.js'), file);
}
const levels = generate();
writeOut(levels);
console.log('Wrote', levels.length, 'levels');
