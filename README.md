# best-heist-game-20261122-0559-entry

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/sagaevil530/best-heist-game-20261122-0559-entry/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/sagaevil530/best-heist-game-20261122-0559-entry/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**The Halcyon Heist** — a top-down stealth heist game in three acts: the gallery, the bank, the penthouse. Read the vision cones, spend your tools, take the prize and vanish.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. The game is plain static files under `game/` — no network requests, no build step, no dependencies. All sound is synthesised live with WebAudio.

## How to play

You are the thief. Steal the marked target in each of the three heists, then reach the green EXIT — without letting the alarm hit 100%.

- **Move** — WASD / arrow keys, or click a spot to walk there
- **Sneak** — hold Shift (slow, quiet, harder to spot)
- **Sprint** — hold Space (fast, loud, easy to spot)
- **Steal the target** — hold E next to it to cut it free (1.5 s, noisy)
- **Pick a locked door** — hold E at it (noisy; vault doors take longer)
- **Smoke bomb** — Q (2 per heist, 6 s of cover; watchers cannot see through it)
- **EMP burst** — F (2 per heist, disables cameras for 8 s)
- **Pause** — P or Esc

Guards patrol, grow suspicious when they hear noise or glimpse you, and give chase when they are sure. Cameras sweep their cones and raise the alarm on their own. At 100% alarm the building locks down for 12 seconds and every guard hunts you. Small loot (cash, gems) is pocketed on touch; the big prize needs the cut. Finish fast and unseen for the GHOST rank and bonus.

Three difficulties (Easy / Normal / Hard) change guard speed, vision range, alarm speed and tool counts.

## The three heists

1. **The Meridian Gallery** — lift "The Azure Duchess" painting ($5,000). 3 guards, 2 cameras.
2. **Halcyon Bank** — crack the vault door and take the gold reserve ($8,000). 3 guards, 2 cameras.
3. **Skyline Penthouse** — slip into the sealed display room for "The Halcyon Star" diamond ($12,000). 4 guards, 3 cameras.

## Structure

- `game/index.html` — canvas, HUD, screens; loads the game
- `game/src/config.js` — tuning: speeds, cones, alarm, tools, difficulties
- `game/src/levels.js` — the three heists: walls, doors, patrols, cameras
- `game/src/world.js` — tile grid, movement collision, line of sight, cones
- `game/src/guards.js` — guard AI (patrol / suspicious / alert / search) and cameras
- `game/src/game.js` — game state, rules, scoring, alarms, lockdown
- `game/src/render.js` — all drawing: map, cones, HUD, menus
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised sound: pad, footsteps, alarms, effects
- `game/src/shots.js` — autopilot, staged screenshots, and the in-browser self-test
- `game/src/random.js` — seeded RNG (every run is deterministic)
- `main.ts` — builds the submission dossier from `game/` and `screenshots/`
- `serve.ts` — tiny static server for local play (port 8080)
- `screenshots/` — 4 real renders of the game's own code

## Verification

The built-in autopilot plays all three heists on Normal and wins them (run it with `?selftest=1`):

| Heist | Result | Time | Loot | Alarm peak |
| --- | --- | --- | --- | --- |
| The Meridian Gallery | Won, GHOST | 48.0 s | $5,000 | 0% |
| Halcyon Bank | Won, GHOST | 53.1 s | $9,500 | 0% |
| Skyline Penthouse | Won | 53.8 s | $12,000 | 39% |

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
