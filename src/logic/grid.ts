import { CONFIG } from '../config.js';
import { factorPairs } from './facts.js';
import type { LearningEngine } from './learning.js';
import { attributeFact, blockLabel, isCorrect, type BlockValue, type Rule } from './rules.js';
import type { Rng } from './rng.js';

export interface Block extends BlockValue {
  id: number;
  col: number;
  row: number;
  label: string;
  correct: boolean;
  /** Fact this block practises (-1 none). */
  fact: number;
  /** False once smashed. */
  alive: boolean;
  /** Rare bonus block (always a correct one). */
  golden: boolean;
}

/** Candidate correct values for a rule. */
export function correctPool(rule: Rule): BlockValue[] {
  const out: BlockValue[] = [];
  switch (rule.kind) {
    case 'multiples':
      for (let k = 1; k <= 12; k++) out.push({ value: rule.n * k, a: 0, b: 0 });
      break;
    case 'equals':
      for (const [a, b] of factorPairs(rule.n, 1, 12)) out.push({ value: rule.n, a, b });
      break;
    case 'factors':
      for (let v = 1; v <= 12; v++) if (rule.n % v === 0) out.push({ value: v, a: 0, b: 0 });
      break;
  }
  return out;
}

/** Near-miss distractors: values a kid could plausibly confuse with a correct one. */
export function distractorPool(rule: Rule): BlockValue[] {
  const seen = new Set<string>();
  const out: BlockValue[] = [];
  const push = (v: BlockValue) => {
    const key = `${v.value}:${v.a}:${v.b}`;
    if (seen.has(key) || isCorrect(rule, v)) return;
    seen.add(key);
    out.push(v);
  };
  switch (rule.kind) {
    case 'multiples': {
      const n = rule.n;
      for (let k = 1; k <= 12; k++) {
        for (const d of [-2, -1, 1, 2]) {
          const v = n * k + d;
          if (v >= 2) push({ value: v, a: 0, b: 0 });
        }
      }
      // Products from neighbouring tables (classic confusions: 6s vs 8s, 7s vs 9s).
      for (const t of [n - 1, n + 1, n + 2]) {
        if (t < 2 || t > 12) continue;
        for (let k = 2; k <= 12; k++) push({ value: t * k, a: 0, b: 0 });
      }
      break;
    }
    case 'equals': {
      for (const [a, b] of factorPairs(rule.n, 1, 12)) {
        for (const [da, db] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, -1],
          [-1, 1],
        ] as const) {
          const x = a + da;
          const y = b + db;
          if (x >= 2 && y >= 2 && x <= 12 && y <= 12) push({ value: x * y, a: x, b: y });
        }
      }
      break;
    }
    case 'factors':
      for (let v = 2; v <= 12; v++) push({ value: v, a: 0, b: 0 });
      break;
  }
  return out;
}

function toBlock(rule: Rule, v: BlockValue, id: number, col: number, row: number): Block {
  return {
    ...v,
    id,
    col,
    row,
    label: blockLabel(rule, v),
    correct: isCorrect(rule, v),
    fact: attributeFact(rule, v),
    alive: true,
    golden: false,
  };
}

/**
 * Build a cols×rows grid. Correct values are weighted toward weak facts so the
 * learning engine decides *which* multiples appear, not just which rule.
 */
export function generateGrid(rule: Rule, cols: number, rows: number, rng: Rng, learning?: LearningEngine, heat = 0): Block[] {
  const n = cols * rows;
  const [fLo, fHi] = CONFIG.grid.correctFraction;
  const correctCount = Math.max(2, Math.round(n * rng.range(fLo, fHi)));
  const pool = correctPool(rule);
  const distractors = distractorPool(rule);

  const weightFor = (v: BlockValue): number => {
    const f = attributeFact(rule, v);
    const base = f >= 0 && learning ? learning.weightOf(f) + 0.5 : 1;
    // Trivial values (×1) appear rarely.
    const trivial = (rule.kind === 'multiples' && v.value === rule.n) || v.a === 1 || v.b === 1 || v.value === 1;
    return trivial ? base * 0.15 : base;
  };

  // Sample with replacement, damping repeats: weak facts can appear 2-3 times
  // in one grid (spaced retrieval inside the round) while strong ones show once.
  const values: BlockValue[] = [];
  // Struggling (heat < 0) → gentler focus on weak facts; cruising → sharper.
  const focus = CONFIG.grid.focusExponent + CONFIG.grid.focusHeatScale * heat;
  const w = pool.map((v) => Math.pow(weightFor(v), Math.max(0.5, focus)));
  for (let i = 0; i < correctCount; i++) {
    let k = rng.weighted(w);
    if (k < 0) k = rng.int(0, pool.length - 1);
    w[k] = (w[k] as number) * CONFIG.grid.repeatDamping;
    values.push(pool[k] as BlockValue);
  }
  const shuffledD = rng.shuffle(distractors.slice());
  for (let i = 0; values.length < n; i++) {
    values.push(shuffledD[i % Math.max(1, shuffledD.length)] as BlockValue);
  }
  rng.shuffle(values);
  return values.map((v, id) => toBlock(rule, v, id, id % cols, Math.floor(id / cols)));
}

/** Replace a block's value keeping its correctness (used when a bug corrupts it). */
export function rerollBlock(rule: Rule, block: Block, rng: Rng): Block {
  const pool = block.correct ? correctPool(rule) : distractorPool(rule);
  const options = pool.filter((v) => v.value !== block.value || v.a !== block.a);
  if (options.length === 0) return block;
  const v = rng.pick(options);
  return toBlock(rule, v, block.id, block.col, block.row);
}

/** Boss volley answers: correct product plus near-miss distractors. */
export function bossChoices(a: number, b: number, count: number, rng: Rng): number[] {
  const correct = a * b;
  const cands = new Set<number>();
  for (const v of [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, correct + 1, correct - 1, correct + 10, correct - 10, correct + 2]) {
    if (v > 1 && v !== correct) cands.add(v);
  }
  const picks = rng.shuffle([...cands]).slice(0, count - 1);
  picks.push(correct);
  return rng.shuffle(picks);
}

export function countRemaining(blocks: readonly Block[]): number {
  let c = 0;
  for (const b of blocks) if (b.alive && b.correct) c++;
  return c;
}

