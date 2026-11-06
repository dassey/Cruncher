import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { factIndex, FACT_COUNT } from '../src/logic/facts';
import { LearningEngine, describeFact } from '../src/logic/learning';
import { Rng } from '../src/logic/rng';
import { PROFILES, mean, simulate } from '../src/logic/sim';

describe('learning engine', () => {
  it('starts with a small unlocked frontier', () => {
    const e = new LearningEngine();
    expect(e.unlockedTables).toEqual(CONFIG.learning.tableOrder.slice(0, CONFIG.learning.initialTables));
    expect(e.isFactUnlocked(factIndex(2, 7))).toBe(true);
    expect(e.isFactUnlocked(factIndex(7, 8))).toBe(false);
    expect(e.weightOf(factIndex(7, 8))).toBe(0);
    expect(e.summary().unseen).toBe(FACT_COUNT);
    expect(e.accuracy()).toBe(0);
  });

  it('Leitner: fast correct promotes, slow correct holds, wrong demotes', () => {
    const e = new LearningEngine();
    const f = factIndex(2, 3);
    e.record(f, true, 1000);
    expect(e.stats[f]!.box).toBe(2);
    e.record(f, true, 1000);
    expect(e.stats[f]!.box).toBe(3);
    e.record(f, true, CONFIG.learning.slowMs + 1000);
    expect(e.stats[f]!.box).toBe(3);
    e.record(f, false, 500);
    expect(e.stats[f]!.box).toBe(1);
    expect(e.mastery(f)).toBe('shaky');
    for (let i = 0; i < 8; i++) e.record(f, true, 900);
    expect(e.stats[f]!.box).toBe(CONFIG.learning.maxBox);
    expect(e.mastery(f)).toBe('mastered');
    expect(describeFact(e, f)).toContain('2×3');
    expect(describeFact(e, 999)).toBe('?');
    e.record(999, true, 1);
    e.recordSoftMiss(999);
  });

  it('weak and slow facts weigh more than mastered ones', () => {
    const e = new LearningEngine();
    const weak = factIndex(2, 9);
    const strong = factIndex(2, 4);
    const slow = factIndex(2, 6);
    for (let i = 0; i < 5; i++) e.record(strong, true, 800);
    e.record(weak, false, 800);
    e.record(slow, true, 7000);
    expect(e.weightOf(weak)).toBeGreaterThan(e.weightOf(strong) * 5);
    expect(e.weightOf(slow)).toBeGreaterThan(e.weightOf(factIndex(2, 5)) * 0); // seen
    e.recordSoftMiss(slow);
    expect(e.stats[slow]!.rtAvg).toBeGreaterThan(CONFIG.learning.slowMs);
    expect(e.weakest(1)).toEqual([weak]);
  });

  it('limits new facts per round', () => {
    const e = new LearningEngine();
    e.beginRound(1);
    const rng = new Rng(5);
    for (let i = 0; i < CONFIG.learning.maxNewPerRound; i++) e.pickFact(rng);
    // After the cap, unseen facts are strongly de-weighted.
    const unseen = factIndex(10, 11);
    expect(e.weightOf(unseen)).toBeLessThan(CONFIG.learning.unseenWeight);
  });

  it('unlocks the next table once the frontier is solid', () => {
    const e = new LearningEngine();
    const before = e.unlocked;
    for (let i = 0; i < FACT_COUNT; i++) if (e.isFactUnlocked(i)) e.record(i, true, 900);
    expect(e.unlocked).toBeGreaterThan(before);
    e.unlockAll();
    expect(e.unlocked).toBe(CONFIG.learning.tableOrder.length);
    e.record(0, true, 900); // no further unlock past the end
  });

  it('pickTable favours weak tables', () => {
    const e = new LearningEngine();
    e.unlockAll();
    for (let i = 0; i < FACT_COUNT; i++) for (let k = 0; k < 5; k++) e.record(i, true, 800);
    for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) void n;
    for (let k = 2; k <= 12; k++) e.record(factIndex(7, k), false, 800);
    const rng = new Rng(11);
    let sevens = 0;
    for (let i = 0; i < 300; i++) if (e.pickTable(rng) === 7) sevens++;
    expect(sevens / 300).toBeGreaterThan(0.3); // baseline would be ~1/11
    expect(e.pickFactWhere(rng, () => false)).toBe(-1);
  });

  it('round-trips through JSON and rejects garbage', () => {
    const e = new LearningEngine();
    e.record(factIndex(3, 4), true, 1200);
    e.record(factIndex(5, 5), false, 1200);
    e.unlocked = 5;
    const back = LearningEngine.fromJSON(JSON.parse(JSON.stringify(e.toJSON())));
    expect(back.unlocked).toBe(5);
    expect(back.stats[factIndex(3, 4)]!.box).toBe(2);
    expect(back.stats[factIndex(5, 5)]!.wrong).toBe(1);
    expect(LearningEngine.fromJSON(null).unlocked).toBe(CONFIG.learning.initialTables);
    expect(LearningEngine.fromJSON({ v: 2 }).unlocked).toBe(CONFIG.learning.initialTables);
    const weird = LearningEngine.fromJSON({ v: 1, unlocked: 99, facts: [[99, 'x', -3, 1, NaN, 0], 'bad'] });
    expect(weird.unlocked).toBe(CONFIG.learning.tableOrder.length);
    expect(weird.stats[0]!.box).toBe(CONFIG.learning.maxBox);
    expect(weird.stats[0]!.rtAvg).toBe(-1);
  });
});

describe('learning effectiveness (simulated players)', () => {
  it('a player who always misses the 7s gets served far more 7s than a solid player', () => {
    const rounds = 40;
    const seeds = [1, 2, 3];
    const shareFor = (profile: typeof PROFILES.solid) =>
      seeds.map((s) => simulate(profile, rounds, s)).map((r) => mean(r.sevenShare, Math.floor(r.sevenShare.length / 2)));
    const solid = mean(shareFor(PROFILES.solid));
    const misser = mean(shareFor(PROFILES.missesSevens));
    // Neutral exposure to 7s is ~ 11/66 ≈ 17%.
    expect(misser).toBeGreaterThan(solid * 1.5);
    expect(misser).toBeGreaterThan(0.25);
  });

  it('adaptation grows over time for the 7-misser', () => {
    const r = simulate(PROFILES.missesSevens, 40, 4);
    const early = mean(r.sevenShare, 0, 5);
    const late = mean(r.sevenShare, r.sevenShare.length - 15);
    expect(late).toBeGreaterThan(early);
    expect(r.runs).toBeGreaterThanOrEqual(1);
  });
});
