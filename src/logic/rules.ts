import { CONFIG } from '../config.js';
import { FACTS, clamp, factIndex, factorPairs } from './facts.js';
import type { LearningEngine } from './learning.js';
import type { Rng } from './rng.js';

export type RuleKind = 'multiples' | 'equals' | 'factors';

export interface Rule {
  kind: RuleKind;
  /** Table for multiples, target product for equals/factors. */
  n: number;
  /** Big overhead text. */
  title: string;
  /** Small sub-line (flavour, never a lesson). */
  subtitle: string;
}

/** A value shown on a block: a plain number, or an expression a×b. */
export interface BlockValue {
  /** Plain number (multiples/factors) or product (equals). */
  value: number;
  /** For expressions. 0 when plain. */
  a: number;
  b: number;
}

export const RULE_MIX = {
  /** [multiples, equals, factors] weights by round index (0-based). */
  byRound(round: number): [number, number, number] {
    if (round < 2) return [1, 0, 0];
    if (round < 5) return [0.6, 0.4, 0];
    if (round < 9) return [0.45, 0.35, 0.2];
    return [0.4, 0.35, 0.25];
  },
};

/** Targets with at least two factor pairs inside 2..12 (good for equals/factors). */
export const RICH_TARGETS: readonly number[] = (() => {
  const out: number[] = [];
  for (let t = 4; t <= 144; t++) {
    const pairs = factorPairs(t, 2, 12).filter(([a, b]) => a <= b);
    if (pairs.length >= 2) out.push(t);
  }
  return out;
})();

function makeRule(kind: RuleKind, n: number): Rule {
  switch (kind) {
    case 'multiples':
      return { kind, n, title: `MULTIPLES OF ${n}`, subtitle: `SMASH ANYTHING IN THE ${n}s` };
    case 'equals':
      return { kind, n, title: `MAKE ${n}`, subtitle: `PUNCH EVERY COMBO THAT = ${n}` };
    case 'factors':
      return { kind, n, title: `FACTORS OF ${n}`, subtitle: `WHAT GOES INTO ${n}?` };
  }
}

export function ruleFor(kind: RuleKind, n: number): Rule {
  return makeRule(kind, n);
}

/** Choose the next rule using the learning engine to focus weak facts. */
export function chooseRule(round: number, learning: LearningEngine, rng: Rng, avoid?: Rule): Rule {
  const mix = RULE_MIX.byRound(round);
  const kind = (['multiples', 'equals', 'factors'] as const)[Math.max(0, rng.weighted(mix))] as RuleKind;
  for (let attempt = 0; attempt < 6; attempt++) {
    const rule = pickRuleOfKind(kind, learning, rng);
    if (!avoid || rule.kind !== avoid.kind || rule.n !== avoid.n) return rule;
  }
  return pickRuleOfKind(kind, learning, rng);
}

function pickRuleOfKind(kind: RuleKind, learning: LearningEngine, rng: Rng): Rule {
  if (kind === 'multiples') return makeRule(kind, learning.pickTable(rng));
  // equals / factors: target = product of a weak fact that has >= 2 pairs (falls back to any).
  const rich = new Set(RICH_TARGETS);
  const maxTarget = kind === 'factors' ? 72 : 144;
  let i = learning.pickFactWhere(rng, (fi) => {
    const p = productOf(fi);
    return rich.has(p) && p <= maxTarget;
  });
  if (i < 0) i = learning.pickFact(rng);
  return makeRule(kind, productOf(i));
}

function productOf(fi: number): number {
  return FACTS[fi]?.product ?? 4;
}

/** Is a block value correct under a rule? */
export function isCorrect(rule: Rule, v: BlockValue): boolean {
  switch (rule.kind) {
    case 'multiples':
      return v.value % rule.n === 0 && v.value / rule.n >= 1 && v.value / rule.n <= 12;
    case 'equals':
      return v.a * v.b === rule.n;
    case 'factors':
      return v.value >= 1 && rule.n % v.value === 0;
  }
}

/** Which fact a hit on this block practises (for learning attribution). -1 if none. */
export function attributeFact(rule: Rule, v: BlockValue): number {
  switch (rule.kind) {
    case 'multiples': {
      const k = clamp(Math.round(v.value / rule.n), 2, 12);
      return factIndex(rule.n, k);
    }
    case 'equals':
      return factIndex(v.a, v.b);
    case 'factors': {
      if (v.value < 2) return -1;
      const k = clamp(Math.round(rule.n / v.value), 2, 12);
      return factIndex(v.value, k);
    }
  }
}

/** Short stylised fact readout shown on a wrong hit, e.g. "7 × 4 = 28". */
export function readout(rule: Rule, v: BlockValue): string {
  switch (rule.kind) {
    case 'multiples': {
      const k = clamp(Math.round(v.value / rule.n), 1, 12);
      return `${rule.n} × ${k} = ${rule.n * k}`;
    }
    case 'equals':
      return `${v.a} × ${v.b} = ${v.a * v.b}`;
    case 'factors': {
      const k = clamp(Math.round(rule.n / Math.max(1, v.value)), 1, 12);
      return `${v.value} × ${k} = ${v.value * k}`;
    }
  }
}

/** Small "receipt" for a correct hit, e.g. "7×4". */
export function receipt(rule: Rule, v: BlockValue): string {
  switch (rule.kind) {
    case 'multiples':
      return `${rule.n}×${v.value / rule.n}`;
    case 'equals':
      return `${v.a}×${v.b}`;
    case 'factors':
      return `${v.value}×${rule.n / v.value}`;
  }
}

export function blockLabel(rule: Rule, v: BlockValue): string {
  return rule.kind === 'equals' ? `${v.a}×${v.b}` : String(v.value);
}

/** Maximum correct value range for distractor generation. */
export function maxValue(rule: Rule): number {
  return rule.kind === 'multiples' ? rule.n * 12 + 4 : CONFIG.facts.max * CONFIG.facts.max;
}
