import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { CALLOUTS, CalloutPicker, isSixSeven } from '../src/logic/callouts';
import { roundParams, updateHeat } from '../src/logic/difficulty';
import { Emitter } from '../src/logic/events';
import { FACTS, FACT_COUNT, TABLES, clamp, factHasTable, factIndex, factLabel, factorPairs, factsOfTable } from '../src/logic/facts';
import { FlashGovernor } from '../src/logic/flash-governor';
import { Rng } from '../src/logic/rng';
import { comboMultiplier, comboTier, pointsForHit, shardsForRun } from '../src/logic/scoring';
import { BrowserKV, MemoryKV, readJSON, writeJSON } from '../src/logic/storage';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    a.reseed(7);
    expect(a.state).toBe(7);
  });
  it('int/range/pick/shuffle/weighted stay in bounds', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      const f = r.range(1, 2);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThan(2);
    }
    expect([1, 2, 3]).toContain(r.pick([1, 2, 3]));
    expect(() => r.pick([])).toThrow();
    const arr = [1, 2, 3, 4, 5];
    expect(r.shuffle(arr.slice()).sort()).toEqual(arr);
    expect(r.weighted([0, 0, 0])).toBe(-1);
    expect(r.weighted([0, 5, 0])).toBe(1);
    expect(typeof r.chance(0.5)).toBe('boolean');
  });
  it('weighted is roughly proportional', () => {
    const r = new Rng(9);
    const counts = [0, 0];
    for (let i = 0; i < 4000; i++) counts[r.weighted([1, 3])]!++;
    expect(counts[1]! / counts[0]!).toBeGreaterThan(2.5);
    expect(counts[1]! / counts[0]!).toBeLessThan(3.5);
  });
});

describe('facts', () => {
  it('has 66 commutative facts from 2..12', () => {
    expect(FACT_COUNT).toBe(66);
    expect(factIndex(7, 8)).toBe(factIndex(8, 7));
    expect(factIndex(1, 5)).toBe(-1);
    expect(FACTS[factIndex(7, 8)]!.product).toBe(56);
    expect(factLabel(factIndex(3, 4))).toBe('3×4');
    expect(factLabel(999)).toBe('?');
    expect(factsOfTable(7)).toHaveLength(11);
    expect(factHasTable(factIndex(7, 9), 9)).toBe(true);
    expect(factHasTable(999, 9)).toBe(false);
    expect(TABLES).toHaveLength(11);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
  it('factor pairs', () => {
    expect(factorPairs(24, 2, 12)).toEqual([
      [2, 12],
      [3, 8],
      [4, 6],
      [6, 4],
      [8, 3],
      [12, 2],
    ]);
  });
});

describe('events', () => {
  it('emits and unsubscribes', () => {
    const e = new Emitter<{ a: number }>();
    let got = 0;
    const off = e.on('a', (v) => (got += v));
    e.emit('a', 2);
    off();
    e.emit('a', 5);
    expect(got).toBe(2);
    e.clear();
    e.emit('a', 1);
  });
});

describe('flash governor (photosensitivity)', () => {
  it('never allows more than max flashes in any 1s window', () => {
    const g = new FlashGovernor(CONFIG.fx.maxFlashesPerSecond);
    const allowed: number[] = [];
    for (let t = 0; t < 10; t += 0.05) if (g.request(t)) allowed.push(t);
    for (const t of allowed) {
      const inWindow = allowed.filter((x) => x >= t && x < t + 1).length;
      expect(inWindow).toBeLessThanOrEqual(CONFIG.fx.maxFlashesPerSecond);
    }
    expect(CONFIG.fx.maxFlashesPerSecond).toBeLessThan(3);
    expect(g.countAt(9.99)).toBeLessThanOrEqual(2);
    g.reset();
    expect(g.countAt(10)).toBe(0);
  });
});

describe('scoring', () => {
  it('combo tiers and points', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(100)).toBe(5);
    expect(comboTier(2)).toBe(0);
    expect(comboTier(6)).toBe(2);
    expect(pointsForHit(1, 5000)).toBe(100);
    expect(pointsForHit(1, 0)).toBe(160);
    expect(pointsForHit(10, 5000)).toBe(400);
    expect(shardsForRun(4, 1, 0, 4500, 0)).toBe(4 * 3 + 3 + 2);
    expect(shardsForRun(4, 0, 1, 0, 2)).toBe(Math.round((12 + 10) * 1.5));
  });
});

