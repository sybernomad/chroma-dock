# Third-party notices

Chroma Dock bundles one component made by others. It is used under its own license, linked
below, and the in-game **Credits** screen (Settings → Credits) shows the same notice.

## Outfit font

- File: `fonts/Outfit.woff` (subset to Latin characters and converted to WOFF)
- Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts)
- License: SIL Open Font License 1.1, full text in `fonts/OFL-Outfit.txt`
- The license asks that the copyright notice and license text ship with the font, which is why
  `fonts/OFL-Outfit.txt` must stay next to it.

## Everything else

Nothing else needs a license or credit:

- **Sound and music** are synthesized in the browser by `js/audio.js`. There are no audio files,
  recordings or samples.
- **Graphics, icons and effects** are drawn by the game's own code (`js/render.js`, inline SVG in
  `index.html`, `icons/`).
- **Emoji** in tips and the store are rendered by the player's device and are not bundled.
- There are no libraries, frameworks or analytics.
