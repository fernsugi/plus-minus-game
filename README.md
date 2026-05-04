# PLUS-MINUS

PLUS-MINUS is a portrait-first arcade number puzzle game by Wong Hock Chuan Suginato (fernsugi).

Tap numbered tiles to land exactly on the target number before time runs out. If the current total is below or equal to the target, the next tile adds. If the total is above the target, the next tile subtracts. Longer routes create bigger combo scores.

## Play on browser
https://fernsugi.itch.io/plus-minus-game

## Play Locally

Open `index.html` in a browser.

For a local server:

```sh
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Main Files

- `index.html` - itch.io-ready HTML entry point.
- `style.css` - minimal page shell for the canvas.
- `game.js` - full canvas game, UI, input, SFX, VFX, scoring, and progression.
- `GAME.md` - game design specification.
- `ITCH_IO_PAGE.md` - copy/paste itch.io page text and settings.
- `LICENSE` - proprietary all-rights-reserved license.

## Rights

Copyright (c) 2026 Wong Hock Chuan Suginato (fernsugi). All rights reserved.

This project is proprietary. Reuse, cloning, modification, redistribution, commercial use, or creation of derivative works requires prior written permission from Wong Hock Chuan Suginato (fernsugi).
