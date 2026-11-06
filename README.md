# CRUNCHER

A neon-synthwave VR brawler for **Meta Quest 3** (WebXR, Meta Immersive Web SDK).
You're a glitch gremlin loose in a corrupted server. A rule flashes overhead —
**MULTIPLES OF 7**, **MAKE 24**, **FACTORS OF 36** — and you punch every number block
that fits while meme-brained "Bugz" try to bonk you. Every 5th round, **Calcu-Llama**
yells a fact and spits answer orbs at you.

Underneath, a hidden spaced-repetition engine (Leitner boxes + response time)
quietly serves the times-table facts your kid is weakest on. No lessons. No ads. No
accounts. **Nothing leaves the headset.**

---

## Run it on desktop (emulator)

```bash
npm install
npm run build
npm run serve            # https://localhost:4173  (self-signed cert: click through)
```

- **Plain desktop:** open `https://localhost:4173/` — click blocks to punch, `Space` = slow-mo, `Esc` = pause, `` ` `` = debug overlay.
- **Emulated Quest 3:** open `https://localhost:4173/?emu` → click **ENTER VR**. The page now runs as a Quest 3 via IWER;
  you can drive controllers from the browser console:
  `__CRUNCHER__.punchAt('right', x, y, z)` / `__CRUNCHER__.targets('block')`.
- **IWSDK managed dev server** (HMR + IWER panel + agent tooling): `npm run dev`.

