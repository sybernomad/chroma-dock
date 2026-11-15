/* Runs the solver off the main thread so hints never freeze the game. */
importScripts('engine.js');
self.onmessage = function (e) {
  var C = Engine.compile(e.data.level);
  var r = Engine.solveAny(C, e.data.state, { bfsCap: 80000, bestCap: 300000, weights: [1.5, 3], firstOnly: true });
  self.postMessage({ id: e.data.id, move: r.moves && r.moves.length ? r.moves[0] : null, solvable: !!r.moves, remaining: r.moves ? r.moves.length : null, capped: !!r.capped });
};
