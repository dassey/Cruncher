import { describe, expect, it } from 'vitest';
import { factIndex } from '../src/logic/facts';
import { bossChoices, correctPool, countRemaining, distractorPool, generateGrid, rerollBlock } from '../src/logic/grid';
import { LearningEngine } from '../src/logic/learning';
import { Rng } from '../src/logic/rng';
import { RICH_TARGETS, RULE_MIX, attributeFact, blockLabel, chooseRule, isCorrect, maxValue, readout, receipt, ruleFor } from '../src/logic/rules';

const P = (value: number) => ({ value, a: 0, b: 0 });
const E = (a: number, b: number) => ({ value: a * b, a, b });

describe('rules', () => {
  it('multiples', () => {
    const r = ruleFor('multiples', 7);
    expect(r.title).toBe('MULTIPLES OF 7');
    expect(isCorrect(r, P(56))).toBe(true);
    expect(isCorrect(r, P(57))).toBe(false);
    expect(isCorrect(r, P(91))).toBe(false); // 7×13 out of range
    expect(readout(r, P(26))).toBe('7 × 4 = 28');
    expect(receipt(r, P(56))).toBe('7×8');
    expect(attributeFact(r, P(56))).toBe(factIndex(7, 8));
    expect(blockLabel(r, P(56))).toBe('56');
    expect(maxValue(r)).toBe(88);
  });
  it('equals', () => {
    const r = ruleFor('equals', 24);
    expect(r.title).toBe('MAKE 24');
    expect(isCorrect(r, E(3, 8))).toBe(true);
    expect(isCorrect(r, E(5, 5))).toBe(false);
    expect(readout(r, E(5, 5))).toBe('5 × 5 = 25');
    expect(blockLabel(r, E(3, 8))).toBe('3×8');
    expect(receipt(r, E(4, 6))).toBe('4×6');
    expect(attributeFact(r, E(8, 3))).toBe(factIndex(3, 8));
    expect(maxValue(r)).toBe(144);
  });
  it('factors', () => {
    const r = ruleFor('factors', 36);
    expect(r.title).toBe('FACTORS OF 36');
    expect(isCorrect(r, P(9))).toBe(true);
    expect(isCorrect(r, P(8))).toBe(false);
    expect(readout(r, P(8))).toBe('8 × 5 = 40');
    expect(receipt(r, P(9))).toBe('9×4');
    expect(attributeFact(r, P(9))).toBe(factIndex(9, 4));
    expect(attributeFact(r, P(1))).toBe(-1);
  });
  it('rich targets and rule mix', () => {
    expect(RICH_TARGETS).toContain(24);
    expect(RICH_TARGETS).not.toContain(49);
    expect(RULE_MIX.byRound(0)).toEqual([1, 0, 0]);
    expect(RULE_MIX.byRound(3)[1]).toBeGreaterThan(0);
    expect(RULE_MIX.byRound(7)[2]).toBeGreaterThan(0);
    expect(RULE_MIX.byRound(20)[2]).toBeGreaterThan(0);
  });
  it('chooseRule respects round mix and avoids repeats', () => {
    const e = new LearningEngine();
    e.unlockAll();
    const rng = new Rng(2);
    for (let i = 0; i < 30; i++) expect(chooseRule(0, e, rng).kind).toBe('multiples');
    const kinds = new Set<string>();
    let prev = chooseRule(12, e, rng);
    for (let i = 0; i < 80; i++) {
      const r = chooseRule(12, e, rng, prev);
      kinds.add(r.kind);
      expect(r.kind === prev.kind && r.n === prev.n).toBe(false);
      prev = r;
    }
    expect(kinds.size).toBe(3);
  });
});

describe('grid', () => {
  it('generates full, solvable grids for every rule kind', () => {
    const rng = new Rng(8);
    const e = new LearningEngine();
    e.unlockAll();
    for (const rule of [ruleFor('multiples', 7), ruleFor('equals', 36), ruleFor('factors', 24), ruleFor('multiples', 12)]) {
      for (const [c, r] of [
        [5, 4],
        [7, 5],
      ] as const) {
        const g = generateGrid(rule, c, r, rng, e);
        expect(g).toHaveLength(c * r);
        const correct = g.filter((b) => b.correct);
        expect(correct.length).toBeGreaterThanOrEqual(2);
        expect(correct.length).toBeLessThan(g.length);
        for (const b of g) expect(b.correct).toBe(isCorrect(rule, b));
        expect(countRemaining(g)).toBe(correct.length);
        expect(new Set(g.map((b) => `${b.col},${b.row}`)).size).toBe(g.length);
      }
    }
  });
  it('distractors are never correct and are near misses', () => {
    const r = ruleFor('multiples', 7);
    const d = distractorPool(r);
    expect(d.length).toBeGreaterThan(10);
    for (const v of d) expect(isCorrect(r, v)).toBe(false);
    expect(d.some((v) => v.value === 55 || v.value === 57)).toBe(true);
    expect(correctPool(ruleFor('factors', 36)).map((v) => v.value)).toEqual([1, 2, 3, 4, 6, 9, 12]);
    for (const v of distractorPool(ruleFor('equals', 24))) expect(v.a * v.b).not.toBe(24);
  });
  it('reroll keeps correctness', () => {
    const rng = new Rng(3);
    const rule = ruleFor('multiples', 6);
    const g = generateGrid(rule, 5, 4, rng);
    for (const b of g) {
      const n = rerollBlock(rule, b, rng);
      expect(n.correct).toBe(b.correct);
      expect(n.id).toBe(b.id);
    }
    const lone = { ...g[0]!, correct: true, value: 12, a: 0, b: 0 };
    expect(rerollBlock(ruleFor('factors', 2), { ...lone, value: 2 }, rng).value).not.toBe(2);
  });
  it('boss choices include the answer exactly once', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 50; i++) {
      const c = bossChoices(7, 8, 3, rng);
      expect(c).toHaveLength(3);
      expect(c.filter((x) => x === 56)).toHaveLength(1);
      expect(new Set(c).size).toBe(3);
    }
  });
});
