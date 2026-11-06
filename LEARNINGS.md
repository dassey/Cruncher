# LEARNINGS

Re-read before every task. Newest entries at the bottom of each section.

## IWSDK / WebXR (verified against node_modules, IWSDK 1.1.0-rc.2)
- `npm create @iwsdk@latest . -- --yes --force --target vr` scaffolds in place; `--no-git` keeps the existing repo.
- Systems: `class X extends createSystem({})`, register with `world.registerSystem(X, { priority })`; lower priority runs first (elics inserts before the first higher priority). Built-in input runs at negative priorities, so game systems at 0+ see fresh grip poses.
- `world.createTransformEntity(obj, { parent: entity, persistent: true })`. Parents: `world.playerSpaceEntities.gripSpaces.left|right`, `world.cameraEntity` (head-locked).
- `this.player.gripSpaces[side]` works for **both** controllers and tracked hands. Connected state: `this.input.xr.visualAdapters[side].peek()?.connected`; hand vs controller: `adapter.inputSource?.hand`.
- `InputComponent` is exported from `@iwsdk/core` (`Trigger`, `Squeeze`, `A_Button`, `X_Button`, `Thumbstick`…). `gamepad.getButtonDown(id)`.
- Haptics: `this.input.xr.gamepads[side]?.gamepad.hapticActuators?.[0]?.pulse(v, ms)` — guard every step.
- **Default controller/hand visuals fetch GLBs from cdn.jsdelivr.net.** For a zero-network build: patch `AssetManager.loadGLTF` for input-profile URLs *before* `World.create`, then `visualAdapters.{controller,hand}.{left,right}.updateVisualImplementation(NullVisual)`.
- `THREE.Material` warns when constructor options are `undefined` (`side: undefined`). Set optional props after construction.
- The `visibilityState` callback fires **before** the first XR pose: anything anchored to the head there uses the stale desktop camera. Defer re-anchoring a few frames.
- `AssetManager.loadGLTF` throws ("Cannot read properties of undefined") before `World.create` has initialised it: load GLB skins after the world exists, before systems that build rigs.
- XR `selectstart` on the session covers **both** controller trigger and hand pinch — one code path for the blaster. Hook it from a `visibilityState` subscription (the session doesn't exist at init).
- GL `Line`s are 1 px and effectively invisible in a headset; lasers must be thin meshes (core + additive glow).
- With `xr.offer: 'always'`, IWSDK offers the session; `world.launchXR()` starts it explicitly.

## IWER / emulator / Playwright
- Use the preinstalled browser: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new','--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })`. The project's own playwright package expects a different headless-shell build.
- `vite preview` is **HTTPS** (the iwsdk dev plugin injects a cert): use `https://localhost:4173` + `ignoreHTTPSErrors`.
- Chromium already exposes a native `navigator.xr`; IWER skips install unless `installRuntime({ forceInstall: true })`.
- IWER `controllers[side].position.set(x,y,z)` is in the same space as the IWSDK world when the rig sits at the origin. Grip pose ≈ that position (few cm offset). Default headset height is 1.6 m.
- `device.primaryInputMode = 'hand'` switches the emulator to hand tracking.
- Swiftshader frame times (~90 ms) are not representative of Quest GPU time; track draw calls/triangles/heap as the perf proxies and keep JS update cost low.

## Rendering
- **Varying float + `mod()` = sparkle noise.** An instanced attribute passed as a varying is interpolated; `mod(8.0, 8.0)` flips between 0 and 7.999 per pixel. Always `floor(v + 0.5)` before integer math (or use flat varyings).
- Canvas glow text with `globalCompositeOperation = 'lighter'` + big `shadowBlur` blows out to white. Offset two colour copies and put a dark core on top for a chromatic-split look that stays readable.
- Edge masks on instanced boxes must zero the face-normal axis, otherwise whole faces count as "edge".
- Put the HUD on the same plane as the rule banner (one billboard at 1.3 m) and position it from the grid's top-edge elevation; near-field HUDs drift into far banners as grids grow.
- HUD panels at 0.5–0.6 m overlap anything at 1.2–1.3 m in the same view direction; keep vertical separation (banner +0.30 m, HUD just above the grid).