describe('difficulty', () => {
  it('ramps grid size, bugs, time but never math', () => {
    const r0 = roundParams(0);
    expect([r0.cols, r0.rows]).toEqual([5, 4]);
    expect(r0.isBoss).toBe(false);
    expect(roundParams(4).isBoss).toBe(true);
    expect(roundParams(4).bugCount).toBe(0);
    expect(roundParams(9).isBoss).toBe(true);
    const late = roundParams(12);
    expect(late.cols * late.rows).toBeGreaterThan(r0.cols * r0.rows);
    expect(late.bugCount).toBeGreaterThan(r0.bugCount);
    expect(late.timeLimit).toBeLessThan(r0.timeLimit);
    expect(late.timeLimit).toBeGreaterThanOrEqual(CONFIG.rounds.minTime * 0.8);
    expect(roundParams(3, 1).bugSpeed).toBeGreaterThan(roundParams(3, -1).bugSpeed);
  });
  it('heat moves toward target accuracy and clamps', () => {
    expect(updateHeat(0, 1, 10)).toBeGreaterThan(0);
    expect(updateHeat(0, 0.3, 10)).toBeLessThan(0);
    expect(updateHeat(0.5, 0, 0)).toBeCloseTo(0.5 * (1 - CONFIG.difficulty.heatDecay));
    let h = 0;
    for (let i = 0; i < 50; i++) h = updateHeat(h, 0, 10);
    expect(h).toBe(-1);
  });
});

describe('callouts', () => {
  it('does not repeat back to back and covers combo tiers', () => {
    const p = new CalloutPicker(new Rng(3));
    let prev = '';
    for (let i = 0; i < 50; i++) {
      const c = p.pick('correct');
      expect(c).not.toBe(prev);
      prev = c;
    }
    expect(p.combo(1)).toBe(CALLOUTS.combo[0]);
    expect(p.combo(99)).toBe(CALLOUTS.combo[CALLOUTS.combo.length - 1]);
    expect(isSixSeven(7, 6)).toBe(true);
    expect(isSixSeven(6, 8)).toBe(false);
  });
  it('contains no banned slang', () => {
    const banned = ['rizz', 'gyatt', 'sigma', 'skibidi', 'fanum', 'mog', 'clanker', 'ohio', 'sus'];
    const all = Object.values(CALLOUTS).flat().join(' ').toLowerCase();
    for (const b of banned) expect(all.includes(b)).toBe(false);
  });
});

describe('storage', () => {
  it('memory kv + json helpers', () => {
    const kv = new MemoryKV();
    expect(readJSON(kv, 'x')).toBeUndefined();
    writeJSON(kv, 'x', { a: 1 });
    expect(readJSON(kv, 'x')).toEqual({ a: 1 });
    kv.set('bad', '{nope');
    expect(readJSON(kv, 'bad')).toBeUndefined();
    kv.remove('x');
    expect(kv.get('x')).toBeNull();
  });
  it('browser kv falls back to memory without localStorage', () => {
    const kv = new BrowserKV();
    kv.set('k', 'v');
    expect(kv.get('k')).toBe('v');
    kv.remove('k');
    expect(kv.get('k')).toBeNull();
  });
  it('browser kv survives a throwing localStorage', () => {
    const g = globalThis as unknown as { localStorage?: unknown };
    g.localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const kv = new BrowserKV();
    kv.set('k', 'v');
    expect(kv.get('k')).toBe('v');
    kv.remove('k');
    delete g.localStorage;
  });
});

import { ARCHETYPES, DEFAULT_ROSTER, parseSkinOverrides, resolveRoster } from '../src/logic/skins';

describe('skins (behaviour + interchangeable looks)', () => {
  it('parses overrides and ignores junk', () => {
    expect(parseSkinOverrides('lunger:duckuum, boss:My-Llama_2')).toEqual({ lunger: 'duckuum', boss: 'my-llama_2' });
    expect(parseSkinOverrides('nope:x,lunger,drifter:../evil,sweeper:')).toEqual({});
    expect(parseSkinOverrides(null)).toEqual({});
  });
  it('resolves the roster only to skins that exist', () => {
    const have = new Set(['wifido', 'duckuum']);
    const r = resolveRoster({ lunger: 'duckuum', boss: 'missing' }, (id) => have.has(id));
    expect(r.lunger).toBe('duckuum');
    expect(r.boss).toBe(DEFAULT_ROSTER.boss);
    expect(Object.keys(r).sort()).toEqual([...ARCHETYPES].sort());
  });
});
