# BACKLOG (highest impact first)

## Done (this session)
- [x] Core loop, rules (multiples / make-N / factors), rounds, HP, timer, game over, restart
- [x] Juice: hit-stop, particles, rings, haptics, synth SFX + music, combo, popups, edge glitch, fake bloom halos, trails, combo fire, chain-wipe, golden blocks
- [x] Bugz (4 original creatures) + NEW BUG intros; boss (Calcu-Llama) every 5th round
- [x] Learning engine + debug overlay; 3.7× adaptation proof; RT normalised by grid size
- [x] Meta-progression (shards, 4 upgrades, 6 glove skins), perks, menus, settings, pause, persistence, PWA
- [x] Bot playtest (controllers + hands), 30-run soak, 10-min endurance, audio QA, line-up renders

## Next (needs the human)
- [ ] **On-device Quest 3 run** of the README 10-minute checklist (real frame time, hand-tracking feel, haptics).
- [ ] **Creature art** (see `docs/ART_REQUESTS.md`) → swap into `src/render/creatures.ts`.
- [ ] Create a `main` branch (or set this branch as default) so the PR can be opened.

## Next (code)
- [ ] Motor-time calibration: subtract each kid's punch latency (measured on trivial ×1/×10 items) before judging fluency.
- [ ] Spatial audio panning for SFX at the hit position.
- [ ] Merge glove parts (5 → 2 meshes each) and googly eyes per creature to trim ~16 draw calls in late rounds.
- [ ] Stretch-break reminder at ~25 min (RESEARCH §1); optional parent daily cap.
- [ ] Quick 4-minute "speedrun" mode; weekly "fact boss" built from the 5 weakest facts.
- [ ] More upgrades (6–8) and 2 more Bugz for late-game variety.

## Later
- [ ] Trailer capture mode (scripted camera path, HUD off) — shot list in `marketing/trailer-shot-list.md`.
- [ ] Localisation of the callouts table.
