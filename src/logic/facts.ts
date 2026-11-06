import { CONFIG } from '../config.js';

/** A multiplication fact. Commutative: stored with a <= b. */
export interface Fact {
  readonly index: number;
  readonly a: number;
  readonly b: number;
  readonly product: number;
}

const MIN = CONFIG.facts.min;
const MAX = CONFIG.facts.max;

function build(): Fact[] {
  const out: Fact[] = [];
  for (let a = MIN; a <= MAX; a++) {
    for (let b = a; b <= MAX; b++) {
      out.push({ index: out.length, a, b, product: a * b });
    }
  }
  return out;
}

/** All 66 facts from 2×2 to 12×12. */
export const FACTS: readonly Fact[] = build();
export const FACT_COUNT = FACTS.length;

const lookup = new Map<number, number>();
for (const f of FACTS) lookup.set(f.a * 100 + f.b, f.index);

/** Index of fact a×b (order-insensitive), or -1 if outside the tracked range. */
export function factIndex(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lookup.get(lo * 100 + hi) ?? -1;
}

export function factLabel(i: number): string {
  const f = FACTS[i];
  return f ? `${f.a}×${f.b}` : '?';
}

/** Fact indices involving table n. */
export function factsOfTable(n: number): number[] {
  const out: number[] = [];
  for (const f of FACTS) if (f.a === n || f.b === n) out.push(f.index);
  return out;
}

export function factHasTable(i: number, n: number): boolean {
  const f = FACTS[i];
  return !!f && (f.a === n || f.b === n);
}

export const TABLES: readonly number[] = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);

/** Factor pairs (a,b) with a*b === target and 1 <= a,b <= 12 (both orders). */
export function factorPairs(target: number, min = 1, max = 12): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let a = min; a <= max; a++) {
    if (target % a === 0) {
      const b = target / a;
      if (b >= min && b <= max) out.push([a, b]);
    }
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
