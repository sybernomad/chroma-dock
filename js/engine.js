/*
 * Chroma Dock — puzzle engine (shared by the game, the hint worker and the level generator).
 *
 * Rules
 *  - Swipe a block: it slides until something stops it (wall, block, generator, wrong-colour gate).
 *  - Blocks can be any polyomino (1x1, bars, squares, L-shapes...). Every cell moves together.
 *  - A block exits when every cell of it can slide straight out through gates of its colour, so a
 *    gate must be at least as wide as the block's footprint in that direction.
 *  - A 1x1 block that slides onto an elevator pad stops on it. Larger blocks can't ride elevators:
 *    an elevator pad is an obstacle for them.
 *  - After every move, each elevator steps one cell along its track (ping-pong), carrying any
 *    block standing on it. An elevator waits if the next cell is covered by a block or another elevator.
 *  - After elevators move, each generator with blocks left drops its next block onto its outlet
 *    cell if that cell is empty.
 *  - Locked gates: a gate with a key colour stays shut (it acts as a wall) until no blocks of the key
 *    colour remain, counting blocks still queued in generators. Then it opens for good.
 *  - The level is complete when every block (including generator blocks) has exited.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  var DIR_NAMES = ['up', 'right', 'down', 'left'];

  // Shape catalogue. Index is stored in level data as the 4th block field. Cells are offsets from
  // the anchor (top-left of the bounding box). Append new shapes at the end to keep levels stable.
  var SHAPES = [
    { id: 'o',   name: 'Block',      cells: [[0, 0]] },
    { id: 'h2',  name: 'Bar',        cells: [[0, 0], [1, 0]] },
    { id: 'v2',  name: 'Bar',        cells: [[0, 0], [0, 1]] },
    { id: 'h3',  name: 'Long bar',   cells: [[0, 0], [1, 0], [2, 0]] },
    { id: 'v3',  name: 'Long bar',   cells: [[0, 0], [0, 1], [0, 2]] },
    { id: 'sq',  name: 'Crate',      cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { id: 'L1',  name: 'Corner',     cells: [[0, 0], [0, 1], [1, 1]] },
    { id: 'L2',  name: 'Corner',     cells: [[0, 0], [1, 0], [0, 1]] },
    { id: 'L3',  name: 'Corner',     cells: [[0, 0], [1, 0], [1, 1]] },
    { id: 'L4',  name: 'Corner',     cells: [[1, 0], [0, 1], [1, 1]] },
    { id: 'L4a', name: 'L-block',    cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
    { id: 'L4b', name: 'L-block',    cells: [[0, 0], [1, 0], [2, 0], [0, 1]] },
    { id: 'L4c', name: 'L-block',    cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
    { id: 'L4d', name: 'L-block',    cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    { id: 'Td',  name: 'T-block',    cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { id: 'Tu',  name: 'T-block',    cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    { id: 'Tr',  name: 'T-block',    cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { id: 'Tl',  name: 'T-block',    cells: [[1, 0], [0, 1], [1, 1], [1, 2]] },
    { id: 'Sh',  name: 'Zigzag',     cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    { id: 'Zh',  name: 'Zigzag',     cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    { id: 'Sv',  name: 'Zigzag',     cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
    { id: 'Zv',  name: 'Zigzag',     cells: [[1, 0], [0, 1], [1, 1], [0, 2]] }
  ];
  SHAPES.forEach(function (s, i) {
    s.index = i; s.w = 0; s.h = 0;
    s.cells.forEach(function (c) { s.w = Math.max(s.w, c[0] + 1); s.h = Math.max(s.h, c[1] + 1); });
  });

  // Level format:
  // { map: ["#######", "#.....#", ...]  ('#' wall, '.' floor; full grid incl. border)
  //   blocks: [[x,y,c,shape?]], doors: [[x,y,c,lockColour?]], lifts: [{path:[[x,y],...]}],
  //   gens: [{x,y,dir:'down', queue:[c,...]}], name?, tip?, opt? }
  function compile(level) {
    var H = level.map.length, W = level.map[0].length;
    var solid = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) solid[y * W + x] = level.map[y][x] === '#' ? 1 : 0;
    var door = new Int8Array(W * H).fill(-1), doorLock = new Int8Array(W * H).fill(-1);
    (level.doors || []).forEach(function (d) {
      var i = d[1] * W + d[0]; door[i] = d[2]; solid[i] = 1;
      if (d[3] !== undefined && d[3] !== null) doorLock[i] = d[3];
    });
    var gens = (level.gens || []).map(function (g) {
      solid[g.y * W + g.x] = 1;
      var v = DIRS[g.dir];
      return { x: g.x, y: g.y, dir: g.dir, ox: g.x + v[0], oy: g.y + v[1], queue: g.queue.slice() };
    });
    var lifts = (level.lifts || []).map(function (l) { return { path: l.path.map(function (p) { return [p[0], p[1]]; }) }; });
    var shapeOff = SHAPES.map(function (s) { return s.cells.map(function (c) { return c[1] * W + c[0]; }); });
    return { W: W, H: H, solid: solid, door: door, doorLock: doorLock, gens: gens, lifts: lifts, level: level, shapeOff: shapeOff };
  }

  function initialState(C) {
    var lv = C.level, id = 1;
    var st = {
      blocks: (lv.blocks || []).map(function (b) { return { id: id++, x: b[0], y: b[1], c: b[2], s: b[3] || 0 }; }),
      lifts: C.lifts.map(function () { return { i: 0, d: 1 }; }),
      gens: C.gens.map(function () { return 0; }),
      nextId: id
    };
    spawnStep(C, st, { spawns: [] });
    return st;
  }

  function cloneState(s) {
    return {
      blocks: s.blocks.map(function (b) { return { id: b.id, x: b.x, y: b.y, c: b.c, s: b.s || 0 }; }),
      lifts: s.lifts.map(function (l) { return { i: l.i, d: l.d }; }),
      gens: s.gens.slice(),
      nextId: s.nextId
    };
  }

  function cellsOf(b) { return SHAPES[b.s || 0].cells.map(function (c) { return [b.x + c[0], b.y + c[1]]; }); }

  // Index of the block covering cell (x,y), or -1.
  function blockAt(s, x, y) {
    for (var i = 0; i < s.blocks.length; i++) {
      var b = s.blocks[i], cells = SHAPES[b.s || 0].cells;
      for (var k = 0; k < cells.length; k++) if (b.x + cells[k][0] === x && b.y + cells[k][1] === y) return i;
    }
    return -1;
  }
  // Block whose anchor is (x,y) (and shape sh, if given) — solver moves are expressed this way.
  // Two blocks can share an anchor (an L-block's empty corner can hold another block), so pass the shape.
  function blockByAnchor(s, x, y, sh) {
    for (var i = 0; i < s.blocks.length; i++) { var b = s.blocks[i]; if (b.x === x && b.y === y && (sh === undefined || (b.s || 0) === sh)) return i; }
    return blockAt(s, x, y);
  }
  function liftPos(C, s, li) { return C.lifts[li].path[s.lifts[li].i]; }
  function liftAt(C, s, x, y) {
    for (var i = 0; i < C.lifts.length; i++) { var p = liftPos(C, s, i); if (p[0] === x && p[1] === y) return i; }
    return -1;
  }

  function occupancy(C, s) {
    var occ = new Int16Array(C.W * C.H).fill(-1);
    for (var i = 0; i < s.blocks.length; i++) {
      var b = s.blocks[i], base = b.y * C.W + b.x, off = C.shapeOff[b.s || 0];
      for (var k = 0; k < off.length; k++) occ[base + off[k]] = i;
    }
    return occ;
  }

  function spawnStep(C, s, ev) {
    var occ = occupancy(C, s);
    for (var gi = 0; gi < C.gens.length; gi++) {
      var g = C.gens[gi], k = s.gens[gi];
      if (k >= g.queue.length) continue;
      var oi = g.oy * C.W + g.ox;
      if (occ[oi] >= 0) continue;
      var b = { id: s.nextId++, x: g.ox, y: g.oy, c: g.queue[k], s: 0 };
      s.blocks.push(b); occ[oi] = s.blocks.length - 1;
      s.gens[gi] = k + 1;
      ev.spawns.push({ id: b.id, gen: gi, x: b.x, y: b.y, c: b.c });
    }
  }

  function liftStep(C, s, ev) {
    var occ = occupancy(C, s);
    for (var li = 0; li < C.lifts.length; li++) {
      var path = C.lifts[li].path, L = s.lifts[li];
      if (path.length < 2) continue;
      var nd = L.d, ni = L.i + nd;
      if (ni < 0 || ni >= path.length) { nd = -nd; ni = L.i + nd; }
      var cur = path[L.i], tgt = path[ni], ci = cur[1] * C.W + cur[0], ti = tgt[1] * C.W + tgt[0];
      if (occ[ti] >= 0) continue;                               // blocked by a block: wait
      if (liftAt(C, s, tgt[0], tgt[1]) >= 0) continue;          // blocked by another elevator
      var carried = occ[ci];
      L.i = ni; L.d = nd;
      var mv = { lift: li, from: cur, to: tgt, carry: null };
      if (carried >= 0) {
        var cb = s.blocks[carried]; cb.x = tgt[0]; cb.y = tgt[1]; mv.carry = cb.id;
        occ[ci] = -1; occ[ti] = carried;
      }
      ev.lifts.push(mv);
    }
  }

  // Shared slide resolution on raw arrays (used by move(), the fast solver and the heuristic).
  // occ: cell -> block index; pad: cell -> lift index (-1 none). Returns {to, exit} or null.
  // present: bitmask of colours still in play (locks keyed on them stay shut).
  function slideRaw(C, occ, pad, anchor, off, c, bi, step, present) {
    var N = C.W * C.H, multi = off.length > 1, q = anchor, k, n, i;
    for (;;) {
      var blocked = false, hitGate = false;
      for (k = 0; k < off.length; k++) {
        n = q + off[k] + step;
        if (n < 0 || n >= N) { blocked = true; break; }
        if (occ[n] >= 0 && occ[n] !== bi) { blocked = true; break; }
        var dc = C.door[n];
        if (dc >= 0) { if (dc === c && !((present >> C.doorLock[n]) & 1 && C.doorLock[n] >= 0)) hitGate = true; else { blocked = true; break; } }
        else if (C.solid[n]) { blocked = true; break; }
        else if (multi && pad[n] >= 0) { blocked = true; break; }
      }
      if (blocked) break;
      if (hitGate) {
        // Every cell must have a clear lane ending in a gate of its colour.
        var ok = true;
        for (k = 0; k < off.length && ok; k++) {
          i = q + off[k];
          for (;;) {
            i += step;
            if (i < 0 || i >= N) { ok = false; break; }
            var d2 = C.door[i];
            if (d2 >= 0) { if (d2 !== c || (C.doorLock[i] >= 0 && (present >> C.doorLock[i]) & 1)) ok = false; break; }
            if (C.solid[i] || (occ[i] >= 0 && occ[i] !== bi) || (multi && pad[i] >= 0)) { ok = false; break; }
          }
        }
        if (ok) return { to: q, exit: true };
        break;
      }
      q += step;
      if (!multi && pad[q] >= 0) break;
    }
    if (q === anchor) return null;
    return { to: q, exit: false };
  }

  function padGrid(C, s) {
    var pad = new Int8Array(C.W * C.H).fill(-1);
    for (var li = 0; li < C.lifts.length; li++) { var p = liftPos(C, s, li); pad[p[1] * C.W + p[0]] = li; }
    return pad;
  }

  // Try to move block index bi in direction dir. Returns {state, events} or null if nothing moves.
  function move(C, s, bi, dir) {
    var b = s.blocks[bi]; if (!b) return null;
    var v = DIRS[dir], step = v[1] * C.W + v[0], anchor = b.y * C.W + b.x;
    var r = slideRaw(C, occupancy(C, s), padGrid(C, s), anchor, C.shapeOff[b.s || 0], b.c, bi, step, presentMask(C, s));
    if (!r) return null;
    var tx = r.to % C.W, ty = Math.floor(r.to / C.W);
    var ns = cloneState(s);
    var ev = { slide: { id: b.id, from: [b.x, b.y], to: [tx, ty], exit: r.exit ? [tx + v[0], ty + v[1]] : null, c: b.c, s: b.s || 0, dir: dir }, lifts: [], spawns: [] };
    if (r.exit) ns.blocks.splice(bi, 1); else { ns.blocks[bi].x = tx; ns.blocks[bi].y = ty; }
    liftStep(C, ns, ev);
    spawnStep(C, ns, ev);
    return { state: ns, events: ev };
  }

  // Colours still in play: on the board or waiting in a generator.
  function presentMask(C, s) {
    var m = 0, i;
    for (i = 0; i < s.blocks.length; i++) m |= 1 << s.blocks[i].c;
    for (i = 0; i < C.gens.length; i++) for (var k = s.gens[i]; k < C.gens[i].queue.length; k++) m |= 1 << C.gens[i].queue[k];
    return m;
  }
  function gateLocked(C, s, x, y, mask) {
    var lk = C.doorLock[y * C.W + x]; if (lk < 0) return false;
    if (mask === undefined) mask = presentMask(C, s);
    return !!((mask >> lk) & 1);
  }

  function isWon(C, s) {
    if (s.blocks.length) return false;
    for (var i = 0; i < C.gens.length; i++) if (s.gens[i] < C.gens[i].queue.length) return false;
    return true;
  }

  // ---------- State keys ----------
  // [nBlocks, blockCodes(sorted, (pos*32+shape)*8+colour)..., liftCodes(i*2+fwd)..., genCounters...]
  function blockCode(pos, sh, c) { return (pos * 32 + sh) * 8 + c; }
  function encode(C, s) {
    var codes = s.blocks.map(function (b) { return blockCode(b.y * C.W + b.x, b.s || 0, b.c); }).sort(function (a, b) { return a - b; });
    var k = String.fromCharCode(codes.length);
    for (var i = 0; i < codes.length; i++) k += String.fromCharCode(codes[i] + 32);
    for (i = 0; i < s.lifts.length; i++) k += String.fromCharCode(33 + s.lifts[i].i * 2 + (s.lifts[i].d > 0 ? 1 : 0));
    for (i = 0; i < s.gens.length; i++) k += String.fromCharCode(33 + s.gens[i]);
    return k;
  }
  function hash(C, s) { return encode(C, s); }

  function makeExpander(C) {
    var W = C.W, N = C.W * C.H, NL = C.lifts.length, NG = C.gens.length;
    var occ = new Int16Array(N).fill(-1), pad = new Int8Array(N).fill(-1);
    var steps = [-W, 1, W, -1];
    var pos = [], shp = [], col = [], lifti = new Int32Array(NL), liftd = new Int32Array(NL), genk = new Int32Array(NG);
    function decode(key) {
      var n = key.charCodeAt(0), j = 1;
      pos.length = 0; shp.length = 0; col.length = 0;
      for (var i = 0; i < n; i++, j++) { var c = key.charCodeAt(j) - 32; col.push(c & 7); shp.push((c >> 3) & 31); pos.push(c >> 8); }
      for (i = 0; i < NL; i++, j++) { var lc = key.charCodeAt(j) - 33; lifti[i] = lc >> 1; liftd[i] = (lc & 1) ? 1 : -1; }
      for (i = 0; i < NG; i++, j++) genk[i] = key.charCodeAt(j) - 33;
    }
    function mark(arrPos, arrShp, n, set) {
      for (var i = 0; i < n; i++) { var off = C.shapeOff[arrShp[i]]; for (var k = 0; k < off.length; k++) occ[arrPos[i] + off[k]] = set ? i : -1; }
    }
    var npos = [], nshp = [], ncol = [];
    return function expand(key, cb) {
      decode(key);
      var n = pos.length, i, li, pp;
      for (li = 0; li < NL; li++) { pp = C.lifts[li].path[lifti[li]]; pad[pp[1] * W + pp[0]] = li; }
      mark(pos, shp, n, true);
      var present = 0;
      for (i = 0; i < n; i++) present |= 1 << col[i];
      for (var gq = 0; gq < NG; gq++) for (var kq = genk[gq]; kq < C.gens[gq].queue.length; kq++) present |= 1 << C.gens[gq].queue[kq];
      var results = [];
      for (var bi = 0; bi < n; bi++) {
        for (var d = 0; d < 4; d++) {
          var r = slideRaw(C, occ, pad, pos[bi], C.shapeOff[shp[bi]], col[bi], bi, steps[d], present);
          if (r) results.push([bi, d, r.to, r.exit]);
        }
      }
      mark(pos, shp, n, false);
      for (li = 0; li < NL; li++) { pp = C.lifts[li].path[lifti[li]]; pad[pp[1] * W + pp[0]] = -1; }

      for (var ri = 0; ri < results.length; ri++) {
        var res = results[ri], mb = res[0];
        npos.length = 0; nshp.length = 0; ncol.length = 0;
        for (i = 0; i < n; i++) {
          if (i === mb) { if (res[3]) continue; npos.push(res[2]); } else npos.push(pos[i]);
          nshp.push(shp[i]); ncol.push(col[i]);
        }
        mark(npos, nshp, npos.length, true);
        var nli = [], nld = [];
        for (li = 0; li < NL; li++) { nli.push(lifti[li]); nld.push(liftd[li]); }
        for (li = 0; li < NL; li++) {
          var path = C.lifts[li].path; if (path.length < 2) continue;
          var dd = nld[li], ni = nli[li] + dd;
          if (ni < 0 || ni >= path.length) { dd = -dd; ni = nli[li] + dd; }
          var cur = path[nli[li]], tgt = path[ni], ci = cur[1] * W + cur[0], ti = tgt[1] * W + tgt[0];
          if (occ[ti] >= 0) continue;
          var blockedByLift = false;
          for (var lj = 0; lj < NL; lj++) { if (lj === li) continue; var op = C.lifts[lj].path[nli[lj]]; if (op[1] * W + op[0] === ti) { blockedByLift = true; break; } }
          if (blockedByLift) continue;
          nli[li] = ni; nld[li] = dd;
          var cb2 = occ[ci];
          if (cb2 >= 0) { npos[cb2] = ti; occ[ci] = -1; occ[ti] = cb2; }
        }
        var ngk = [];
        for (var gi = 0; gi < NG; gi++) {
          var g = C.gens[gi], k = genk[gi];
          if (k < g.queue.length) {
            var oi = g.oy * W + g.ox;
            if (occ[oi] < 0) { npos.push(oi); nshp.push(0); ncol.push(g.queue[k]); occ[oi] = npos.length - 1; k++; }
          }
          ngk.push(k);
        }
        mark(npos, nshp, npos.length, false);
        var codes = new Array(npos.length);
        for (i = 0; i < npos.length; i++) codes[i] = blockCode(npos[i], nshp[i], ncol[i]);
        codes.sort(function (a, b) { return a - b; });
        var key2 = String.fromCharCode(codes.length);
        for (i = 0; i < codes.length; i++) key2 += String.fromCharCode(codes[i] + 32);
        for (li = 0; li < NL; li++) key2 += String.fromCharCode(33 + nli[li] * 2 + (nld[li] > 0 ? 1 : 0));
        var won = codes.length === 0;
        for (gi = 0; gi < NG; gi++) { key2 += String.fromCharCode(33 + ngk[gi]); if (ngk[gi] < C.gens[gi].queue.length) won = false; }
        if (cb(key2, pos[mb], res[1], won, shp[mb])) return true;
      }
      return false;
    };
  }

  function rebuild(C, parent, goal) {
    var moves = [], cur = goal;
    while (parent.get(cur)) { var e = parent.get(cur); moves.unshift({ x: e[1] % C.W, y: Math.floor(e[1] / C.W), dir: DIR_NAMES[e[2]], s: e[3] }); cur = e[0]; }
    return moves;
  }

  // Breadth-first search for the shortest solution.
  // Returns {moves:[{x,y,dir}] (x,y = block anchor), states} or {moves:null, states, capped?}.
  function solve(C, start, maxStates, maxDepth) {
    maxStates = maxStates || 300000; maxDepth = maxDepth || 1e9;
    if (isWon(C, start)) return { moves: [], states: 1 };
    var startK = encode(C, start);
    var parent = new Map(); parent.set(startK, null);
    var expand = makeExpander(C);
    var frontier = [startK], depth = 0, goal = null, capped = false;
    while (frontier.length && !goal && !capped && depth < maxDepth) {
      var next = [];
      for (var f = 0; f < frontier.length && !goal && !capped; f++) {
        var pk = frontier[f];
        expand(pk, function (ck, p, d, won, sh) {
          if (parent.has(ck)) return false;
          parent.set(ck, [pk, p, d, sh]);
          if (won) { goal = ck; return true; }
          if (parent.size >= maxStates) { capped = true; return true; }
          next.push(ck); return false;
        });
      }
      frontier = next; depth++;
    }
    if (!goal) return { moves: null, states: parent.size, capped: capped || (depth >= maxDepth && frontier.length > 0) };
    return { moves: rebuild(C, parent, goal), states: parent.size };
  }

  // Static "slides to exit" distance for a shape/colour from each anchor cell (walls only).
  function exitDist(C, sh, c) {
    C._hd = C._hd || {};
    var key = sh * 8 + c; if (C._hd[key]) return C._hd[key];
    var N = C.W * C.H, steps = [-C.W, 1, C.W, -1], off = C.shapeOff[sh];
    var occ = new Int16Array(N).fill(-1), pad = new Int8Array(N).fill(-1);
    var hasDoor = false; for (var i = 0; i < N; i++) if (C.door[i] === c) hasDoor = true;
    var arr = new Float32Array(N).fill(hasDoor ? 5 : 0);
    if (hasDoor) {
      for (var s = 0; s < N; s++) {
        var fits = true; for (var k = 0; k < off.length; k++) { var cc = s + off[k]; if (cc >= N || C.solid[cc]) { fits = false; break; } }
        if (!fits) continue;
        var dist = new Map(); dist.set(s, 0); var q = [s], found = -1;
        for (var h = 0; h < q.length && found < 0; h++) {
          var p = q[h], dp = dist.get(p);
          for (var d = 0; d < 4 && found < 0; d++) {
            var r = slideRaw(C, occ, pad, p, off, c, -2, steps[d], 0);
            if (!r) continue;
            if (r.exit) found = dp + 1;
            else if (!dist.has(r.to)) { dist.set(r.to, dp + 1); q.push(r.to); }
          }
        }
        arr[s] = found > 0 ? found : 5;
      }
    }
    C._hd[key] = arr; return arr;
  }

  // Weighted best-first search (fast, not guaranteed optimal). Same return shape as solve().
  function solveBest(C, start, maxStates, weight) {
    maxStates = maxStates || 200000; weight = weight || 1.5;
    if (isWon(C, start)) return { moves: [], states: 1 };
    var NL = C.lifts.length, NG = C.gens.length;
    function H(key) {
      var n = key.charCodeAt(0), h = 0, j = 1;
      for (var i = 0; i < n; i++, j++) { var code = key.charCodeAt(j) - 32; h += exitDist(C, (code >> 3) & 31, code & 7)[code >> 8]; }
      j += NL;
      for (var gi = 0; gi < NG; gi++, j++) h += (C.gens[gi].queue.length - (key.charCodeAt(j) - 33)) * 2;
      return h;
    }
    var heapF = [], heapK = [], heapG = [];
    function swap(a, b) { var t = heapF[a]; heapF[a] = heapF[b]; heapF[b] = t; t = heapK[a]; heapK[a] = heapK[b]; heapK[b] = t; t = heapG[a]; heapG[a] = heapG[b]; heapG[b] = t; }
    function push(f, k, g) {
      var i = heapF.length; heapF.push(f); heapK.push(k); heapG.push(g);
      while (i > 0) { var p = (i - 1) >> 1; if (heapF[p] <= heapF[i]) break; swap(i, p); i = p; }
    }
    function pop() {
      var k = heapK[0], g = heapG[0], lf = heapF.pop(), lk = heapK.pop(), lg = heapG.pop();
      if (heapF.length) {
        heapF[0] = lf; heapK[0] = lk; heapG[0] = lg; var i = 0, n = heapF.length;
        for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && heapF[l] < heapF[m]) m = l; if (r < n && heapF[r] < heapF[m]) m = r; if (m === i) break; swap(i, m); i = m; }
      }
      return [k, g];
    }
    var startK = encode(C, start);
    var parent = new Map(); parent.set(startK, null);
    var gBest = new Map(); gBest.set(startK, 0);
    var expand = makeExpander(C), goal = null;
    push(weight * H(startK), startK, 0);
    while (heapF.length && !goal) {
      var top = pop(), pk = top[0], g = top[1];
      if (gBest.get(pk) < g) continue;
      expand(pk, function (ck, p, d, won, sh) {
        var ng = g + 1, old = gBest.get(ck);
        if (old !== undefined && old <= ng) return false;
        gBest.set(ck, ng); parent.set(ck, [pk, p, d, sh]);
        if (won) { goal = ck; return true; }
        push(ng + weight * H(ck), ck, ng);
        return false;
      });
      if (parent.size >= maxStates) break;
    }
    if (!goal) return { moves: null, states: parent.size, capped: parent.size >= maxStates };
    return { moves: rebuild(C, parent, goal), states: parent.size };
  }

  // Practical solver: exact BFS when the space is small, otherwise best-first.
  function solveAny(C, start, opts) {
    opts = opts || {};
    var r = solve(C, start, opts.bfsCap || 60000);
    if (r.moves) { r.exact = true; return r; }
    if (!r.capped) return r; // proven unsolvable
    var best = null, total = r.states;
    var ws = opts.weights || [1.3, 2, 3];
    for (var i = 0; i < ws.length; i++) {
      var b = solveBest(C, start, opts.bestCap || 200000, ws[i]);
      total += b.states;
      if (b.moves && (!best || b.moves.length < best.moves.length)) best = b;
      if (best && opts.firstOnly) break;
    }
    if (best) { best.exact = false; best.work = total; return best; }
    return { moves: null, states: total, capped: true };
  }

  return {
    DIRS: DIRS, DIR_NAMES: DIR_NAMES, SHAPES: SHAPES, compile: compile, initialState: initialState, cloneState: cloneState,
    move: move, isWon: isWon, hash: hash, encode: encode, solve: solve, solveBest: solveBest, solveAny: solveAny,
    presentMask: presentMask, gateLocked: gateLocked, blockAt: blockAt, blockByAnchor: blockByAnchor, cellsOf: cellsOf, liftAt: liftAt, liftPos: liftPos
  };
});
