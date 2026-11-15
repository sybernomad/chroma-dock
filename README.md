# Chroma Dock: Slide & Sort Puzzle

A portrait, mobile-first HTML5 puzzle game. Slide colourful blocks into their matching gates, ride elevators, empty the generators and beat the clock for bonus gems.

It's plain HTML, CSS and JavaScript with **no build step and no dependencies**, so it runs on GitHub Pages as-is.

## How it plays

- **Swipe** a block and it slides until something stops it: a wall, another block, a generator, or a gate of a different colour.
- Slide a block into the **gate of its own colour** and it leaves the board. A level is complete once every block is gone.
- **Elevators:** a block that slides onto an elevator pad stops there. After every move, each elevator steps one cell along its track (back and forth) and carries its block with it. The yellow arrow on a pad shows where it goes next.
- **Shaped blocks:** bars, long bars, 2×2 crates, L-blocks, T-blocks and zigzags slide as one piece. A gate has to be at least as wide as the block passing through it, and every cell of the block needs a clear lane into the gate. Only 1×1 blocks ride elevators; to bigger blocks, an elevator pad is an obstacle.
- **Locked gates:** a gate with a padlock acts like a wall until every block of the padlock's colour has left the board, including blocks still waiting in generators. Then it opens for good.
- **Generators:** when its outlet cell is empty, a generator drops its next block. The coloured pips show what's still queued, and every generated block has to escape too.
- **Timer:** each level has a bonus clock. It starts on your first move, so you can study the board first. Finish before it runs out to earn bonus gems. When time runs out you never lose; you just stop earning the bonus.
- **Stars:** ★★★ for finishing in par moves or fewer. Undo and Restart are always free.
- Other controls: tap a block, then tap a spot in the same row or column. On a keyboard, use the arrow keys or WASD, Tab to switch blocks, Z to undo, R to restart and H for a hint.

### Gems and the store
Gems are earned only in the game: 5 for a first clear, up to 12 for time left on the clock, and 3 for each new star. There's no real money and no way to buy gems. You can spend them on:
- **Power-ups:** Hint packs (the solver shows a move that leads toward a solution), Time Boosts (+15 seconds, which also revives an expired clock) and Level Skips.
- **Block skins:** Classic, Jelly, Pixel, Gemstone, Neon.
- **Board themes:** Midnight, Sunset, Mint, Paper (light), Deep Space.

Progress is saved in the browser with `localStorage`.

## Levels
There are 120 levels in 12 chapters: Warm Up, Going Up, Factory Floor, Clockwork, Rush Hour, Grand Machine, Heavy Cargo, Odd Shapes, Twists & Turns, Grand Finale, Locked Gates and Crowd Control. New mechanics arrive along the way:

| Level | New mechanic |
|---|---|
| 11 | Elevators |
| 21 | Generators |
| 61 | Bars |
| 71 | Crates and L-blocks |
| 81 | T-blocks and zigzags |
| 101 | Locked gates |
| 111 | Crowded boards (6–8 blocks) |

Within each stretch, boards get bigger, colours and blocks multiply, and solutions get longer.

The first three tutorial levels are hand-made. The rest come from `tools/generate-levels.js`, which uses a fixed random seed and proves every level solvable with the game's own solver. Easier levels use exact search, so their par is the true minimum. Bigger levels use a heuristic search, so their par is the best solution found and you might beat it.

```bash
node tools/generate-levels.js --from=121 # keep levels 1-120, generate new tiers (append new chapters this way)
node tools/generate-levels.js            # rebuild every level (~20 min; changes existing levels)
node tools/generate-levels.js 12345      # try a different seed
```
Tune the difficulty curve in the `TIERS` table at the top of that file. A tier's `shapes` list chooses which block shapes can appear; the shapes themselves are defined in `SHAPES` in `js/engine.js` (add new ones at the end so existing levels don't change). To add a chapter, add a tier and level names, a chapter entry in `CHAPTERS` in `js/app.js`, then run with `--from=<first new level>`. Players who already cleared the old last level get the new levels unlocked automatically.

## Debug options (testing)
**Settings → Debug** has two switches:
- **Unlock all levels** opens every level.
- **Infinite gems** shows ∞ and makes every store purchase free.

They sit on top of your real save, so switching them off brings back your actual progress and gem count. **Before publishing, set `DEBUG_MENU = false` at the top of `js/app.js`.** That hides the section and turns both switches off for every player.

## Install as an app (PWA)
Chroma Dock is an installable Progressive Web App:
- **Android / Chrome / Edge:** tap **📲 Install app** on the home screen, or use the browser's Install option.
- **iPhone / iPad:** the Install button shows the steps: Safari → Share → Add to Home Screen.
- Once installed it opens full screen in portrait, has its own icon (shaped to fit Android's icon styles), and works offline.

### Updates
The game checks for a new version when it opens, whenever you switch back to it, and every 30 minutes. You can also tap **Settings → Check for updates**.
- If you're on a menu or haven't started moving blocks, the update applies straight away.
- If you're mid-level, a **"A new version is ready · Update"** bar appears so you choose when to reload. Progress is never lost.

**To publish an update:**
```bash
node tools/release.js        # bumps the version (1.1.0 -> 1.1.1); use "minor" or an exact version if you like
git commit -am "Release" && git push
```
The bump changes `VERSION` in `sw.js`, which is how players' browsers notice the update. If you forget it, installed players keep the old version.

## Credits and licenses
The only third-party file is the Outfit font (SIL Open Font License 1.1). Its notice is in `THIRD_PARTY_NOTICES.md` and on the in-game Credits screen, and its license text ships in `fonts/`. Sound, music, graphics and icons are all generated by the game's own code, so they need no license.

## Run locally
Hints and offline support need a web server (browsers block them on `file://`), so serve the folder:
```bash
python -m http.server 8000     # then open http://localhost:8000
```

## Deploy to GitHub Pages
1. Commit and push this folder to a GitHub repo, with `index.html` at the repo root.
2. On GitHub, go to **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch*, then choose `main` and `/ (root)`.
3. Your game will be live at `https://<username>.github.io/<repo>/` within a minute or two.

The game is also an installable PWA (Add to Home Screen) and works offline. **When you ship an update, bump `VERSION` in `sw.js`** so players' cached copies refresh.

## Files
| Path | What it does |
|---|---|
| `index.html`, `css/style.css` | Screens, HUD, store, settings, modals |
| `js/engine.js` | Game rules plus the solvers (shared by the game, the hint worker and the generator) |
| `js/render.js` | Canvas renderer: skins, gates, elevators, generators, animations, particles |
| `js/app.js` | Screens, swipe input, timer/gem rewards, store, save data |
| `js/audio.js` | Synthesized sound effects and generative background music (no audio files) |
| `fonts/` | Outfit font and its license |
| `THIRD_PARTY_NOTICES.md` | Credits and licenses for bundled third-party files |
| `js/hint-worker.js` | Runs the solver off the main thread for hints |
| `js/levels.js` | The 60 generated levels |
| `tools/generate-levels.js` | Level generator and verifier |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support, install and updates |
| `tools/release.js` | Bumps the version so installed players get updates |
