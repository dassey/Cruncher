# Cruncher: Design Research Brief

Desk research for an original WebXR multiplication punch-arcade game on Meta Quest 3 (players aged 10–13). Compiled 2026-11-06.
Confidence tags: **[src]** means a cited source backs the claim. **[rec]** marks a design recommendation or estimate of ours, not a sourced fact.

---

## 1. Market scan: what kids actually like

### Classroom quiz games (2D)
- **Kahoot / Blooket / Gimkit** win on three things: **short rounds, speed scoring, and social chaos**. Blooket gives kids collectible avatars ("Blooks") and accessories as they win and play more. Its speed-weighted scoring and randomness let weaker players reach the podium, and kids guess fast to farm points. https://hsdial.org/2025/04/28/excitement-in-education
- **Gimkit** puts an in-game *economy* on top of the quiz: correct answers earn cash, and players spend it on upgrades and power-ups (multipliers, streak bonuses). The spending decisions add a strategy layer. https://www.jotform.com/de/blog/gimkit-vs-blooket/
- **Times Tables Rock Stars (TTRS)** is the closest multiplication comparable. Kids get a rock-star avatar that they upgrade with coins earned in games, and they rank up by speed. Pupils "enjoy tracking their own progress." The commonly cited mastery bar is **any fact to 12×12 in under 3 s**. https://ttrockstars.com/schools/ · https://www.internetmatters.org/advice/apps-and-platforms/skills-building/times-tables-rock-stars/
- **Prodigy** (math questions inside RPG battles) is popular, but it is the cautionary tale. In 2021, CCFC filed an FTC complaint alleging the game "aggressively" upsold a $59.88–$107.40/yr membership to children. Parents describe kids pestering them for it, and Common Sense parent reviews call it "overly commercialized." https://edweek.org/technology/popular-interactive-math-game-prodigy-is-target-of-complaint-to-federal-trade-commission/2021/02 · https://www.commonsensemedia.org/app-reviews/prodigy-kids-math-game
- **Number Munchers (MECC, 1986)**: you move around a grid and eat numbers that match a rule ("Multiples of 3", "Factors of 12", primes, equalities) while avoiding Troggles. It was designed for grades 4–8. **This is our core loop's ancestor**, and it proves the "rule + hunt matching numbers + dodge enemies" structure works. https://en.wikipedia.org/wiki/Number_Munchers

### Why "chocolate-covered broccoli" fails
- The term describes dull drill wrapped in a game skin. Habgood's *Zombie Division* study compared versions: when the math *was* the combat mechanic (dividing a skeleton splits it into proportional pieces), kids played **7× longer** and learned more than with an extrinsic version where quizzes sat between fights. https://eprints.nottingham.ac.uk/10385 · https://www.kqed.org/mindshift/20765/whats-the-secret-sauce-to-a-great-educational-game
- Kids' typical complaints (Prodigy reviews and Blooket teacher threads) are **paywalls**, **quiz pop-ups that interrupt play**, **slow pacing**, and **content that is "too easy" or "baby-ish."**

### Quest VR comparables
- Math titles on Quest are thin and mostly shooting or whacking the correct answer: *Math World VR* (younger kids), *Math Quest VR*, *Whack-A-Math-Mole* (times tables). None has meaningful reviews or traction, so the market has room. https://mixed-news.com/en/play-games-to-practice-math-with-math-world-on-quest-2/ · https://www.meta.com/experiences/whack-a-math-mole/7102434739769130/
- **Rhythm and punch games set the feel bar.** *Beat Saber* has readable incoming targets, slicing on the beat, and score multipliers. *Synth Riders* has flowing rails. *Supernatural* runs coach-led sessions (Meta stopped its content updates in Jan 2026, and it was later spun out as Supernatural Health). *Thrill of the Fight* is real boxing. https://www.engadget.com/ar-vr/meta-has-closed-three-vr-studios-as-part-of-its-metaverse-cuts-202720670.html
- **Kids' exertion**: in youth studies (ages 8–12, 10-minute bouts), Beat Saber produced *light* intensity and Thrill of the Fight about matched treadmill walking, with "minimal cybersickness." Gorilla Tag reached *moderate* intensity. All were rated highly enjoyable. https://digitalcommons.wku.edu/ijesab/vol16/iss2/351 · https://games.jmir.org/2025/1/e66593/XML

