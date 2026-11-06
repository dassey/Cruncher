# Skins: swap any character's looks without touching gameplay

Every character is **behaviour + skin**. Gameplay only knows the behaviour:

| Behaviour (archetype) | What it does | Default skin |
|---|---|---|
| `drifter` | floats in front of the grid, gets in the way | `wifido` |
| `lunger` | shakes, then lunges at your face (punch it first) | `sockodile` |
| `scrambler` | re-rolls nearby block numbers | `blendingo` |
| `sweeper` | sweeps along a row | `duckuum` |
| `boss` | every 5th round: shows a fact, spits answer orbs | `calcullama` |

Any skin can be worn by any behaviour. Systems scale every skin to the slot's size
(bugs ≈ 17 cm tall, boss ≈ 1.75 m), so you don't need to match units exactly.

## Try a different cast (testing)
- URL: `https://localhost:4173/?skin=lunger:duckuum,boss:test-bot`
- Live, from the browser console (with `?bot` or `?emu`): `__CRUNCHER__.setSkin('drifter', 'test-bot')`, `__CRUNCHER__.listSkins()`
- Permanently: change `DEFAULT_ROSTER` in `src/logic/skins.ts`.

## Add your own model (2D → 3D → game)
1. Export a **GLB** (Y-up, metres-ish, facing **+Z**, origin at the feet or centre). Keep it light:
   ≤ 3k triangles, 1 material, ≤ 512² texture. No Draco/KTX2 compression (those decoders would need the network).
2. Name the parts you want animated (all optional):
   - `jaw` – moves on lunge/shout · `spinner` – spins (blades, LED rings, heads) · `screen` – where the boss's fact screen is mounted (boss only)
   - `legs` – list of nodes that bob · `eyes` – list of eye nodes (a child at index 1 is wobbled as a pupil)
3. Drop the file in `public/skins/` and add an entry to `public/skins/skins.json`:
   ```json
   { "id": "my-llama", "name": "MEGA LLAMA", "file": "my-llama.glb",
     "nodes": { "jaw": "jaw", "spinner": "head", "screen": "belly", "legs": ["legL", "legR"], "eyes": ["eyeL", "eyeR"] } }
   ```
4. Load with `?skin=boss:my-llama` (or set it in `DEFAULT_ROSTER`).

`tools/make-test-skin.py` writes `public/skins/test-bot.glb`, a tiny template GLB with every
node name above. Open it in Blender to see the expected structure.
