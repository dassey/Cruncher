# QA report #1 — first playable (commit 1dcf3a3 → fixes in 3rd commit)

**Evidence:** `qa/playtest-1..3.log`, screenshots `qa/screens/0*.png`, probes (hit isolation, hand mode, menu press).

## What the bot did
- Playtest 3: 2 runs (controllers + hand tracking). Run 0: 5 rounds incl. **boss beaten**, 47 intended-correct / 2 intended-wrong, died round 6, **restart OK**. Run 1 (55 % profile): died round 1, restart OK.
- 0 console errors, 0 bad state transitions, **0 external network requests**.
- Draw calls 28 (grid) – 76 (boss, before keypad instancing), ~5–10k triangles, heap 25–31 MB.
- Game-system JS cost: **0.30–0.42 ms/frame avg**, worst 10–26 ms (canvas glow redraws).

## Art-director review (ruthless)
| Screen | Verdict |
|---|---|
| Title | Strong synthwave read (sun, ridge, towers, grid). Logo glow clipped to white → fixed with split-colour + dark core. Towers were blown-out lavender (edge mask bug) → fixed. Stars were snow-blobs → shrunk. |
| Gameplay | Blocks read instantly; checker cyan/purple is pretty. **Rule banner was hidden behind the HUD** → moved banner up (+0.30 m), HUD down. Every 8th block sparkled with noise (shader precision) → fixed. |
| Miss | `10 × 5 = 50` is big and readable, `L (TINY ONE)` lands as a joke, not shame. Good. |
| Boss | **Failed clarity:** HUD covered the boss, orbs hid the calculator screen showing the question. → Banner now shows `a × b = ?`, boss bigger/higher, orbs low & wide, HUD below. |
| Perk | Clear. Three cards, readable. |
| Game over | `COOKED` / `NEW PB · CERTIFIED W` is exactly the vibe. Buttons covered the shards line → panel raised. |

## 12-year-old review
"Smashing feels good, the dog-router thing is funny. Why did I lose hearts when I punched the right one?!" ← that was a **real bug** (below).

## Bugs found by the bot
1. **Collateral hits:** pulling a hand back down after a punch smashed the block below (4/8 isolated punches). All 20 half-hearts of damage in run 0 were these. → hits now require motion *into* the target; cooldown 0.25 s. Re-probe: 8/8 clean.
2. **Menu anchor in XR:** menus anchored before the first XR pose (head 1.45 vs real 1.6 m) → punching STATS clipped PLAY and started a game. → deferred re-anchor + wider rows. Re-probe: STATS opens STATS.
3. Atlas cell precision noise (fixed), material `undefined` warnings (fixed).

## Rubric (1–10)
| Category | Score | Why |
|---|---|---|
| Fun / game feel | 6 | Hit-stop, bursts, haptics, bass thump, combo; undermined by unfair collateral damage. |
| Visual cool factor | 7 | Synthwave world is screenshot-worthy; creatures are placeholder primitives. |
| Clarity | 5 | Banner/HUD overlap; boss question hidden. |
| Learning effectiveness | 8 | 7s-misser served 2.0× more 7-facts (`qa/learning-sim.md`), unit-tested. |
| Performance | 7 | Low calls/tris, <0.5 ms JS; 26 ms canvas spikes; no device numbers. |
| Stability | 6 | No errors, restart OK, but menu mis-press bug. |
| Comfort & safety | 8 | Stationary, capped edge-only flashes; lunges came close to the face (now kept ~20 cm out). |
| Parent appeal | 8 | No data/ads; BRAIN.EXE heat map exists but wasn't screenshotted yet. |

**Bar not met.** Next: verify fixes in playtest 5, screenshot all menus, 30-run soak.