Useful URL flags: `?fresh` (throwaway save), `?seed=123` (deterministic), `?unlockall` (all tables), `?bot` (bot API), `?skin=boss:test-bot` (swap a character's skin).

## Load it on a Quest 3 (local HTTPS)

WebXR needs HTTPS. The build server already serves a self-signed cert.

1. PC and Quest on the **same Wi-Fi**.
2. `npm run build && npm run serve -- --host` — note the `Network: https://192.168.x.x:4173/` line.
3. In the Quest **Browser**, open that URL → *Advanced* → *Proceed* (self-signed cert warning is expected).
4. Tap the browser's **Enter VR** prompt (or the ENTER VR button). Stand in a clear 1 m circle.
5. Optional, USB: `adb reverse tcp:4173 tcp:4173` then open `https://localhost:4173/` on the headset.

Tip: Add to home / "Install app" in Quest Browser to get a full-screen app icon.

## Controls

| Action | Controllers | Hands |
|---|---|---|
| Smash a block / punch a Bug / press menu buttons | **Punch it** (any fast hand move through it) | Punch it |
| **Blaster: point & zap** (anything: blocks, Bugz, orbs, menus) | Point, pull **trigger** | Point, **pinch** |
| Backup "poke" | Grip while touching | — |
| Slow-mo (limited charges) | **A** or **X** | **Clap** |
| Pause (RESUME / QUIT) | **B** or **Y** | Quest system gesture also pauses |
| Debug / learning overlay | click both thumbsticks | — (desktop: `` ` ``) |

No walking, ever: everything is within arm's reach or zappable. Punches score more than zaps. Menus are punchable/zappable blocks too. Shop: top row = upgrades, bottom row = ◀ glove skin ▶ carousel. Settings: Standing/Seated (grid sits lower when seated), AIM (BOTH / PUNCH ONLY / BLAST ONLY — blast-only is great seated), volume, music, FX Full/Chill, Wipe Save (punch twice).

## How it plays

- **Round** (60–90 s): rule → grid (5×4 growing to 7×5) → smash every correct block → **perk pick** (1 of 3).
- **Wrong hit:** edge glitch, buzz, −½ heart, combo resets, and a one-line fact readout (`7 × 4 = 28`).
- **Stuck for 12 s?** The remaining correct blocks shimmer (assist) — those facts come back sooner.
- **Bugz:** Wi-Fido (router puppy), Sockodile (telegraphs, then lunges at your face), Blendingo (re-rolls numbers), Duckuum (sweeps rows). Punch or zap them to yeet them.
- **Swappable skins:** every character is behaviour + skin; drop GLBs in `public/skins/` and swap with `?skin=lunger:my-model`. See `docs/SKINS.md`.
- **Boss every 5th round:** Calcu-Llama shows `7 × 8!` on its calculator belly; punch the right orb.
- **Roguelike:** hearts carry across rounds; death ends the run; **data shards** persist and buy upgrades (Extra Heart, Lag Switch slow-mo, Combo Shield, Shard Magnet) and glove skins.
- **STATS → BRAIN.EXE:** an 11×11 heat map of every fact (locked-in / loading / glitchy / not seen), accuracy, playtime today / this week, weakest facts. The parent screen.

## Tech

- Meta IWSDK 1.1 (ECS) + TypeScript + Vite. One system per concern in `src/systems/`
  (Input, Rule, Grid, Enemy, Boss, Scoring, FX, UI, Audio, Learning, Progression, Environment, Perf).
- All game rules live in pure TS (`src/logic/`) — fully unit-tested. **All tuning numbers in `src/config.ts`.**
- ~30–45 draw calls, ~5k triangles: the whole grid is one instanced draw; "bloom" is faked with additive halos.
- Audio is synthesized with WebAudio. Fonts are bundled (OFL). **Zero runtime network requests** (verified by the playtest).

## Tests

```bash
npm test                 # Vitest: logic, learning engine, session, progression
npm run test:coverage    # coverage of src/logic (>99%)
npm run sim              # writes qa/learning-sim.md (7s-misser proof)
npm run serve &          # then, in another shell:
npm run playtest         # headless Quest-3 bot: 2 runs × up to 10 rounds, boss, deaths, screenshots
npm run playtest:soak    # 30 quick runs, zero-error gate
node qa/playtest.mjs --runs 1 --minutes 10   # endurance / memory stability
node qa/audio-check.mjs  # offline-render music: loudness, bass share, WAVs in qa/audio/
node qa/lineup.mjs       # creature line-up screenshot for art review
```

QA reports live in `qa/report-*.md`; screenshots in `qa/screens/`.

## 10-minute human playtest checklist (for you + your kid)

Put the headset on the kid; you watch the cast (Quest → Camera → Cast to phone/PC).

1. **(0:00) Boot & menu** — Title is readable without squinting? Kid can punch **PLAY** within 10 s without help?
2. **(0:30) First rule** — Ask "what do you have to hit?" They should answer from the overhead banner.
3. **(1:00) Punch feel** — Correct smash gives burst + thump + buzz + score pop. Ask: "does it feel good to hit?" (want a grin).
4. **(1:30) Wrong hit** — Have them hit a wrong one on purpose. The `a × b = c` readout is readable? No "lesson" vibe?
5. **(2:00) Bugz** — Wi-Fido shows up by round 2. Can they punch it away? Sockodile lunge (round 3) is a clear warning, not scary?
6. **(3:00) Perk pick** — Do they understand they're choosing? Do they read the perk text?
7. **(4:00) Comfort** — Any dizziness, eye strain, or flashing complaints? Grid within arm's reach with no leaning/stepping?
8. **(5:00) Slow-mo** — Tell them "clap!" (hands) or press A/X. Does it trigger?
9. **(6:00) Boss (round 5)** — Calcu-Llama fact readable? Orbs reachable? Did they whoop?
10. **(8:00) Death & retry** — After "COOKED": do they immediately punch **RUN IT BACK**? (the real fun test)
11. **(9:00) Shop** — Can they buy a glove skin? Do they want to?
12. **(10:00) STATS** — You look at **BRAIN.EXE**: does the heat map match what you know they struggle with?

Write down: favourite moment, most confusing moment, any jokes that landed or were cringe.

## Privacy & safety

- No network calls, no accounts, no ads, no chat, no analytics. Saves are `localStorage` on the headset only.
- Stationary play; the camera is never moved by the game. No full-field flashes; edge pulses are capped at 2/s.
- See `docs/RESEARCH.md` for the sources behind these choices.
