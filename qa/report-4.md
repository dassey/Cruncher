# QA report #4 — final-candidate build (playtest 11 + 30-run soak #2)

**Evidence:** `qa/playtest-11.json`, `qa/soak2.json`, `qa/playtest-9.json`, `qa/playtest-10.json`, screenshots in `qa/screens/`.

## Numbers
| Check | Result |
|---|---|
| Playtest 11 run 0 (controllers) | **10 rounds**, bosses R5 + R10 beaten, 90 correct / 8 wrong, menu tour + pause verified, 0 errors |
| Playtest 11 run 1 (hand tracking, weak profile) | died R2, **restart OK**, 0 errors |
| 30-run soak #2 on this build | **30/30 PASS, 0 errors**, 30 deaths, **30/30 restarts OK**, 15 hand-tracking runs, heap ≤ 32 MB |
| External network requests | **0** (all runs) |
| Draw calls (worst sample) | **76** (was 102 before pool trims / glove merge) |
| Triangles | ~5.1–5.6k |
| Game JS per frame | 0.29–0.35 ms avg, worst 9–14 ms |
| Heap | 26–27 MB, flat |

## Regressions caught this loop
1. **Popups "missing" in screenshots** → not a render bug: real-time lifetimes faded before 10 fps screenshots landed. QA freezes popups for shots now. Also fixed compounding fractional offsets that put readouts 30 cm from the face (now fixed 6/10 cm in front of the block).
2. **Banner over the boss's belly screen** → boss raised; `2 × 4!` screen and `2 × 4 = ?` banner both clear.
3. **Economy too fast** (~6–8 runs to unlock everything) → costs doubled, score payout halved (~20 runs).

## Art-director review
- Hit frame: glove, burst and `+238 SHEESH` all in the punched slot. Miss frame: `2 × 12 = 24 · MID PUNCH` floats in front of the wrong block, big and readable (~7° tall in-headset).
- Boss: fact readable twice, orbs readable, llama silhouette strong.
- Remaining weakness: creature models are primitive placeholders (art request filed).

## Rubric
| Category | Score | Why |
|---|---|---|
| Fun / game feel | 8 | Same loop as #3 plus fixed popup placement and tuned economy; still awaiting a real-kid session. |
| Visual cool factor | 8 | Unchanged strengths; creatures outlined toy placeholders. |
| Clarity | 8 | Billboard, boss framing, readouts in the right place. |
| Learning effectiveness | 9 | 3.7× adaptation (sim), grid-size-normalised RT, weakest-fact boss. |
| Performance | 8 | ≤ 76 calls, ~5k tris, 0.3 ms JS, flat heap; no device numbers yet. |
| Stability | 9 | 0 errors across playtests 9–11 and soak #2. |
| Comfort & safety | 9 | Invariant tests, capped edge flashes, no locomotion, pause on blur. |
| Parent appeal | 9 | Zero network, BRAIN.EXE + playtime, no money, PWA. |

**Second consecutive report with every category ≥ 8 → quality bar met** (with BLOCKERS #1: on-device verification still needs the human).
