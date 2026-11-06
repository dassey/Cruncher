# BLOCKERS

## 1. No physical Quest 3 in the build environment
- **Impact:** real GPU frame time, real hand-tracking punch feel and haptics can't be measured here.
- **Tried:** (1) IWER emulator in headless Chromium (works for input/logic/rendering correctness);
  (2) swiftshader frame timing (~95 ms, CPU-rendered, not representative);
  (3) instrumented per-frame game JS cost (InputSystem → PerfSystem): ~0.4 ms avg on the build host.
- **Workaround:** budget proxies (draw calls 28–76, ≤ 10k triangles, no post-processing, one instanced grid draw,
  allocation-free update loops) + the README's 10-minute human playtest checklist.
- **Needs from human:** run the checklist on a Quest 3; optionally `npx @iwsdk/cli` native XR test over USB.

## 2. (resolved) Single branch
- Everything lives on `main`; no PRs.

## 3. Creature art is procedural placeholder
- Readable and on-style, but not "hero" quality. Spec in `docs/ART_REQUESTS.md`.
