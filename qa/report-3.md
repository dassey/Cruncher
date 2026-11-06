# QA report #3 — endurance, 30-run soak, playtest 8

**Evidence:** `qa/endurance.json` (10.5 min), `qa/soak.json` (30 runs), `qa/playtest-8.json`, `qa/learning-sim.md`,
`qa/audio/metrics.json` (+ WAV previews), screenshots incl. `qa/screens/13-lineup.png`.

## Numbers
| Check | Result |
|---|---|
| 30 consecutive bot runs (15 controller, 15 hand-tracking) | **30/30 PASS, 0 errors**, 30 deaths, **30/30 restarts OK** |
| 10-minute endurance session | 14 rounds, 155 hits, 0 errors; heap **25.1 → 27.4 MB (flat)**; geometries/textures plateau 62/32 |
| Playtest 8 (2 runs) | 10 rounds, bosses at R5 + R10 beaten, menu tour + pause verified, death + restart; 0 errors |
| External network requests (all runs) | **0** |
| Draw calls / triangles | 26–84 / ~5.1–5.6k |
| Game JS per frame | **0.28–0.36 ms avg**, worst 13–17 ms (rare canvas redraws) |
| Learning sim (60 rounds × 5 seeds) | 7s-misser served **40.3 %** 7-facts late vs **10.8 %** solid (**3.7×**) |
| Music | bass share **66–69 %** of energy < 150 Hz; RMS −26 dBFS → mix raised |

## Art-director review
- **Line-up:** with neon toon outlines the Bugz finally pop off the purple world (cyan Wi-Fido, green Sockodile, pink Blendingo, yellow Duckuum). Toy-like and silly — on brief. Sockodile was a "striped box" head-on → protruding jaw, front teeth, nostrils added.
- **Hit frame:** glove mid-punch + burst + `+228 SHEESH 5×4` reads well. Popups from the top row drifted into the banner → now pop in the smashed block's slot and rise less.
- **Menus:** info panels bigger/closer/opaque; BRAIN.EXE values now ~54 px on a 1.35 m panel at 1.15 m (≈3°+). Shop is two clean rows.

## 12-year-old review
"Golden block = W. When all the leftover blocks blow up at the end that's actually satisfying. The duck is my favourite."

## Rubric
| Category | Score | Why |
|---|---|---|
| Fun / game feel | 8 | Fair, punchy hits; combo fire + trails; golden blocks; chain-wipe finale; perks; Bug intros; boss; meme callouts. Still unvalidated with a real kid. |
| Visual cool factor | 8 | Synthwave world + neon blocks + outlined toy creatures + particles. Placeholder-grade models (art request open). |
| Clarity | 8 | One billboard (rule + big HUD), boss question twice, readable readouts, bigger panels. |
| Learning effectiveness | 9 | 3.7× adaptation proof, RT normalised by grid size, boss on weakest facts, assist. |
| Performance | 8 | ≤ 84 calls, ~5k tris, no post-FX, 0.3 ms JS, flat heap; still no on-device frame timing. |
| Stability | 9 | 30/30 soak, endurance, restart, pause — zero errors. |
| Comfort & safety | 9 | Stationary, capped edge flashes, reach & lunge-distance invariants tested, pause on blur. |
| Parent appeal | 9 | Zero network verified, BRAIN.EXE heat map + today/week playtime, no money, installable PWA. |

**All categories ≥ 8 (first time).** Need one more consecutive report ≥ 8 to meet the bar.
