# Art requests (for the human with the 2D→3D pipeline)

Everything in-game is procedural placeholder art built from primitives. It reads
fine, but these would make the biggest jump in "screenshot and show a friend" factor,
in priority order. Deliver **GLB**, Y-up, metres, origin at the creature's centre of mass,
facing **+Z**, **≤ 3k triangles** and **1 material + 1 texture (≤ 512²)** each
(Quest 3 budget: 4 bugs + boss on screen). Bright, saturated, toy-like; big googly eyes.

| # | Asset | Size in game | Must-haves | Animation (optional, else I animate parts) |
|---|---|---|---|---|
| 1 | **Calcu-Llama** (boss) | ~1.6 m tall | llama head + long neck, torso = retro calculator with a flat **screen rectangle** on the belly (I draw the fact there — leave a separate node named `screen`), sunglasses, keypad buttons | idle bob, "shout" jaw open (node `jaw`), hit flinch |
| 2 | **Sockodile** | 25 cm long | striped sock-puppet crocodile, felt teeth, googly eyes; separate lower jaw node `jaw` | jaw open/close |
| 3 | **Blendingo** | 20 cm | kitchen blender jar on pink flamingo legs; blade node `spinner` | blade spin, leg wobble |
| 4 | **Wi-Fido** | 18 cm | puppy made of a Wi-Fi router, antenna ears with glowing tips, tongue | ear wobble |
| 5 | **Duckuum** | 22 cm | rubber duck on a robot-vacuum disc, LED ring node `spinner` | ring spin |
| 6 | **Glove** (one, mirrored) | fist 9 cm | chunky cyber boxing gauntlet, one material so I can tint skins | none |

Names are original (see `docs/RESEARCH.md` §2). Please don't base them on any existing
character. **No code needed to try them:** drop the GLB in `public/skins/`, add a line to
`public/skins/skins.json`, and load `?skin=boss:your-id` — full steps and node names in `docs/SKINS.md`
(template: `public/skins/test-bot.glb`).
