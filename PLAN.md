# CRUNCHER — Plan

A VR arcade brawler for Quest 3 (WebXR, Meta IWSDK). You are a glitch gremlin loose
inside a corrupted server. A rule flashes overhead ("MULTIPLES OF 7", "MAKE 24",
"FACTORS OF 36"). You punch the number blocks that fit the rule and knock away
the meme-brained antivirus creatures ("Bugz"). Every 5th round a boss yells a fact
and throws answer orbs at you. Under the hood a spaced-repetition engine quietly
drills the 2×2 – 12×12 facts the kid is weakest on.

> Naming note: the prompt calls the enemies "Troggles" and describes the game as a
> "Number Munchers" reimagining. Both are another studio's IP, so the game uses
> the *genre and mechanic* (grid + rule + roaming enemies) with **original names,
> characters and art**. In code the enemy concept is called `Bug`.

## Pillars
1. **Punch feel first.** Every correct hit: hit-stop, burst, haptic, bass thump, score pop, combo climb.
2. **Never homework.** No lessons, no "correct!" voice. Wrong hit = a glitch, a "-AURA" and a one-line fact readout.
3. **Gen Alpha voice.** Meme callouts (W, L, aura, cooked, lock in, 6-7…), absurd original creatures.
4. **Invisible learning.** Leitner boxes + response-time weighting choose the rule and the numbers on the grid.
5. **Comfort & safety.** Stationary, no camera motion, no full-field flashes, no network calls, no data collection.

## Architecture
```
src/config.ts              every tuning number
src/logic/*                pure TS, no three/IWSDK imports, 100% unit-testable
  rng, facts, learning, rules, grid, scoring, difficulty, progression,
  session (state machine for a run), flash-governor, storage, callouts, events
src/game/context.ts        shared runtime singleton (session, events, settings) handed to systems
src/systems/*              one IWSDK ECS system per concern:
  Input, Grid, Rule, Scoring, Enemy, Learning, FX, Audio, Progression, UI, (Boss), (Environment), (Debug)
src/render/*               procedural meshes, shaders, canvas-texture text
src/bot/*                  emulator bootstrap (IWER) + scripted bot, loaded only with ?emu / ?bot
tests/*.test.ts            Vitest (logic)
qa/playtest.mjs            Playwright headless bot run (screenshots, console, perf, network audit)
```

The **session** owns all game rules (HP, combo, rounds, boss, timer) as a pure
state machine driven by `tick(dt)` and `hitBlock(id)`. Systems render state and
feed input. This lets Vitest play thousands of whole runs headlessly, and lets the
learning-effectiveness proof run through the same code the headset runs.

## Key decisions (logged)
- **Fake bloom** (additive halo quads + emissive colors) instead of a post-process
  bloom pass: post-processing in WebXR costs a full extra resolve per eye on Quest
  and breaks multiview. Halos give the neon look at ~1 draw call.
- **Blocks = one InstancedMesh** with a custom shader: neon edge glow + label sampled
  from a per-round canvas atlas. One draw call for the whole grid.
- **Text = Canvas2D → CanvasTexture**, re-rendered only on change. Fonts are bundled
  OFL files (Bungee, Rubik Glitch, Russo One) – no CDN.
- **Custom gloves** instead of IWSDK controller/hand GLBs. The default visuals fetch from
  jsdelivr (network call, violates the no-network rule); custom gloves also drive the
  cosmetic hand-skin unlocks. The GLB loader is short-circuited for input-profile URLs.
- **Punch = swept sphere vs block AABB** using grip-space positions, with a minimum
  hand speed so resting hands don't trigger blocks. Trigger/pinch is a backup "poke".
- **Desktop fallback**: mouse click raycasts against block AABBs analytically, so the game is
  playable on a laptop and in the IWER emulator.
- **Commutative facts**: 7×8 and 8×7 are one fact (66 facts from 2..12).
- **Shards persist** across deaths (kid-friendly, no loss aversion); upgrades are bought in the menu shop.
- **Punch = intent:** a hit needs speed *and* motion into the target; a multi-target swing picks the most
  squarely hit target (bot found retract-swipes and grazes causing unfair wrong hits).
- **One overhead billboard** (rule text + HUD strip) at 1.3 m, placed from the grid's top-edge elevation.
- **Console-desk grid**: lower rows tilt closer so every cell is within a 10-year-old's reach (tested).
- **Half-heart HP**, assist shimmer after 12 s stuck, heat-scaled weak-fact focus, grid RT normalised by grid size.
- **Name:** CRUNCHER. **No walking:** everything is in arm's reach (punch) or zappable (blaster: point + trigger/pinch).
- **Skins are swappable:** behaviour + skin; GLBs in `public/skins/` via `skins.json` (`docs/SKINS.md`).
- **In-run perks** (pick 1 of 3 after each round), **golden blocks** (rare ×3 + shards), pause menu.

## Build order
1. Greybox: grid, one rule, hit detection, score.
2. Core loop: rules, rounds, HP, timer, game over, restart.
3. Juice: particles, haptics, synth SFX + music, combo, popups, glitch FX, neon halos.
4. Bugz (enemies).
5. Learning engine + debug overlay (key `` ` `` / both-thumbsticks-click).
6. Boss rounds.
7. Meta-progression, menus, settings, persistence.
8. Rubric-driven polish passes.

## Dev loop
PLAN → BUILD → TEST (`npm run build`, `npm test`, `npm run playtest`) → REVIEW (screenshots,
`qa/report-<n>.md`) → LEARN (`LEARNINGS.md`) → COMMIT/PUSH.