### Sessions and comfort on Quest
- Meta's minimum age is **10**, using parent-managed preteen accounts for ages 10–12. Parents approve apps, can set daily time limits, and can **disable or filter the Quest Browser**. https://www.roadtovr.com/meta-quest-age-limit-10-years/ · https://familycenter.meta.com/static-resource/meta-quest-parent-guide/
- Meta advises **breaks every 30 min** when starting out, and more frequent, longer breaks for younger kids. https://www.meta.com/tw/en/quest/safety-center/parental-supervision/ · https://webcf.waybackmachine.org/web/20240117063743/https://www.meta.com/quest/parent-info

**Design implications**
- Make the math *the* mechanic. A punch is an answer; never pause play for a quiz modal. (Habgood)
- Copy the stickiness drivers: **30–60 s rounds, speed scoring, combo multipliers, collectible cosmetics, a visible personal "rank."**
- Avoid Prodigy's mistakes: no paywalls, no upsell, and no "ask your parent" prompts.
- Design for **10–15 min runs** and a natural stopping point well before 30 min. Keep it standing and stationary, with no locomotion.
- **Ship as a PWA or packaged app**, not just a URL. On preteen accounts, parents may block the Browser entirely.

---

## 2. Gen Alpha humor and slang (late 2026)

### Status table
The most-searched Gen Alpha terms Jan–Aug 2026 were 6-7, chud, rizz, cap/no cap, mogging, bop, larping, aura, sigma, crash out, glazing and huzz. https://www.mentalfloss.com/language/slang/top-gen-alpha-slang-2026 · https://www.euronews.com/2026/09/28/from-chud-to-bop-most-searched-gen-alpha-slang-terms-of-2026-so-far-revealed
A 2026 viral "in/out" video by a Gen Alpha group ruled **slay, simp, period(t) and 😂 out**. https://www.yourtango.com/entertainment/gen-alpha-says-use-these-slang-words-officially-old

