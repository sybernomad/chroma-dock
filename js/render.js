/* Chroma Dock — canvas renderer and animation timeline. */
(function () {
  'use strict';
  var E = window.Engine;

  var COLORS = ['#ff4d6d', '#3a86ff', '#ffc20e', '#2ecc71', '#a259ff', '#ff8a1f'];
  var COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'];

  var THEMES = {
    midnight: { floor: '#262650', floorAlt: '#22224a', wall: '#3d3d7d', wallTop: '#5050a0', wallShadow: '#14142c', track: 'rgba(160,170,255,.20)', pad: ['#c3c9e8', '#7d86b3'], frame: '#191935', glow: 1 },
    sunset:   { floor: '#5b2a4f', floorAlt: '#552749', wall: '#86385e', wallTop: '#a8487a', wallShadow: '#2a0f22', track: 'rgba(255,200,180,.22)', pad: ['#ffd9c9', '#c0868f'], frame: '#2a0f22', glow: 1 },
    mint:     { floor: '#164a47', floorAlt: '#134441', wall: '#22706a', wallTop: '#2e9188', wallShadow: '#062220', track: 'rgba(180,255,235,.20)', pad: ['#d4fff4', '#82b9ae'], frame: '#062220', glow: 1 },
    space:    { floor: '#121a45', floorAlt: '#0f163d', wall: '#2a2f7a', wallTop: '#3d44a8', wallShadow: '#03051a', track: 'rgba(200,170,255,.22)', pad: ['#e0d6ff', '#8f83c9'], frame: '#03051a', glow: 1.4, stars: true },
    paper:    { floor: '#f3ead9', floorAlt: '#ede2cf', wall: '#b9a484', wallTop: '#d3c09f', wallShadow: '#8a7658', track: 'rgba(90,70,40,.18)', pad: ['#ffffff', '#b8b0a2'], frame: '#a89272', glow: 0.5 }
  };

  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, amt) { var c = hexToRgb(h); var f = function (v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); }; return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')'; }
  function rgba(h, a) { var c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  var ease = {
    outCubic: function (p) { return 1 - Math.pow(1 - p, 3); },
    inOut: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    outBack: function (p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    slide: function (p) { return p < 0.15 ? (p / 0.15) * (p / 0.15) * 0.08 : 0.08 + (1 - Math.pow(1 - (p - 0.15) / 0.85, 2)) * 0.92; }
  };

  // ---------- Symbols (colour-blind aid) ----------
  function symbol(ctx, c, x, y, r) {
    ctx.beginPath();
    switch (c % 6) {
      case 0: ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); break;
      case 1: ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
      case 2: ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.75); ctx.lineTo(x - r * 0.95, y + r * 0.75); ctx.closePath(); break;
      case 3: var t = r * 0.36; ctx.moveTo(x - t, y - r); ctx.lineTo(x + t, y - r); ctx.lineTo(x + t, y - t); ctx.lineTo(x + r, y - t); ctx.lineTo(x + r, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + r); ctx.lineTo(x - t, y + r); ctx.lineTo(x - t, y + t); ctx.lineTo(x - r, y + t); ctx.lineTo(x - r, y - t); ctx.lineTo(x - t, y - t); ctx.closePath(); break;
      case 4: for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad); } ctx.closePath(); break;
      case 5: for (var k = 0; k < 6; k++) { var b = Math.PI / 6 + k * Math.PI / 3; ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath(); break;
    }
  }

  // ---------- Polyomino outlines ----------
  var outlineCache = {};
  // Clockwise outline vertices (grid units) of a hole-free, edge-connected set of cells.
  function outline(cells) {
    var key = JSON.stringify(cells); if (outlineCache[key]) return outlineCache[key];
    var set = {}; cells.forEach(function (c) { set[c[0] + ',' + c[1]] = 1; });
    var edges = {}, start = null;
    cells.forEach(function (c) {
      var x = c[0], y = c[1];
      if (!set[x + ',' + (y - 1)]) edges[x + ',' + y] = [x + 1, y];
      if (!set[(x + 1) + ',' + y]) edges[(x + 1) + ',' + y] = [x + 1, y + 1];
      if (!set[x + ',' + (y + 1)]) edges[(x + 1) + ',' + (y + 1)] = [x, y + 1];
      if (!set[(x - 1) + ',' + y]) edges[x + ',' + (y + 1)] = [x, y];
    });
    start = Object.keys(edges)[0];
    var pts = [], cur = start, guard = 0;
    do { var p = cur.split(',').map(Number); pts.push(p); var n = edges[cur]; cur = n[0] + ',' + n[1]; } while (cur !== start && ++guard < 200);
    // drop collinear points
    var out = pts.filter(function (p, i) {
      var a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
    });
    outlineCache[key] = out; return out;
  }
  // Inset a rectilinear clockwise polygon. padFor(nx,ny) gives the inset for an edge with inward normal (nx,ny).
  function inset(pts, padFor) {
    var n = pts.length, res = [];
    for (var i = 0; i < n; i++) {
      var a = pts[(i + n - 1) % n], p = pts[i], b = pts[(i + 1) % n];
      var d1x = Math.sign(p[0] - a[0]), d1y = Math.sign(p[1] - a[1]), d2x = Math.sign(b[0] - p[0]), d2y = Math.sign(b[1] - p[1]);
      var n1x = -d1y, n1y = d1x, n2x = -d2y, n2y = d2x, p1 = padFor(n1x, n1y), p2 = padFor(n2x, n2y);
      res.push([p[0] + n1x * p1 + n2x * p2, p[1] + n1y * p1 + n2y * p2]);
    }
    return res;
  }
  function polyPath(ctx, pts, r) {
    var n = pts.length; ctx.beginPath();
    var l = pts[n - 1], f = pts[0];
    ctx.moveTo((l[0] + f[0]) / 2, (l[1] + f[1]) / 2);
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n], o = pts[(i + n - 1) % n];
      var rr2 = Math.min(r, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2, Math.hypot(p[0] - o[0], p[1] - o[1]) / 2);
      ctx.arcTo(p[0], p[1], q[0], q[1], rr2);
    }
    ctx.closePath();
  }
  function shapeInfo(si) {
    var sh = E.SHAPES[si || 0], cx = 0, cy = 0;
    sh.cells.forEach(function (c) { cx += c[0] + 0.5; cy += c[1] + 0.5; });
    return { cells: sh.cells, w: sh.w, h: sh.h, cx: cx / sh.cells.length, cy: cy / sh.cells.length };
  }

  // Draw any block. px,py = pixel top-left of the anchor cell, cs = cell size.
  function drawPiece(ctx, skin, c, si, px, py, cs, opts) {
    opts = opts || {};
    var info = shapeInfo(si);
    if (info.cells.length === 1) { drawBlock(ctx, skin, c, px + cs / 2, py + cs / 2, cs * 0.84, opts); return; }
    var col = COLORS[c % COLORS.length], t = opts.time || 0, pad = cs * 0.08;
    var base = outline(info.cells).map(function (v) { return [px + v[0] * cs, py + v[1] * cs]; });
    var body = inset(base, function () { return pad; });
    var x0 = px, y0 = py, x1 = px + info.w * cs, y1 = py + info.h * cs;
    var symX = px + info.cx * cs, symY = py + info.cy * cs, showSym = opts.symbols !== false;
    ctx.save();
    if (skin === 'neon') {
      ctx.shadowColor = col; ctx.shadowBlur = cs * 0.35;
      polyPath(ctx, body, cs * 0.2); ctx.fillStyle = rgba(col, opts.light ? 0.5 : 0.16); ctx.fill();
      ctx.lineWidth = Math.max(2, cs * 0.07); ctx.strokeStyle = shade(col, 0.25); ctx.stroke();
      ctx.shadowBlur = 0;
      polyPath(ctx, inset(base, function () { return pad * 2.6; }), cs * 0.12); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 0.5); ctx.stroke();
      if (showSym) { symbol(ctx, c, symX, symY, cs * 0.2); ctx.fillStyle = shade(col, 0.5); ctx.fill(); }
      ctx.restore(); return;
    }
    var r = skin === 'jelly' ? cs * 0.3 : skin === 'pixel' ? 0 : skin === 'gem' ? cs * 0.1 : cs * 0.22;
    var bevel = cs * 0.1;
    // drop shadow
    ctx.save(); ctx.translate(0, cs * 0.08); polyPath(ctx, body, r); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); ctx.restore();
    // base (bevel colour) and face
    polyPath(ctx, body, r); ctx.fillStyle = shade(col, -0.38); ctx.fill();
    var face = inset(base, function (nx, ny) { return ny < 0 ? pad + bevel : pad; });
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(col, skin === 'jelly' ? 0.3 : 0.18)); g.addColorStop(1, shade(col, -0.12));
    polyPath(ctx, face, r); ctx.fillStyle = g; ctx.fill();
    ctx.save(); polyPath(ctx, face, r); ctx.clip();
    if (skin === 'gem') {
      var inner = inset(base, function () { return pad * 3.2; });
      var g2 = ctx.createLinearGradient(x0, y0, x1, y1); g2.addColorStop(0, shade(col, 0.45)); g2.addColorStop(1, shade(col, 0.05));
      polyPath(ctx, inner, cs * 0.06); ctx.fillStyle = g2; ctx.fill();
      var sp = (Math.sin(t / 600 + px * 0.05) + 1) / 2;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + sp * 0.4) + ')'; ctx.beginPath(); ctx.arc(px + cs * 0.32, py + cs * 0.3, cs * 0.05, 0, 7); ctx.fill();
    } else if (skin === 'pixel') {
      ctx.lineWidth = Math.max(2, cs * 0.1); ctx.strokeStyle = shade(col, 0.35); polyPath(ctx, face, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(px + pad * 2, py + pad * 2, cs * 0.1, cs * 0.1);
    } else {
      // gloss strip along every top-facing run of cells
      var set = {}; info.cells.forEach(function (cc) { set[cc[0] + ',' + cc[1]] = 1; });
      info.cells.forEach(function (cc) {
        if (set[cc[0] + ',' + (cc[1] - 1)]) return;
        var lx = set[(cc[0] - 1) + ',' + cc[1]] && !set[(cc[0] - 1) + ',' + (cc[1] - 1)] ? 0 : pad * 1.4;
        var rx = set[(cc[0] + 1) + ',' + cc[1]] && !set[(cc[0] + 1) + ',' + (cc[1] - 1)] ? 0 : pad * 1.4;
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        ctx.fillRect(px + cc[0] * cs + lx, py + cc[1] * cs + pad * 1.6, cs - lx - rx, cs * 0.2);
      });
      if (skin === 'jelly') {
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(px + cs * 0.36, py + cs * 0.27, cs * 0.18, cs * 0.09, -0.5, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    // subtle grooves so the piece reads as heavy cargo
    if (skin !== 'pixel') {
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = Math.max(1, cs * 0.03);
      polyPath(ctx, inset(base, function (nx, ny) { return (ny < 0 ? pad + bevel : pad) + cs * 0.1; }), Math.max(0, r - cs * 0.1)); ctx.stroke();
    }
    if (showSym) {
      symbol(ctx, c, symX, symY, cs * 0.2); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
      ctx.lineWidth = Math.max(1, cs * 0.025); ctx.strokeStyle = shade(col, -0.35); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Block skins ----------
  function drawBlock(ctx, skin, c, cx, cy, size, opts) {
    opts = opts || {};
    var col = COLORS[c % COLORS.length], s = size, x = cx - s / 2, y = cy - s / 2, t = opts.time || 0;
    var showSym = opts.symbols !== false;
    ctx.save();
    if (skin === 'neon') {
      ctx.shadowColor = col; ctx.shadowBlur = s * 0.35;
      rr(ctx, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.2);
      ctx.fillStyle = rgba(col, opts.light ? 0.5 : 0.16); ctx.fill();
      ctx.lineWidth = Math.max(2, s * 0.08); ctx.strokeStyle = shade(col, 0.25); ctx.stroke();
      if (showSym) { symbol(ctx, c, cx, cy, s * 0.2); ctx.fillStyle = shade(col, 0.5); ctx.fill(); }
      ctx.restore(); return;
    }
    if (skin === 'pixel') {
      var b = Math.max(2, Math.round(s * 0.12));
      ctx.fillStyle = shade(col, -0.45); ctx.fillRect(x, y + b * 0.5, s, s);
      ctx.fillStyle = col; ctx.fillRect(x, y, s, s - b * 0.5);
      ctx.fillStyle = shade(col, 0.35); ctx.fillRect(x, y, s, b); ctx.fillRect(x, y, b, s - b * 0.5);
      ctx.fillStyle = shade(col, -0.25); ctx.fillRect(x + s - b, y + b, b, s - b * 1.5); ctx.fillRect(x + b, y + s - b * 1.5, s - b, b);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x + b, y + b, b, b);
      if (showSym) { ctx.imageSmoothingEnabled = false; symbol(ctx, c, cx, cy - b * 0.2, s * 0.2); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); }
      ctx.restore(); return;
    }
    // shadow
    rr(ctx, x + s * 0.02, y + s * 0.1, s * 0.96, s * 0.96, s * 0.24);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    if (skin === 'gem') {
      var m = s * 0.22;
      ctx.beginPath(); ctx.moveTo(x + m, y); ctx.lineTo(x + s - m, y); ctx.lineTo(x + s, y + m); ctx.lineTo(x + s, y + s - m); ctx.lineTo(x + s - m, y + s); ctx.lineTo(x + m, y + s); ctx.lineTo(x, y + s - m); ctx.lineTo(x, y + m); ctx.closePath();
      ctx.fillStyle = shade(col, -0.15); ctx.fill();
      var ix = x + s * 0.24, iy = y + s * 0.24, is = s * 0.52;
      var facets = [[x + m, y, x + s - m, y, ix + is, iy, ix, iy, 0.35], [x + s, y + m, x + s, y + s - m, ix + is, iy + is, ix + is, iy, 0.05],
        [x + s - m, y + s, x + m, y + s, ix, iy + is, ix + is, iy + is, -0.35], [x, y + s - m, x, y + m, ix, iy, ix, iy + is, 0.15]];
      facets.forEach(function (f) { ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(f[2], f[3]); ctx.lineTo(f[4], f[5]); ctx.lineTo(f[6], f[7]); ctx.closePath(); ctx.fillStyle = shade(col, f[8]); ctx.fill(); });
      var g = ctx.createLinearGradient(ix, iy, ix + is, iy + is); g.addColorStop(0, shade(col, 0.45)); g.addColorStop(1, col);
      ctx.fillStyle = g; ctx.fillRect(ix, iy, is, is);
      var sp = (Math.sin(t / 600 + cx * 0.05) + 1) / 2;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + sp * 0.4) + ')'; ctx.beginPath(); ctx.arc(ix + is * 0.25, iy + is * 0.25, s * 0.05, 0, 7); ctx.fill();
      if (showSym) { symbol(ctx, c, cx, cy, s * 0.16); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); }
      ctx.restore(); return;
    }
    var radius = skin === 'jelly' ? s * 0.34 : s * 0.22;
    var grad = ctx.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, shade(col, skin === 'jelly' ? 0.3 : 0.18)); grad.addColorStop(1, shade(col, -0.18));
    rr(ctx, x, y, s, s, radius); ctx.fillStyle = grad; ctx.fill();
    // bottom bevel
    ctx.save(); rr(ctx, x, y, s, s, radius); ctx.clip();
    ctx.fillStyle = shade(col, -0.35); ctx.fillRect(x, y + s * 0.86, s, s * 0.2);
    ctx.restore();
    if (skin === 'jelly') {
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x + s * 0.34, y + s * 0.24, s * 0.2, s * 0.1, -0.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x + s * 0.7, y + s * 0.22, s * 0.05, 0, 7); ctx.fill();
    } else {
      rr(ctx, x + s * 0.1, y + s * 0.07, s * 0.8, s * 0.3, s * 0.14);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    }
    if (showSym) { symbol(ctx, c, cx, cy + s * 0.03, s * 0.19); ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.025); ctx.strokeStyle = shade(col, -0.35); ctx.stroke(); }
    ctx.restore();
  }

  // Padlock icon: body in the key colour (with its symbol), white shackle. open = unlatched.
  function drawPadlock(ctx, x, y, size, col, sym, open) {
    var bw = size, bh = size * 0.78, by = y - bh * 0.2;
    ctx.save();
    ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = open ? 'rgba(255,255,255,.75)' : '#f2f2f8'; ctx.lineCap = 'round';
    ctx.beginPath();
    var sr = bw * 0.3, sx = x + (open ? bw * 0.22 : 0), sy = by - (open ? size * 0.12 : 0);
    ctx.arc(sx, sy, sr, Math.PI, 0); ctx.lineTo(sx + sr, sy + size * 0.12);
    if (!open) { ctx.moveTo(sx - sr, sy); ctx.lineTo(sx - sr, sy + size * 0.12); }
    ctx.stroke();
    rr(ctx, x - bw / 2, by, bw, bh, size * 0.16);
    ctx.fillStyle = col; ctx.globalAlpha = open ? 0.8 : 1; ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
    if (sym >= 0) { symbol(ctx, sym, x, by + bh / 2, bh * 0.26); ctx.fillStyle = '#fff'; ctx.fill(); }
    else if (!open) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(x, by + bh * 0.45, bh * 0.12, 0, 7); ctx.fill(); ctx.fillRect(x - bh * 0.05, by + bh * 0.45, bh * 0.1, bh * 0.28); }
    ctx.restore();
  }

  // ---------- Renderer ----------
  function Renderer(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.skin = 'classic'; this.theme = THEMES.midnight; this.themeName = 'midnight'; this.symbols = true;
    this.C = null; this.vis = new Map(); this.liftVis = []; this.anim = null; this.particles = []; this.fx = []; this.trail = null;
    this.hint = null; this.selected = null; this.static = null; this.stars = [];
    var self = this;
    this.loop = function (t) { self.frame(t); requestAnimationFrame(self.loop); };
    requestAnimationFrame(this.loop);
  }
  var P = Renderer.prototype;

  P.setTheme = function (name) { this.themeName = THEMES[name] ? name : 'midnight'; this.theme = THEMES[this.themeName]; this.buildStatic(); };
  P.setSkin = function (name) { this.skin = name; };
  P.setSymbols = function (v) { this.symbols = v; this.buildStatic(); };

  P.setLevel = function (C, state) {
    this.C = C; this.particles = []; this.fx = []; this.trail = null; this.hint = null; this.selected = null; this.anim = null; this.state = null;
    this.computeSpans();
    this.layout(); this.snap(state);
  };

  P.layout = function () {
    var r = this.cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr; this.cw = r.width; this.ch = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    if (!this.C) return;
    var cs = Math.floor(Math.min(r.width / this.C.W, r.height / this.C.H));
    this.cs = cs; this.ox = Math.round((r.width - cs * this.C.W) / 2); this.oy = Math.round((r.height - cs * this.C.H) / 2);
    this.stars = []; for (var i = 0; i < 40; i++) this.stars.push([Math.random() * r.width, Math.random() * r.height, Math.random()]);
    this.buildStatic();
  };

  P.cellFromPoint = function (clientX, clientY) {
    var r = this.cv.getBoundingClientRect();
    return { x: Math.floor((clientX - r.left - this.ox) / this.cs), y: Math.floor((clientY - r.top - this.oy) / this.cs), fx: (clientX - r.left - this.ox) / this.cs, fy: (clientY - r.top - this.oy) / this.cs };
  };

  P.inwardDir = function (x, y) {
    var C = this.C, best = null;
    E.DIR_NAMES.forEach(function (d) { var v = E.DIRS[d], nx = x + v[0], ny = y + v[1]; if (nx >= 0 && ny >= 0 && nx < C.W && ny < C.H && !C.solid[ny * C.W + nx] && !best) best = d; });
    return best || 'down';
  };

  P.buildStatic = function () {
    if (!this.C || !this.cs) return;
    var C = this.C, cs = this.cs, T = this.theme, dpr = this.dpr;
    var oc = document.createElement('canvas'); oc.width = C.W * cs * dpr; oc.height = C.H * cs * dpr;
    var g = oc.getContext('2d'); g.scale(dpr, dpr);
    // frame
    rr(g, 0, 0, C.W * cs, C.H * cs, cs * 0.35); g.fillStyle = T.frame; g.fill();
    // floor
    for (var y = 0; y < C.H; y++) for (var x = 0; x < C.W; x++) {
      if (C.solid[y * C.W + x]) continue;
      g.fillStyle = (x + y) % 2 ? T.floor : T.floorAlt; g.fillRect(x * cs, y * cs, cs, cs);
    }
    // soft inner shadow under walls
    for (y = 0; y < C.H; y++) for (x = 0; x < C.W; x++) {
      if (!C.solid[y * C.W + x] || C.door[y * C.W + x] >= 0) continue;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x * cs, y * cs + cs * 0.12, cs, cs);
    }
    // lift tracks
    C.lifts.forEach(function (l) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); l.path.forEach(function (p, i) { g[i ? 'lineTo' : 'moveTo']((p[0] + 0.5) * cs, (p[1] + 0.5) * cs); });
      g.strokeStyle = T.track; g.lineWidth = cs * 0.5; g.stroke();
      g.setLineDash([cs * 0.08, cs * 0.14]); g.strokeStyle = T.track; g.lineWidth = cs * 0.82; g.globalAlpha = 0.5; g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      l.path.forEach(function (p) { g.fillStyle = T.track; g.beginPath(); g.arc((p[0] + 0.5) * cs, (p[1] + 0.5) * cs, cs * 0.08, 0, 7); g.fill(); });
    });
    // walls
    for (y = 0; y < C.H; y++) for (x = 0; x < C.W; x++) {
      var i = y * C.W + x; if (!C.solid[i] || C.door[i] >= 0) continue;
      var isGen = C.gens.some(function (gg) { return gg.x === x && gg.y === y; }); if (isGen) continue;
      var border = x === 0 || y === 0 || x === C.W - 1 || y === C.H - 1;
      var p = border ? cs * 0.06 : cs * 0.05;
      rr(g, x * cs + p, y * cs + p + cs * 0.06, cs - 2 * p, cs - 2 * p, cs * 0.16); g.fillStyle = T.wallShadow; g.fill();
      rr(g, x * cs + p, y * cs + p, cs - 2 * p, cs - 2 * p, cs * 0.16); g.fillStyle = border ? T.wall : T.wallTop; g.fill();
      rr(g, x * cs + p + cs * 0.12, y * cs + p + cs * 0.08, cs - 2 * p - cs * 0.24, cs * 0.16, cs * 0.08); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
    }
    this.static = oc;
  };

  P.snap = function (state) {
    var prev = this.state, C0 = this.C, self = this;
    if (prev && C0 && prev !== state && this.spans) {
      var before = E.presentMask(C0, prev), after = E.presentMask(C0, state), opened = [];
      this.spans.forEach(function (sp) { if (sp.lock >= 0 && ((before >> sp.lock) & 1) && !((after >> sp.lock) & 1)) opened.push(sp); });
      if (opened.length && state.blocks.length < prev.blocks.length + 2) {
        opened.forEach(function (sp) { for (var k = 0; k < sp.n; k++) { self.burst(sp.x0 + sp.ax * k + 0.5, sp.y0 + sp.ay * k + 0.5, COLORS[sp.c], 10); self.fx.push({ type: 'flash', x: sp.x0 + sp.ax * k, y: sp.y0 + sp.ay * k, color: '#ffffff', life: 1, decay: 1.8 }); } });
        if (this.onUnlock) this.onUnlock();
      }
    }
    this.anim = null; this.state = state;
    var m = new Map(), old = this.vis;
    state.blocks.forEach(function (b) { var o = old.get(b.id); m.set(b.id, { x: b.x, y: b.y, c: b.c, sh: b.s || 0, s: 1, a: 1, sq: 0, sqd: null }); });
    this.vis = m;
    var C = this.C;
    this.liftVis = state.lifts.map(function (l, i) { var p = C.lifts[i].path[l.i]; return { x: p[0], y: p[1] }; });
  };

  P.busy = function () { return !!this.anim; };

  P.finish = function () {
    if (!this.anim) return;
    var a = this.anim; this.anim = null;
    this.snap(a.finalState); a.done && a.done();
  };

  P.animateMove = function (ev, newState, done, hooks) {
    this.finish();
    var self = this, phases = [], C = this.C, sl = ev.slide;
    var vb = this.vis.get(sl.id);
    var dist = Math.abs(sl.to[0] - sl.from[0]) + Math.abs(sl.to[1] - sl.from[1]);
    var sinfo = shapeInfo(sl.s), sv = E.DIRS[sl.dir], ext = sv[0] ? sinfo.w : sinfo.h;
    var tx = sl.to[0], ty = sl.to[1], gateCells = [];
    if (sl.exit) {
      tx += sv[0] * Math.max(1, ext * 0.75); ty += sv[1] * Math.max(1, ext * 0.75);
      sinfo.cells.forEach(function (cc) {
        var gx = sl.to[0] + cc[0], gy = sl.to[1] + cc[1], guard = 0;
        while (C.door[gy * C.W + gx] < 0 && guard++ < 40) { gx += sv[0]; gy += sv[1]; }
        if (!gateCells.some(function (q) { return q[0] === gx && q[1] === gy; })) gateCells.push([gx, gy]);
      });
    }
    var full = Math.abs(tx - sl.from[0]) + Math.abs(ty - sl.from[1]);
    hooks = hooks || {};
    phases.push({
      dur: Math.min(70 + 52 * full, 460),
      start: function () { hooks.slide && hooks.slide(full); },
      update: function (p) {
        var e = ease.slide(p); vb.x = sl.from[0] + (tx - sl.from[0]) * e; vb.y = sl.from[1] + (ty - sl.from[1]) * e;
        if (!self.trail || self.trail.vb !== vb) self.trail = { vb: vb, from: sl.from, w: sinfo.w, h: sinfo.h, c: sl.c, end: 0 };
      },
      end: function (skip) {
        vb.x = tx; vb.y = ty;
        if (self.trail && self.trail.vb === vb) { self.trail.end = performance.now(); self.trail.to = [tx, ty]; }
        if (sl.exit) {
          if (!skip) {
            gateCells.forEach(function (q) { self.burst(q[0] + 0.5, q[1] + 0.5, COLORS[sl.c], Math.round(16 / Math.sqrt(gateCells.length))); self.fx.push({ type: 'flash', x: q[0], y: q[1], color: COLORS[sl.c], life: 1, decay: 2.6 }); });
            hooks.exit && hooks.exit(sl.c);
          }
        } else if (!skip) {
          vb.sq = 1; vb.sqd = sl.dir; vb.sqt = performance.now();
          if (dist > 0) { self.impact(tx, ty, sinfo, sv); hooks.bump && hooks.bump(); }
        }
      }
    });
    if (sl.exit) phases.push({ dur: 150, update: function (p) { vb.s = 1 - p; vb.a = 1 - p; }, end: function () { vb.s = 0; vb.a = 0; } });
    if (ev.lifts.length) {
      phases.push({
        dur: 230, start: function () { hooks.lift && hooks.lift(); },
        update: function (p) {
          var e = ease.inOut(p);
          ev.lifts.forEach(function (lm) {
            var lv = self.liftVis[lm.lift]; lv.x = lm.from[0] + (lm.to[0] - lm.from[0]) * e; lv.y = lm.from[1] + (lm.to[1] - lm.from[1]) * e;
            if (lm.carry) { var b = self.vis.get(lm.carry); if (b) { b.x = lv.x; b.y = lv.y; } }
          });
        },
        end: function () {}
      });
    }
    if (ev.spawns.length) {
      phases.push({
        dur: 260,
        start: function () {
          ev.spawns.forEach(function (sp) { var g = C.gens[sp.gen]; self.vis.set(sp.id, { x: g.x, y: g.y, c: sp.c, sh: 0, s: 0.3, a: 1, sq: 0, sqd: null, sp: sp, g: g }); });
          hooks.spawn && hooks.spawn();
        },
        update: function (p) {
          ev.spawns.forEach(function (sp) { var b = self.vis.get(sp.id); if (!b) return; var e = ease.outBack(p); b.x = b.g.x + (sp.x - b.g.x) * Math.min(1, p * 1.4); b.y = b.g.y + (sp.y - b.g.y) * Math.min(1, p * 1.4); b.s = 0.3 + 0.7 * e; });
        },
        end: function () {}
      });
    }
    this.anim = { phases: phases, idx: 0, t: performance.now(), finalState: newState, done: done };
    phases[0].start && phases[0].start(); phases[0]._started = true;
  };

  // Soft glowing sparks plus an expanding ring. Units are grid cells and seconds.
  P.burst = function (cx, cy, color, n) {
    this.fx.push({ type: 'ring', x: cx, y: cy, color: color, life: 1, decay: 2.2, r0: 0.3, r1: 1.25 });
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 3.4;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 1.3 + Math.random() * 1.2, color: color, size: 0.05 + Math.random() * 0.09 });
    }
  };
  // A small puff of dust along the edge where a block comes to rest.
  P.impact = function (bx, by, info, v) {
    var ex = bx + info.w / 2 + v[0] * info.w / 2, ey = by + info.h / 2 + v[1] * info.h / 2, span = v[0] ? info.h : info.w;
    for (var i = 0; i < 5; i++) {
      var o = (Math.random() - 0.5) * span * 0.8, side = Math.random() < 0.5 ? -1 : 1;
      this.particles.push({ x: ex + (v[0] ? 0 : o), y: ey + (v[1] ? 0 : o), vx: (v[0] ? -v[0] * 0.4 : side * (0.6 + Math.random())), vy: (v[1] ? -v[1] * 0.4 : side * (0.6 + Math.random())),
        life: 0.7, decay: 2.4 + Math.random(), color: '#ffffff', size: 0.04 + Math.random() * 0.04, soft: true });
    }
  };

  P.frame = function (now) {
    var ctx = this.ctx, T = this.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (!this.C || !this.static) return;
    // advance animation
    var a = this.anim;
    while (a) {
      var ph = a.phases[a.idx], p = (now - a.t) / ph.dur;
      if (p < 1) { ph.update && ph.update(Math.max(0, p)); break; }
      ph.update && ph.update(1); ph.end && ph.end(false); a.idx++; a.t = now;
      if (a.idx >= a.phases.length) { this.anim = null; this.snap(a.finalState); a.done && a.done(); break; }
      var nx = a.phases[a.idx]; nx.start && nx.start(); nx._started = true;
    }
    var C = this.C, cs = this.cs, ox = this.ox, oy = this.oy, self = this;
    if (T.stars) { this.stars.forEach(function (s) { ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + 0.5 * Math.abs(Math.sin(now / 1500 + s[2] * 9))) + ')'; ctx.fillRect(s[0], s[1], 1.5, 1.5); }); }
    ctx.drawImage(this.static, ox, oy, C.W * cs, C.H * cs);
    ctx.save(); ctx.translate(ox, oy);
    // doors
    var pulse = (Math.sin(now / 380) + 1) / 2;
    var mask = this.state ? E.presentMask(C, this.state) : 0;
    (this.spans || []).forEach(function (sp) { self.drawDoor(ctx, sp, now, pulse, sp.lock >= 0 && ((mask >> sp.lock) & 1)); });
    // generators
    var st = this.state;
    C.gens.forEach(function (g, gi) { self.drawGen(ctx, g, st ? st.gens[gi] : 0, now); });
    // lift pads
    this.liftVis.forEach(function (lv, i) { self.drawPad(ctx, lv.x, lv.y, i, now); });
    // hint
    if (this.hint && !this.anim) this.drawHint(ctx, now);
    // motion trail behind a sliding block
    var tr = this.trail;
    if (tr) {
      var fade = tr.end ? 1 - (now - tr.end) / 220 : 1;
      if (fade <= 0) this.trail = null;
      else {
        var hx = tr.end ? tr.to[0] : tr.vb.x, hy = tr.end ? tr.to[1] : tr.vb.y;
        var x0 = Math.min(tr.from[0], hx), y0 = Math.min(tr.from[1], hy), x1 = Math.max(tr.from[0], hx) + tr.w, y1 = Math.max(tr.from[1], hy) + tr.h;
        if (Math.abs(hx - tr.from[0]) + Math.abs(hy - tr.from[1]) > 0.05) {
          var tg = ctx.createLinearGradient((tr.from[0] + tr.w / 2) * cs, (tr.from[1] + tr.h / 2) * cs, (hx + tr.w / 2) * cs, (hy + tr.h / 2) * cs);
          tg.addColorStop(0, rgba(COLORS[tr.c], 0)); tg.addColorStop(1, rgba(COLORS[tr.c], 0.32 * fade));
          var horizT = hy === tr.from[1], ins = cs * 0.2;
          ctx.fillStyle = tg; rr(ctx, x0 * cs + (horizT ? 0 : ins), y0 * cs + (horizT ? ins : 0), (x1 - x0) * cs - (horizT ? 0 : 2 * ins), (y1 - y0) * cs - (horizT ? 2 * ins : 0), cs * 0.2); ctx.fill();
        }
      }
    }
    // blocks
    var sel = this.selected;
    this.vis.forEach(function (b, id) {
      if (b.a <= 0) return;
      var info = shapeInfo(b.sh), cx = (b.x + info.w / 2) * cs, cy = (b.y + info.h / 2) * cs, size = cs * 0.84;
      ctx.save(); ctx.globalAlpha = b.a;
      if (b.s !== 1) { ctx.translate(cx, cy); ctx.scale(b.s, b.s); ctx.translate(-cx, -cy); }
      if (b.sq) {
        var k = (now - b.sqt) / 180; if (k >= 1) { b.sq = 0; } else {
          var amt = Math.sin(k * Math.PI) * 0.12, horiz = b.sqd === 'left' || b.sqd === 'right';
          ctx.translate(cx, cy); ctx.scale(horiz ? 1 - amt : 1 + amt * 0.6, horiz ? 1 + amt * 0.6 : 1 - amt); ctx.translate(-cx, -cy);
        }
      }
      if (self.skin === 'jelly' && !self.anim) { var w = Math.sin(now / 500 + id) * 0.015; ctx.translate(cx, cy + size / 2); ctx.scale(1 + w, 1 - w); ctx.translate(-cx, -cy - size / 2); }
      if (sel === id) {
        var ol = inset(outline(info.cells).map(function (v) { return [(b.x + v[0]) * cs, (b.y + v[1]) * cs]; }), function () { return cs * 0.02; });
        polyPath(ctx, ol, cs * 0.28); ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.5) + ')'; ctx.lineWidth = 3; ctx.stroke();
      }
      drawPiece(ctx, self.skin, b.c, b.sh, b.x * cs, b.y * cs, cs, { time: now, symbols: self.symbols, light: self.themeName === 'paper' });
      ctx.restore();
    });
    // glow effects: gate flashes, rings and sparks (additive light on dark themes)
    var dt = Math.min(0.05, (now - (this.lastT || now)) / 1000); this.lastT = now;
    var light = this.themeName === 'paper';
    ctx.save(); if (!light) ctx.globalCompositeOperation = 'lighter';
    for (var fi = this.fx.length - 1; fi >= 0; fi--) {
      var f = this.fx[fi]; f.life -= f.decay * dt;
      if (f.life <= 0) { this.fx.splice(fi, 1); continue; }
      if (f.type === 'ring') {
        var k2 = 1 - f.life, rad = (f.r0 + (f.r1 - f.r0) * ease.outCubic(k2)) * cs;
        ctx.globalAlpha = f.life * 0.7; ctx.strokeStyle = f.color; ctx.lineWidth = Math.max(1, cs * 0.09 * f.life);
        ctx.beginPath(); ctx.arc(f.x * cs, f.y * cs, rad, 0, 7); ctx.stroke();
      } else if (f.type === 'flash') {
        var gx = (f.x + 0.5) * cs, gy = (f.y + 0.5) * cs, gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, cs * 1.3);
        gr.addColorStop(0, rgba(f.color, 0.75 * f.life)); gr.addColorStop(1, rgba(f.color, 0));
        ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(gx - cs * 1.3, gy - cs * 1.3, cs * 2.6, cs * 2.6);
      }
    }
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var pt = this.particles[i], drag = Math.pow(0.04, dt);
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= drag; pt.vy *= drag; pt.life -= pt.decay * dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      var pr = pt.size * cs * (0.5 + pt.life * 0.5), ppx = pt.x * cs, ppy = pt.y * cs;
      ctx.globalAlpha = pt.life * (pt.soft ? 0.35 : 1);
      if (!pt.soft) { ctx.fillStyle = rgba(pt.color.charAt(0) === '#' ? pt.color : '#ffffff', 0.25); ctx.beginPath(); ctx.arc(ppx, ppy, pr * 2.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = pt.soft ? pt.color : shade(pt.color, 0.45); ctx.beginPath(); ctx.arc(ppx, ppy, pr, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  };

  // Group neighbouring gate cells of the same colour on the same side into one wide gate.
  P.computeSpans = function () {
    var C = this.C, self = this, seen = {}, spans = [];
    for (var y = 0; y < C.H; y++) for (var x = 0; x < C.W; x++) {
      var c = C.door[y * C.W + x]; if (c < 0 || seen[x + ',' + y]) continue;
      var d = this.inwardDir(x, y), v = E.DIRS[d], ax = v[1] ? 1 : 0, ay = v[0] ? 1 : 0; // axis along the gate
      var x1 = x, y1 = y;
      var lk = C.doorLock[y * C.W + x];
      while (C.door[(y1 + ay) * C.W + (x1 + ax)] === c && C.doorLock[(y1 + ay) * C.W + (x1 + ax)] === lk && self.inwardDir(x1 + ax, y1 + ay) === d) { x1 += ax; y1 += ay; }
      for (var k = 0, cx = x, cy = y; k <= Math.max(x1 - x, y1 - y); k++, cx += ax, cy += ay) seen[cx + ',' + cy] = 1;
      spans.push({ x0: x, y0: y, x1: x1, y1: y1, c: c, dir: d, n: Math.max(x1 - x, y1 - y) + 1, ax: ax, ay: ay, lock: lk });
    }
    this.spans = spans;
  };

  P.drawDoor = function (ctx, sp, now, pulse, locked) {
    var cs = this.cs, col = COLORS[sp.c], v = E.DIRS[sp.dir];
    var pad = cs * 0.08, px = sp.x0 * cs + pad, py = sp.y0 * cs + pad;
    var w = (sp.x1 - sp.x0 + 1) * cs - 2 * pad, h = (sp.y1 - sp.y0 + 1) * cs - 2 * pad;
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = locked ? 0 : cs * (0.25 + pulse * 0.25) * this.theme.glow;
    rr(ctx, px, py, w, h, cs * 0.2);
    var g = ctx.createLinearGradient(px, py, px + (v[0] === 0 ? 0 : w), py + (v[1] === 0 ? 0 : h));
    var inStart = v[0] < 0 || v[1] < 0; // gradient: bright on the board side
    g.addColorStop(inStart ? 1 : 0, shade(col, -0.55)); g.addColorStop(inStart ? 0 : 1, shade(col, 0.1));
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, cs * 0.06); ctx.strokeStyle = shade(col, 0.2); ctx.stroke();
    // chevrons flowing outward, one lane per cell
    ctx.save(); rr(ctx, px, py, w, h, cs * 0.2); ctx.clip();
    var out = [-v[0], -v[1]], off = (now / 900) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(2, cs * 0.07); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var lane = 0; lane < sp.n; lane++) {
      var cx = (sp.x0 + sp.ax * lane + 0.5) * cs, cy = (sp.y0 + sp.ay * lane + 0.5) * cs;
      for (var k = -1; k < 2; k++) {
        var t = (k + off) * cs * 0.34, ax = cx + out[0] * t, ay = cy + out[1] * t, wd = cs * 0.16;
        ctx.globalAlpha = 0.25 + 0.55 * (1 - Math.abs(k + off - 0.5) / 1.5);
        ctx.beginPath();
        ctx.moveTo(ax - out[0] * wd + out[1] * wd * 1.3, ay - out[1] * wd + out[0] * wd * 1.3);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax - out[0] * wd - out[1] * wd * 1.3, ay - out[1] * wd - out[0] * wd * 1.3);
        ctx.stroke();
      }
    }
    ctx.restore();
    var mx = ((sp.x0 + sp.x1) / 2 + 0.5) * cs, my = ((sp.y0 + sp.y1) / 2 + 0.5) * cs;
    if (locked) {
      // shut: grey it out, add bars and a padlock in the key colour
      ctx.save(); rr(ctx, px, py, w, h, cs * 0.2); ctx.fillStyle = 'rgba(20,20,35,.62)'; ctx.fill();
      ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = Math.max(2, cs * 0.06);
      for (var bar = 0; bar < sp.n * 3; bar++) {
        var t2 = (bar + 0.5) / (sp.n * 3);
        ctx.beginPath();
        if (sp.ax) { ctx.moveTo(px + w * t2, py); ctx.lineTo(px + w * t2, py + h); } else { ctx.moveTo(px, py + h * t2); ctx.lineTo(px + w, py + h * t2); }
        ctx.stroke();
      }
      ctx.restore();
      drawPadlock(ctx, mx, my, cs * 0.36, COLORS[sp.lock], this.symbols ? sp.lock : -1, false);
      ctx.restore(); return;
    }
    if (sp.lock >= 0) drawPadlock(ctx, mx - v[0] * cs * 0.22, my - v[1] * cs * 0.22, cs * 0.2, COLORS[sp.lock], -1, true);
    if (this.symbols) {
      var sx = mx + v[0] * cs * 0.24, sy = my + v[1] * cs * 0.24;
      symbol(ctx, sp.c, sx, sy, cs * 0.11); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.95; ctx.fill();
    }
    ctx.restore();
  };

  P.drawGen = function (ctx, g, used, now) {
    var cs = this.cs, px = g.x * cs, py = g.y * cs, pad = cs * 0.06, left = g.queue.length - used;
    var v = E.DIRS[g.dir];
    ctx.save();
    rr(ctx, px + pad, py + pad + cs * 0.05, cs - 2 * pad, cs - 2 * pad, cs * 0.18); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    var gr = ctx.createLinearGradient(px, py, px, py + cs); gr.addColorStop(0, '#5d6382'); gr.addColorStop(1, '#30344c');
    rr(ctx, px + pad, py + pad, cs - 2 * pad, cs - 2 * pad, cs * 0.18); ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = left ? '#ffd23f' : '#555a72'; ctx.setLineDash([cs * 0.1, cs * 0.08]); ctx.stroke(); ctx.setLineDash([]);
    var cx = px + cs / 2, cy = py + cs / 2;
    if (left) {
      var nc = g.queue[used], col = COLORS[nc];
      var bob = Math.sin(now / 300) * cs * 0.02;
      ctx.shadowColor = col; ctx.shadowBlur = cs * 0.25 * this.theme.glow;
      rr(ctx, cx - cs * 0.2, cy - cs * 0.2 + bob, cs * 0.4, cs * 0.4, cs * 0.1); ctx.fillStyle = col; ctx.fill(); ctx.shadowBlur = 0;
      if (this.symbols) { symbol(ctx, nc, cx, cy + bob, cs * 0.1); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); }
      // queue pips (upcoming colours)
      for (var k = 0; k < left; k++) {
        var qx = px + cs * 0.2 + k * cs * 0.16, qy = py + cs * 0.82;
        if (v[1] === 1) qy = py + cs * 0.2; // keep pips away from the outlet side
        ctx.beginPath(); ctx.arc(qx, qy, cs * 0.055, 0, 7); ctx.fillStyle = COLORS[g.queue[used + k]]; ctx.fill();
      }
      // outlet arrow
      ctx.fillStyle = '#ffd23f'; var ax = cx + v[0] * cs * 0.38, ay = cy + v[1] * cs * 0.38, w = cs * 0.09;
      ctx.beginPath(); ctx.moveTo(ax + v[0] * w, ay + v[1] * w); ctx.lineTo(ax - v[0] * w + v[1] * w, ay - v[1] * w + v[0] * w); ctx.lineTo(ax - v[0] * w - v[1] * w, ay - v[1] * w - v[0] * w); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = cs * 0.06; ctx.beginPath(); ctx.moveTo(cx - cs * 0.15, cy - cs * 0.15); ctx.lineTo(cx + cs * 0.15, cy + cs * 0.15); ctx.moveTo(cx + cs * 0.15, cy - cs * 0.15); ctx.lineTo(cx - cs * 0.15, cy + cs * 0.15); ctx.stroke();
    }
    ctx.restore();
  };

  P.drawPad = function (ctx, x, y, li, now) {
    var cs = this.cs, T = this.theme, s = cs * 0.94, cx = (x + 0.5) * cs, cy = (y + 0.5) * cs, px = cx - s / 2, py = cy - s / 2;
    ctx.save();
    rr(ctx, px, py + cs * 0.05, s, s, cs * 0.2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    var g = ctx.createLinearGradient(px, py, px + s, py + s); g.addColorStop(0, T.pad[0]); g.addColorStop(1, T.pad[1]);
    rr(ctx, px, py, s, s, cs * 0.2); ctx.fillStyle = g; ctx.fill();
    // hazard stripes border
    ctx.save(); rr(ctx, px, py, s, s, cs * 0.2); ctx.clip();
    ctx.fillStyle = 'rgba(255,200,40,.85)';
    var b = cs * 0.08;
    ctx.fillRect(px, py, s, b); ctx.fillRect(px, py + s - b, s, b); ctx.fillRect(px, py, b, s); ctx.fillRect(px + s - b, py, b, s);
    ctx.fillStyle = 'rgba(30,30,40,.7)';
    for (var k = -2; k < 12; k++) { var o = k * cs * 0.16; ctx.beginPath(); ctx.moveTo(px + o, py); ctx.lineTo(px + o + cs * 0.06, py); ctx.lineTo(px + o - cs * 0.04, py + b); ctx.lineTo(px + o - cs * 0.1, py + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(px + o, py + s - b); ctx.lineTo(px + o + cs * 0.06, py + s - b); ctx.lineTo(px + o - cs * 0.04, py + s); ctx.lineTo(px + o - cs * 0.1, py + s); ctx.fill(); }
    ctx.restore();
    // next-step arrow (where the elevator goes after the next move)
    var st = this.state; if (st && !this.anim) {
      var path = this.C.lifts[li].path, L = st.lifts[li], ni = L.i + L.d; if (ni < 0 || ni >= path.length) ni = L.i - L.d;
      var nxt = path[ni], dx = nxt[0] - path[L.i][0], dy = nxt[1] - path[L.i][1];
      var bob = (Math.sin(now / 250) + 1) * cs * 0.02;
      var ax = cx + dx * (cs * 0.5 + bob), ay = cy + dy * (cs * 0.5 + bob), w = cs * 0.11;
      ctx.fillStyle = 'rgba(255,210,63,.95)'; ctx.beginPath();
      ctx.moveTo(ax + dx * w, ay + dy * w); ctx.lineTo(ax - dx * w + dy * w, ay - dy * w + dx * w); ctx.lineTo(ax - dx * w - dy * w, ay - dy * w - dx * w); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  P.drawHint = function (ctx, now) {
    var h = this.hint, cs = this.cs, v = E.DIRS[h.dir];
    var bob = (Math.sin(now / 160) + 1) / 2;
    var blk = this.state && this.state.blocks.find(function (bb) { return bb.x === h.x && bb.y === h.y && (h.s === undefined || (bb.s || 0) === h.s); });
    var info = shapeInfo(blk ? blk.s : 0), cx = (h.x + info.w / 2) * cs, cy = (h.y + info.h / 2) * cs;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 + bob * 0.4) + ')'; ctx.lineWidth = 4; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -now / 30;
    polyPath(ctx, inset(outline(info.cells).map(function (q) { return [(h.x + q[0]) * cs, (h.y + q[1]) * cs]; }), function () { return 2; }), cs * 0.24); ctx.stroke(); ctx.setLineDash([]);
    var half = (v[0] ? info.w : info.h) / 2;
    var d = cs * (half + 0.25 + bob * 0.25), ax = cx + v[0] * d, ay = cy + v[1] * d, w = cs * 0.22;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(ax + v[0] * w, ay + v[1] * w); ctx.lineTo(ax - v[0] * w + v[1] * w, ay - v[1] * w + v[0] * w); ctx.lineTo(ax - v[0] * w * 0.4, ay - v[1] * w * 0.4); ctx.lineTo(ax - v[0] * w - v[1] * w, ay - v[1] * w - v[0] * w); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  window.BlockRender = { Renderer: Renderer, drawBlock: drawBlock, drawPiece: drawPiece, COLORS: COLORS, COLOR_NAMES: COLOR_NAMES, THEMES: THEMES, rr: rr, shade: shade };
})();
