# QA report #5 — CRUNCHER: blaster + swappable skins

**Evidence:** `qa/playtest-12.json`, `qa/soak3.json`, screenshots `qa/screens/13-lineup.png`, `qa/screens/14-skin-swap.png`.

## What changed
- Renamed to **CRUNCHER** (logo, tagline "CRUNCH THE NUMBERS", save key, PWA, docs).
- **Blaster (point & shoot):** solid neon laser + reticle per hand; trigger (controllers) or pinch (hands) zaps blocks, Bugz, boss orbs and menu buttons. AIM setting: BOTH / PUNCH / BLAST. Zaps score 75 % of a punch. No walking anywhere.
- **Swappable skins:** characters = behaviour + skin. Any skin on any behaviour, normalised by height. GLBs via `public/skins/skins.json`; `?skin=…` and live `setSkin()` for testing; template GLB + generator script.

## Numbers
| Check | Result |
|---|---|
| Blaster isolation probe | 6/6 zaps hit exactly the aimed block, 0 collateral |
| GLB skin pipeline | `test-bot.glb` loaded from `public/skins/`, worn by drifter + boss, 0 errors, 0 network |
| Playtest 12 (controllers / hands / blaster-only) | 10 rounds + both bosses; hand run died + restart OK; blaster run: menus, blocks, restart via zaps; **0 errors** |
| 30-run soak #3 | **30/30 PASS, 0 errors**, 30 restarts, 15 hand-tracking + 7 blaster runs, heap ≤ 31 MB |
| External requests | **0** |
| Draw calls (worst) | 76 (baseline +8 for beams/reticles) |
| Unit tests | 58 pass |

## Rubric
| Category | Score | Why |
|---|---|---|
| Fun / game feel | 8 | Punch *or* zap: kids who don't want to move can still play; punching stays worth more. |
| Visual cool factor | 8 | Neon laser + reticle add to the look; skins pipeline ready for real art. |
| Clarity | 8 | Laser turns yellow on lock-on, reticle on the target. |
| Learning effectiveness | 9 | Unchanged engine; blaster hits record the same facts and timing. |
| Performance | 8 | ≤ 76 calls, ~5k tris, 0.33–0.44 ms JS, flat heap. |
| Stability | 9 | 0 errors across all modes. |
| Comfort & safety | 9 | No locomotion at all; BLAST ONLY option for seated play. |
| Parent appeal | 9 | Unchanged: zero network, BRAIN.EXE, no money. |