| Term | Status | Use in game? |
|---|---|---|
| W / L | Evergreen | ✅ Core feedback words |
| aura, +N aura, aura farming | Hot | ✅ "+100 AURA" is perfect as a score label |
| cooked / let 'em cook | Hot | ✅ "COOKED" on run death |
| lock in / locked in | Hot | ✅ Combo and boss intro |
| tuff, peak, goated, diabolical, absolute cinema | Current | ✅ |
| mid, cap / no cap, bet, NPC, chat is this real | Current, a bit worn | ✅ Use sparingly |
| delulu, crash out, unc, ate | Current | ⚠️ "crashed out" is OK on run death; skip the rest |
| **6-7** | Peak 2025 (Dictionary.com Word of the Year); still top-searched in 2026; banned in some classrooms | ⚠️ A natural rare easter egg in a times-table game (6×7). Keep it rare: teachers and parents are sick of it. https://www.axios.com/2025/10/06/tiktok-6-7-gen-alpha-classroom-bans |
| brainrot | Meta-term (Oxford Word of the Year 2024) | ✅ As a *style*; don't say it on screen |
| sus, bussin, it's giving, slay, simp, no shot | Stale or "old" | ❌ Reads as cringe from adults |
| Ohio, skibidi | Stale, and Skibidi is a franchise IP (film/TV studio, DMCA history) | ❌ https://www.pcgamer.com/movies-tv/mystery-afoot-as-garrys-mod-gets-hit-by-skibi-dmca-apparently-on-behalf-of-michael-bays-skibidi-toilet-film-studio-can-you-believe-the-cheek |
| rizz, huzz, bop, gyatt, glazing | Romantic or sexual connotation, or misogynistic | ❌ Never |
| mogging, chopped, looksmaxxing, mewing | Looks and body-shaming | ❌ Never |
| sigma, based, chud, foid | Manosphere or extremist roots, or insults | ❌ Never |
| clanker | Anti-robot "slur"; criticized as a racist proxy | ❌ Never (tempting for robot enemies, but don't) https://www.salon.com/2025/08/19/is-clanker-a-slur-anti-robot-jokes-accused-of-being-thinly-veiled-racism |
| fanum tax, kai cenat refs, "quiet on the creek" | Named after real streamers | ❌ Never |
| Italian-brainrot named characters (Tung Tung Tung Sahur, Tralalero Tralala, Bombardiro Crocodilo, etc.) | Active IP fight: cease-and-desists, a federal suit, competing trademark filings, removal from *Steal a Brainrot*. Some original audio has been reported to contain blasphemy or war references (unverified) | ❌ No names, likenesses or audio. ✅ The *genre* (absurd object+animal hybrids, sing-song names, deadpan) is free to use. https://gamesbeat.com/the-battle-over-tung-tung-tung-sahur-is-testing-the-limits-of-copyright-and-trademark-law/ · https://www.plagiarismtoday.com/2026/10/07/who-owns-this-brainrot-character/ |

### ~40 safe on-screen callouts
- **Correct hit (rotate, never the same twice in a row):** `W` · `CLEAN` · `TUFF` · `EZ` · `+10 AURA` · `BIG BRAIN` · `CALCULATED` · `GOATED` · `NO CAP` · `PEAK`
- **Combo milestones (×5/×10/×15/×20/×25/×30/×50):** `HEATING UP` → `LOCKED IN` → `+1000 AURA` → `DIABOLICAL` → `LET 'EM COOK` → `ABSOLUTE CINEMA` → `UNREAL. GENUINELY.`
- **Wrong hit (light, never shaming; always followed by the correct fact):** `NAH` · `L (TINY ONE)` · `NOT IT` · `CAP DETECTED` · `MID PUNCH` · `ALMOST` · `PLOT TWIST`, then `7 × 8 = 56`
- **Taking damage:** `BONK` · `OUCH` · `-50 AURA` · `BRO WHAT` · `HOLD UP` · `RUDE`
- **Boss intro:** `LOCK IN.` · `FINAL BOSS ENERGY` · `CHAT, IS THIS REAL?` · `THE AURA IS IMMENSE` · `BOSS FIGHT. NO CAP.`
- **Run death:** `COOKED` · `GG` · `RUN IT BACK` · `CRASHED OUT` · `WELL… THAT HAPPENED`
- **New high score:** `NEW PB` · `CERTIFIED W` · `AURA OVERFLOW` · `HISTORY MADE` · `LEGENDARY`
- **Easter egg (rare, ≤1 per run):** when 6×7 is answered correctly, the block "shrugs" with a two-hand bob gesture and shows `SIX SEVEN!`.

### Original enemy concepts (absurd hybrid style, no existing IP)
| Name | Visual | Behavior |
|---|---|---|
| **Sir Loafalot** | Bread-loaf knight on chicken legs, holding a toothpick lance | Marches in slowly holding a *number shield*. Punch it if the shield matches the rule; otherwise wait for the shield to flip. |
| **Blendingo** | Kitchen blender on flamingo legs | Spins and **re-rolls the numbers on 2 nearby blocks** every ~4 s, so the player has to re-read. |
| **Sockodile** | Striped sock-puppet crocodile with googly eyes | Lunges at a hand after a 0.8 s mouth-open tell. Pull back to dodge, or punch its nose for a parry bonus. |
| **Wi-Fido** | Puppy made of a router, wobbling antenna ears | Barks "lag bubbles" that slow nearby blocks to half speed. Pop the bubbles to clear them. A friendly-looking nuisance. |
| **Duckuum** | Rubber duck fused with a robot vacuum | Sucks *correct* blocks toward itself. Punch it to burst them back out for a bonus. |
| **Toastwing** | Winged toaster | Lobs toast slices stamped with products. Punching a matching slice deflects it back at the boss. |
| **Mopstache** | Mop-head with a giant handlebar mustache, on a roller skate | Wipes across the field, leaving a soap trail that makes blocks drift sideways. |
| **BOSS: Calcu-Llama** | Llama whose torso is a giant retro calculator; sunglasses | Spits wrong-answer blocks. Its weak-point screen shows a fact (`8 × 7`), and punching the matching answer block cracks the screen. Phases scale to the player's weakest facts. |
Run a quick trademark and app-store name search before shipping. Puns like these sometimes exist as products.

**Design implications**
- Keep the slang **data-driven** (a JSON table of callouts with tags for hot, current and retire), because slang turns over every 6–12 months.
- Default to evergreen gamer words (W/L, GG, PB, combo). Sprinkle in hot terms and **cap each callout's frequency**.
- Wrong-answer callouts are self-deprecating and tiny. The *math* (the correct fact) is the big text.
- Use the Italian-brainrot *structure* (deadpan absurd hybrids with sing-song names) and nothing from its characters.

---

## 3. Learning science: multiplication fact fluency

### Core findings
- **Fluency threshold:** a fact is "fluent" when it is recalled correctly in **about 3 s or less** (Baroody 2006; Brendefur et al. 2015). Interventions start with a ~5 s limit and shrink it toward **~1.5 s** to force retrieval over counting. https://mrbartonmaths.com/research/fluency.html · https://numbersensemaths.com/research-principles/research-principle-10
- **Retrieval practice and immediate feedback:** fluency interventions such as Cover-Copy-Compare work through many opportunities to respond plus *immediate accuracy feedback*, which stops kids from rehearsing errors. Adding **error drill** (re-practicing the missed fact right away) improved results further. https://centralreach.com/wp-content/uploads/2019/04/2016-Stocker-and-Kubina.pdf
- **New-fact load:** practice small sets of **2–4 unknown facts at a time**, mixed at roughly a **9:1 known-to-unknown ratio** (incremental-rehearsal style). https://numbersensemaths.com/research-principles/research-principle-10 · https://ride.ri.gov/Portals/0/Uploads/Documents/Information-and-Accountability-User-Friendly-Data/Accountability/SPP/Cover-Copy-Compare.pdf
- **Interleaving:** with children, mixed practice *hurt* in-session scores but **doubled** scores on a test a day later (Taylor & Rohrer 2010). A 54-class RCT found d ≈ 0.83. The benefit shows up at delays. https://notes.andymatuschak.org/zRY97sYVywAXpocmqGiv6aL6TM7aA6ZK49Y2 · https://www.frontiersin.org/articles/10.3389/fpsyg.2019.02296/pdf
- **Spacing:** the optimal review gap is roughly **10–20% of the retention interval**, and the best gap grows as the delay grows (Cepeda et al. 2008, n>1,350). https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf
- **"85% rule":** for simple right/wrong learning, the fastest learning comes at **~85% accuracy** (about 15.9% error) (Wilson et al. 2019, *Nat Commun* 10:4646). The authors tested it on models, so treat it as a target band, not a law. https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579
- **Hard facts:** the problem-size effect means larger products are slower and more error-prone. Errors come from **interference between neighboring products** (48 vs 56 for 8×6) (Campbell & Graham 1985). https://www.frontiersin.org/articles/10.3389/fnhum.2013.00189/full
  - Which fact is hardest depends on the dataset: **6×8** was wrong 63% of the time in a 232-child study; **9×6** came out hardest in a ~250M-answer study; Transum names **8×12**. Practitioners commonly cite **7×8**. https://ibmathsresources.com/2013/06/01/which-times-tables-do-students-find-difficult-an-investigation/ · https://edcentral.uk/ednews/early-years-primary/41711-hardest-sum-in-the-times-tables-is-9x6 · https://www.transum.org/Press_Release.asp
  - In short, the 6, 7, 8, 9 and 12 tables (products 42–96) are the hard core, and ×2, ×5, ×10, ×11 and squares are easy. **[src+rec]**
- **Commutativity:** 2..12 × 2..12 gives 121 ordered facts but only **66 unordered pairs**. Treat 7×8 and 8×7 as one memory item but present both orders. **[rec]**
- **Leitner:** cards move up a box when answered correctly and drop to box 1 on a miss; higher boxes are reviewed less often. It is a simple spaced-repetition scheduler. Kids' apps use it, but controlled evidence specific to children's math is thin. **[src: general; rec: apply]**

### Proposed hidden engine **[rec]**
- **Item:** the unordered pair {a,b}, with per-order stats kept for diagnostics.
- **Boxes 0–5:** 0 = unseen; 1 = learning; 2 = shaky; 3 = fluent (<3 s); 4 = automatic (<2 s); 5 = mastered (automatic on 3 separate days).
  - Promote one box on a correct *and* fast answer.
  - Stay put on correct but slow (≥3 s).
  - Drop to 1 on a wrong answer.
- **Latency in a punch game includes motor time.** Calibrate a per-player **motor baseline** = median time-to-punch on trivially easy items (×1, ×10, "punch the 5"). Retrieval time = raw time − baseline. Fluent: retrieval ≤ 2.5 s. Automatic: ≤ 1.5 s.
- **Round composition:** ~70% review from boxes 3–5, ~20% boxes 1–2, and **≤10% new (2–4 new facts per session at most)**. Interleave tables within every round.
- **Spacing:** box 1 can repeat within a round (error drill ~20–40 s later). Box 2: next round. Box 3: next session. Box 4: ~2–3 days. Box 5: ~1–2 weeks.
- **DDA band:** keep rolling accuracy at **80–90%**. Above 90%, speed up blocks, add decoys or pull harder facts. Below 75%, slow down, use fewer decoys and more review.
- **Decoys should be interference neighbors**, not random numbers. For "MULTIPLES OF 7", use 48, 54 and 63-adjacent values like 64. For 7×8, use 54, 48 and 64. This trains discrimination of the confusable set.
- **Rule types map back to facts.** "7 × 8 = ?" maps to one item. "MULTIPLES OF 7": each block hit or missed maps to {7,k}. "FACTORS OF 36" maps to {4,9}, {6,6}, {3,12}, {2,18} (skip >12). Wrong punches of a non-multiple log a *confusion* event.
- **Error feedback:** at most 1–1.5 s. The correct fact appears big and world-locked near the block (`7 × 8 = 56`), with an optional quick dot-array flash for 2–3 visual learners, and the fact is re-queued within the round. No lectures and no "try again" screens.

**Design implications**
- Speed is part of mastery. Score and box movement both reward fast retrieval, not just correctness.
- Never show box levels or "learning" language to the kid. Surface it as rank, aura or cosmetics.
- The boss uses the player's weakest 3–5 facts, which turns review into the climax.
- Keep difficulty in an 80–90% hit band: kids feel competent, and the engine keeps learning.

---

## 4. Game feel and VR specifics

### Juice that works in VR
- **Hit-stop:** light hits 2–4 frames, heavy hits 8–12 frames. Past ~20 frames it "feels like a bug." Time it in milliseconds, not frames. https://gamejuice.pages.dev/articles/hit-stop-frame-trick · https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
  - **VR rule [rec]:** freeze or slow only the *struck object and enemies* (time-scale on game entities) for **40–70 ms** on normal hits and **100–150 ms** on boss crits. **Head and hand tracking and rendering never pause.**
- **Never move the camera.** Vision–vestibular mismatch causes discomfort; keep the camera stable and predictable. https://developers.meta.com/horizon/design/locomotion-best-practices/ · https://developers.meta.com/vr/design/locomotion-comfort-usability/
  - **Screen-shake substitutes [rec]:** shake the *object*; scale-punch the world-anchored HUD panel; spawn world-locked radial particle bursts; add a bass "thump" in spatial audio; pulse the controller haptics.
  - **Damage cue:** a single soft peripheral tint, fading over ~300 ms, plus a directional audio cue.
- **Haptics:** Meta recommends a brief pulse to confirm an action and a longer rumble for impact, synced with audio and visuals. https://developers.meta.com/horizon/essentials/horizon-os-input/ · https://developers.meta.com/horizon/design/haptics-overview/
  - **[rec] WebXR `gamepad.hapticActuators[0].pulse(intensity, ms)` values:**
    - Correct: 0.4 for 25 ms.
    - Combo tier-up: 0.7 for 60 ms.
    - Wrong: two taps of 0.25 for 20 ms, 60 ms apart (distinct, not punishing).
    - Damage: 0.8 for 180 ms.
    - Boss crit: 1.0 for 120 ms.
- **Sound layering [rec]:** transient "tick" + body "thump" + tonal layer. Raise pitch one semitone per combo step, capped at +12, and reset on a miss. Quantize hit sounds to the music beat for a rhythm-game feel. Give the correct-fact readout its own clean chime.
- **Combo design [rec]:** multiplier ×1→×2→×3→×4 at 5/10/20/30 hits. A wrong *punch* drops one tier; it doesn't zero the combo (forgiving). Letting a correct block pass breaks the streak only on "= ?" rounds.
- **Flow:** a 3-2-1 rule reveal → 30–45 s action → 3 s summary pop → next rule. No menus between rounds of a run.

### Photosensitivity (non-negotiable)
- **WCAG 2.3.1:** nothing flashes **more than 3 times in any 1 s**, unless the flash stays below the general and red flash thresholds. A flash is a pair of opposing luminance changes ≥10% where the darker state is < 0.80 relative luminance. **Saturated-red transitions** are their own risk class. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- The area test treats ~25% of a **10° visual field** as "large." **In VR, almost any effect near the face exceeds 10°.** Treat every full-view or near-hand effect as large. **[src+rec]**
- The Harding FPA test (UK broadcast standard, ITU-R BT.1702 basis) flags the same things: >3 flashes/s, red flashes, and high-contrast regular patterns such as stripes or checkerboards. The highest-risk band is about **3–30 Hz**. **[general knowledge; verify before cert]**
- **Rules [rec]:**
  - Cap global effects to ≤3 luminance pulses per second.
  - Make combo "flashes" hue shifts at low luminance delta.
  - No strobing skyboxes.
  - No red full-field flashes; damage tint is orange-ish and low-alpha.
  - No scrolling high-contrast stripes.
  - Include a "Reduce Flashing" toggle, on by default.

### Text legibility
- Meta's guidance: text ≥14 px is the readability floor and ≥18 px is comfortable (2D panel terms). Use bold, sans-serif, high x-height type (Inter). Always test on device. https://developers.meta.com/horizon/design/styles_typography/
- Research: comfortable VR reading size is **41 ± 14 dmm** (≈2.3° ± 0.8°; 1 dmm = 1 mm at 1 m), with a ~1.33° minimum. Text rotated ≥60° from the viewer needs much larger size. https://arxiv.org/pdf/2004.01545 · https://vovakurbatov.pages.dev/articles/10-rules-of-using-fonts-in-virtual-reality
- **[rec] Targets on Quest 3 (~25 px/degree):**
  - Block digits ≥ **3° tall**: ≈ 8 cm at 1.5 m, ≈ 10.5 cm at 2 m.
  - Rule banner ≥ **2.5°**, placed 2.5–3 m away and 5–10° below eye level.
  - Callouts ≥ 2°.
  - Numbers always **billboard toward the head**.
  - White text, dark outline, on a solid plate.
  - Keep core info within ±20° of view center. Gameplay blocks arrive at chest height, 0.4–0.7 m reach.

### Quest 3 WebXR performance budget
- Meta's figures for Quest 3: **<200 draw calls and <1.5M triangles per frame**. Quest 2: <100 and <750K. The 72 Hz target gives a 13.8 ms frame. https://developers.meta.com/horizon/resources/device-optimization-comparison/
- For WebXR: draw calls are CPU-bound, and 1,000 separate draws will miss 72 fps. Batch and instance. Use **one** real-time light (no shadow-casting point lights: 6 shadow maps each) and KTX2/Basis textures. Update animations at 30 Hz, staggered. Apps are often fill-rate bound. https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/
- **Post-processing:** three.js EffectComposer's multi-pass approach "does not perform well in XR." Bloom output has been inconsistent in headsets. https://discourse.threejs.org/t/is-it-possible-to-use-threejs-postprocessing-in-web-vr/36333 · https://github.com/mrdoob/three.js/pull/26160
- **[rec] Our budget** (JavaScript overhead plus kids' headsets running hot):
  - ≤ **100 draw calls** and ≤ **300–500K triangles**.
  - InstancedMesh for blocks and particles.
  - **No post-processing**: fake bloom with additive sprites and emissive colors.
  - Fixed foveation on, framebuffer scale 1.0.
  - Target **72 Hz**, opt into 90 Hz only with headroom. Profile with OVR Metrics Tool.

**Design implications**
- All juice is world-space, object-local or haptic. Zero camera motion.
- Run a flash budget checker in debug builds: count large luminance changes per second.
- Big, billboarded, bold digits.
- No post-processing pipeline, and instance everything.

---

## 5. Roguelike meta-progression for kids

### Evidence and guardrails
- Regulators are acting. HoYoverse paid **$20M** (Jan 2025) over misleading kids on loot-box odds and costs, plus COPPA violations, and was barred from selling loot boxes to under-16s without consent. https://www.bleepingcomputer.com/news/gaming/ftc-cracks-down-on-genshin-impact-gacha-loot-box-practices
- Research on children's games catalogs 13–18 manipulative patterns: visual tricks, unclear labels, **time pressure**, and **gambling mechanics**. Interviews with kids aged 10–15 show these make them play or spend more than intended. https://uni.oslomet.no/belong/2023/11/21/from-digital-playground-to-dark-patterns/ · https://www.deceptive.design/articles/dark-patterns-in-the-design-of-games
- Blooket's random "box" opening is loot-box-shaped even without money. Don't copy it.

### Recommended loops **[rec]**
- **In-run (resets each run):**
  - After each non-boss round, offer **pick 1 of 3 upgrades**.
  - Upgrade ideas: *Double Knuckles* (2× points on facts from your weakest table), *Magnet Mitts* (correct blocks drift toward the hands), *Shield Bubble* (absorbs 1 hit), *Slow-Mo Snap* (2 s time slow, charged by combo), *Chain Lightning* (a correct punch zaps 1 other correct block), *Second Wind* (revive once).
  - Upgrades affect *how you punch*, never which facts appear.
- **Persistent:**
  - **Sparks** are earned from every run, win or lose, at a fixed visible rate. Spend them on cosmetics and on a small number of **sidegrade unlocks** (new starting upgrades, new arenas, new enemy variety).
  - Raw power stays capped, so skill and fact mastery matter more than grinding.
- **Mastery-driven unlocks:** the hidden learning engine drives visible rewards.
  - "Master the 7s" unlocks the *Lucky Seven* glove.
  - Each table at box ≥4 lights a star on a **"Constellation" of 66 stars**. This is the main long-term goal, and it doubles as a parent-legible progress map.
- **Run length:**
  - 15 rounds × ~40 s plus 3 bosses ≈ **10–12 min**.
  - Boss every 5th round.
  - "Quick run" option of 5 rounds and 1 boss ≈ 4 min.
  - Session soft cap: a friendly "hydrate + stretch" card at ~25 min (game time only).
- **Banned:**
  - Loot boxes and random paid drops.
  - Daily-login streaks that punish missing a day.
  - Expiring or limited-time items.
  - Energy timers.
  - Premium currency.
  - Leaderboards against strangers (there is no network anyway).
  - Ghost runs of "your past self" are fine.
- **Cosmetic hand-skin ideas:**
  - Pizza-slice gloves.
  - Glow-stick knuckles.
  - Gummy-bear fists.
  - Retro-calculator gauntlets that display your combo.
  - Lava-lamp mitts.
  - Holo-foil trading-card gloves.
  - Cactus boxing gloves (harmless, bouncy).
  - Galaxy gloves that show your mastery constellation.
  - Rubber-chicken fists that squeak on hit.
  - Plus trails, hit-spark styles, block skins and arena themes.
  - Every item shows its exact unlock condition. No mystery boxes.

**Design implications**
- Every run pays out something. Progress is deterministic and visible.
- Cosmetics are the long tail, and mastery stars are the spine.
- In-run upgrades give roguelike variety without gating learning.

---

## 6. Parents and COPPA

### What parents want
- **75%** of parents are enthusiastic about screen media for learning new things (Common Sense Census 2025). Parents choose apps on educational value. https://www.bespacific.com/?p=111702 · https://www.abcmouse.com/learn/advice/education-app-statistics-every-parent-should-know/77938
- Parents' biggest gripes with Prodigy-style apps are upsells, ads, and kids pestering for purchases. https://www.nbcnews.com/news/amp/ncna1258294
- **Quest controls:** parents approve each app, set time limits (reported default daily limit: 2 h) and can switch off the Browser. https://familycenter.meta.com/static-resource/meta-quest-parent-guide/
- **[rec] Parent screen** behind a simple gate, e.g. "hold both grips 3 s + solve 23×4":
  - The 66-fact heat map (mastered, fluent, learning, unseen).
  - Facts improved this week.
  - Median response time trend.
  - Minutes played per day for the last 14 days.
  - Hardest 5 facts.
  - Optional daily play cap.
  - "Export report" as a locally downloaded file.
  - A plain statement: no ads, no chat, no purchases, no data leaves this headset.

### COPPA notes (not legal advice)
- COPPA applies to operators that **collect, use or disclose** personal information from children under 13. FTC FAQ C.1. https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- FTC FAQ F.5: "You are not collecting personal information simply because your app interacts with personal information." Data that stays on the device and is **never transmitted** is not collection. (Same URL.)
- **Persistent identifiers** (cookies, IP addresses, device IDs) count as personal information. The narrow exception covers use solely for "support for the internal operations." FAQ C.5 and I.2. (Same URL.)
- The amended rule took effect **June 23, 2025**, with a compliance deadline of **April 22, 2026**. It adds a written security program and retention policies for operators who *do* collect. https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- **[rec] Engineering checklist:**
  - **No third-party requests**: no Google Fonts, no CDN scripts, no analytics, no crash reporting. Self-host every asset and font, because a CDN fetch leaks the child's IP address to a third party.
  - Ship a strict **CSP** (`connect-src 'none'` once loaded; `default-src 'self'`).
  - Use a service worker for offline play.
  - Store everything in IndexedDB/localStorage on the headset.
  - **No free-text name entry.** Use a generated nickname such as "Turbo Waffle".
  - No voice or mic, and no camera or passthrough capture.
  - Keep static-host access logs off or minimal.
  - Publish a one-paragraph privacy notice anyway (store requirement, and it reassures parents).
  - If the game is ever listed on the Horizon Store, the IARC rating and Meta's preteen policies apply.

**Design implications**
- "Nothing leaves the headset" is both the COPPA strategy and a parent-facing selling point.
- Progress is shown to parents in fact terms, and to kids in aura and star terms.
- Ship as a packaged PWA so parents can approve it like any app.

---

## Sources not independently verified
- The TTRS speed-tier names and the 2 h Meta default limit come from secondary pages.
- The Harding 3–30 Hz band is general knowledge.
- The italian-brainrot audio controversy claim is unverified.
- The enemy names need a trademark check.