## Design / learning engine
- Characters = behaviour (archetype) + skin. Gameplay branches only on archetype; skins are normalised by measured height so any model fits any slot. Swappable live (`setSkin`) and by URL.
- A pure-logic `GameSession` (no three/IWSDK imports) made the learning proof, balance sims and 500-run soak tests trivial. Keep all rules there.
- A simulated "always misses 7s" player died in <1 round when grids were flooded with 7-facts → added an **assist shimmer** after 12 s without a correct hit, and **heat-scaled focus** (struggling kids get gentler weak-fact concentration). Exposure to 7s still rises ~2× vs a solid player.
- Sampling correct grid values *without* replacement from a 12-item pool barely reflects learning weights; sample *with* replacement + repeat damping instead.
- Half-heart HP (10 = 5 hearts) with +½ heart per clear makes runs last ~8–12 min for an ~85%-accurate kid; whole-heart wrong-hit damage killed runs before the first boss.

## Hit detection (hard-won)
- **Swept-sphere punches must check approach direction.** Without it, pulling the hand back down after a punch smashed the block below (bot probe: 4/8 punches caused a second, unintended wrong hit → 20 half-hearts of "mystery" damage). Rule: `vel · dir(head→target, y damped ×0.35) ≥ 0.6 × minPunchSpeed`.
- Swiftshader runs ~10 fps; bot swings must cover ≥0.3 m in ≤3 frames or apparent hand speed (~0.4 m/s) falls under the punch threshold. Earlier "successful" hits were teleport artifacts — always probe one action in isolation before trusting aggregate bot stats.
- With 3 cm gaps, "first sphere along the swing" grazes neighbours. Pick the target the swing passed **most squarely** through (`dist/r + 0.15·u`), and keep target radii ≈ half the block.
- Bots must punch from the shoulder, not along the eye ray: eye-ray swings at low rows come in steeply from above and clip the row above.
- Track damage by source (event journal) before re-tuning balance; my first guess (bugs) was wrong — it was collateral wrong hits.

## QA tooling
- Pausing an IWSDK system via `isPaused` didn't stop it hiding objects in my test; for art line-ups, **clone** the objects (`clone(true)` shares geometry/materials) and add the clones.
- `OfflineAudioContext` lets the bot measure the synth (peak, RMS, bass share) and export WAVs — "bass-heavy" became a number (66–69 % < 150 Hz).
- Never rebuild `dist/` while a multi-run playtest is in flight: each new page loads hashed chunks from disk.
- Merging static creature parts into vertex-coloured meshes took late-round draw calls 92 → 84; outlines cost +1 per creature.

- **Real-time effects vs slow headless frames:** popups (0.9–1.5 s real-time lifetimes) had faded by the time a 10 fps bot screenshot landed, which looked exactly like "popups don't render". Two hours of probing: rendered (onBeforeRender fired), positioned, on screen — just at 14 % opacity. Check *current opacity/lifetime* first; QA now freezes popup lifetimes for screenshots (`freezePopups`).
- Fractional "pull toward the head" offsets compound when chained; use fixed metre offsets.

## Comfort / safety
- Arm-reach invariant test (shoulder→block ≤ 0.62 m for a 10-year-old) caught 5-row grids being out of reach; fixed with a console-desk tilt (lower rows closer) + constant per-row column gap.
- No scrolling floor (vection). Vignette glitch bands use a per-event seed, never a time-driven flicker. FlashGovernor caps edge pulses at 2/s.

## Deliberate deviations from scaffold guidance
- Punch/click hit-testing is analytic (swept sphere vs registered targets) rather than `RayInteractable`: blocks are one InstancedMesh (one draw call), and punching is proximity, not rays. A `Raycaster` is used only to build the desktop mouse ray.
