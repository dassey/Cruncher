# QA report #2 — playtest 7 (commit "Pause menu, shop carousel…")

**Evidence:** `qa/playtest-7.log`, `qa/last-playtest.json` (copied into this report), screenshots `qa/screens/*.png`.

## Bot results
| Run | Input | Rounds | Bosses | Result | Notes |
|---|---|---|---|---|---|
| 0 | controllers | **10** | 2 beaten (R5, R10) | alive at cap | 89 correct / 12 wrong; menu tour (STATS, SHOP, SETUP) by punching; pause → timer frozen → RESUME punched |
| 1 | **hand tracking** | 1 | – | died R2 (55 % profile) | **restart via RUN IT BACK OK** |

- Console errors **0**, bad state transitions **0**, external network requests **0**.
- Draw calls 26–84 (late rounds with 4 Bugz), triangles ~5.1–5.6k, heap **25–27 MB flat** over 6 min.
- Game JS per frame: **0.29 ms avg**, worst 18.9 ms (one-off canvas redraws).
- Damage by source (run 1): 100 % wrong hits = intended misses. No collateral (fixed in report #1 loop).

## Art-director review
- **Gameplay:** single overhead billboard (rule + HUD strip) — no overlap at any grid size; grid now a console-desk tilt.
- **Boss:** `9 × 4 = ?` huge on the banner *and* on Calcu-Llama's belly screen; orbs 37/27/36 readable, near-miss distractors. Strong.
- **Menus:** title great; SHOP now 2 rows with a glove carousel; PAUSE and GAME OVER clean.
- **Weak:** info-panel body text (~1.5° tall) too small in VR → fix queued (panel 1.35 m @ 1.15 m, 32/54 px text, plate 86 % opaque). HUD score/combo enlarged to 96 px (~4°).
- **Weak:** creatures are primitive placeholders (spec in `docs/ART_REQUESTS.md`).

## 12-year-old review
"The llama is so dumb I love it. Fists on fire at x3 is sick. Shop has only 4 upgrades though. Can I have more Bugz?"

## Rubric
| Category | Score | Why |
|---|---|---|
| Fun / game feel | 7 | Fair hits now, hit-stop/particles/haptics/trails, combo fire, perks, two bosses per 10 rounds. Unvalidated with a real kid. |
| Visual cool factor | 7 | World + blocks + UI are screenshot-worthy; creatures placeholder. |
| Clarity | 7 | Billboard + boss fixed; info-panel body text too small (fix queued). |
| Learning effectiveness | 9 | 7s-misser served 2.0× 7-facts late; grids focus weak facts; boss uses weakest 5; assist; tests. |
| Performance | 8 | ≤ 84 calls, ~5k tris, no post-FX, 0.3 ms JS, flat heap. No on-device numbers (BLOCKERS #1). |
| Stability | 8 | 0 errors, restart & pause verified. 30-run soak in progress. |
| Comfort & safety | 9 | Stationary; edge-only capped flashes; reach invariant; lunges stop ~20 cm out; pause on headset menu. |
| Parent appeal | 9 | Verified zero network; BRAIN.EXE heat map + today/week playtime; no ads/money; parent blurb. |

**Bar not met** (Fun, Visual, Clarity at 7). Next: info-panel legibility, juice pass (screen-space-free "impact frames", combo audio), soak.
