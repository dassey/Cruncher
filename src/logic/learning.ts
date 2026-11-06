import { CONFIG } from '../config.js';
import { FACTS, FACT_COUNT, factHasTable, factIndex } from './facts.js';
import type { Rng } from './rng.js';

const L = CONFIG.learning;

export interface FactStat {
  /** Leitner box 1..maxBox; 0 = never seen. */
  box: number;
  seen: number;
  correct: number;
  wrong: number;
  /** Exponential moving average of correct response time (ms); -1 = none. */
  rtAvg: number;
  /** Round index this fact was last seen. */
  lastRound: number;
}

export interface LearningSave {
  v: 1;
  unlocked: number;
  facts: Array<[number, number, number, number, number, number]>;
}

export type MasteryLevel = 'unseen' | 'learning' | 'shaky' | 'mastered';

function freshStat(): FactStat {
  return { box: 0, seen: 0, correct: 0, wrong: 0, rtAvg: -1, lastRound: -1 };
}

/**
 * Hidden learning engine: Leitner boxes plus response-time weighting.
 *  - wrong answer   → back to box 1
 *  - correct & fast → promote one box
 *  - correct & slow → stay (and the slow average boosts its weight)
 * Lower boxes and slow facts are drawn more often. Tables unlock gradually.
 */
export class LearningEngine {
  readonly stats: FactStat[];
  /** Number of tables unlocked from CONFIG.learning.tableOrder. */
  unlocked: number;
  private round = 0;
  private newThisRound = 0;
  private readonly weights: Float64Array;

  constructor() {
    this.stats = Array.from({ length: FACT_COUNT }, freshStat);
    this.unlocked = L.initialTables;
    this.weights = new Float64Array(FACT_COUNT);
  }

  /** Wipe all stats (parent reset). */
  reset(): void {
    for (const s of this.stats) Object.assign(s, freshStat());
    this.unlocked = L.initialTables;
    this.newThisRound = 0;
  }

  get unlockedTables(): number[] {
    return L.tableOrder.slice(0, this.unlocked);
  }

  isTableUnlocked(n: number): boolean {
    return this.unlockedTables.includes(n);
  }

  isFactUnlocked(i: number): boolean {
    for (const t of this.unlockedTables) if (factHasTable(i, t)) return true;
    return false;
  }

  unlockAll(): void {
    this.unlocked = L.tableOrder.length;
  }

  beginRound(round: number): void {
    this.round = round;
    this.newThisRound = 0;
  }

  /** Current pick weight for one fact. */
  weightOf(i: number): number {
    const s = this.stats[i];
    if (!s) return 0;
    if (!this.isFactUnlocked(i)) return L.lockedWeight;
    if (s.box === 0) {
      return this.newThisRound >= L.maxNewPerRound ? 0.05 : L.unseenWeight;
    }
    let w = L.boxWeights[s.box] ?? 1;
    if (s.rtAvg > L.slowMs) w *= L.slowWeightBoost;
    else if (s.rtAvg > L.fluentMs) w *= 1 + (L.slowWeightBoost - 1) * 0.5;
    const since = s.lastRound < 0 ? 10 : Math.min(10, Math.max(0, this.round - s.lastRound));
    w *= 1 + since * 0.06;
    return w;
  }

  private refreshWeights(): Float64Array {
    for (let i = 0; i < FACT_COUNT; i++) this.weights[i] = this.weightOf(i);
    return this.weights;
  }

  /** Weighted fact pick across all unlocked facts. */
  pickFact(rng: Rng): number {
    const w = this.refreshWeights();
    const i = rng.weighted(w);
    if (i < 0) return factIndex(2, 2);
    this.noteIntroduced(i);
    return i;
  }

  /** Weighted pick among facts satisfying a predicate. Returns -1 if none. */
  pickFactWhere(rng: Rng, pred: (i: number) => boolean): number {
    const w = this.refreshWeights();
    for (let i = 0; i < FACT_COUNT; i++) if (!pred(i)) w[i] = 0;
    const i = rng.weighted(w);
    if (i >= 0) this.noteIntroduced(i);
    return i;
  }

  /** Weighted table pick: tables whose facts are weak are favoured. */
  pickTable(rng: Rng): number {
    const tables = this.unlockedTables;
    const w = this.refreshWeights();
    const tw = tables.map((t) => {
      let sum = 0;
      for (let i = 0; i < FACT_COUNT; i++) if (factHasTable(i, t)) sum += w[i] as number;
      return sum;
    });
    const k = rng.weighted(tw);
    return tables[k < 0 ? 0 : k] as number;
  }

  private noteIntroduced(i: number): void {
    const s = this.stats[i];
    if (s && s.box === 0) this.newThisRound++;
  }

  /** Record an attempt on fact i. */
  record(i: number, correct: boolean, rtMs: number): void {
    const s = this.stats[i];
    if (!s) return;
    s.seen++;
    s.lastRound = this.round;
    const rt = Math.min(Math.max(rtMs, 0), L.maxRtMs);
    if (correct) {
      s.correct++;
      s.rtAvg = s.rtAvg < 0 ? rt : s.rtAvg + L.rtAlpha * (rt - s.rtAvg);
      if (s.box === 0) s.box = 1;
      if (rt <= L.slowMs) s.box = Math.min(L.maxBox, s.box + 1);
    } else {
      s.wrong++;
      s.box = 1;
    }
    this.maybeUnlock();
  }

  /** A correct target the player never hit before the timer ran out: treat as very slow. */
  recordSoftMiss(i: number): void {
    const s = this.stats[i];
    if (!s) return;
    s.seen++;
    s.lastRound = this.round;
    s.rtAvg = s.rtAvg < 0 ? L.maxRtMs : s.rtAvg + L.rtAlpha * (L.maxRtMs - s.rtAvg);
    if (s.box === 0) s.box = 1;
  }

  private maybeUnlock(): void {
    if (this.unlocked >= L.tableOrder.length) return;
    let total = 0;
    let solid = 0;
    for (let i = 0; i < FACT_COUNT; i++) {
      if (!this.isFactUnlocked(i)) continue;
      total++;
      if ((this.stats[i] as FactStat).box >= 2) solid++;
    }
    if (total > 0 && solid / total >= L.unlockThreshold) this.unlocked++;
  }

  mastery(i: number): MasteryLevel {
    const s = this.stats[i];
    if (!s || s.seen === 0) return 'unseen';
    if (s.box >= L.masteredBox && s.rtAvg >= 0 && s.rtAvg <= L.fluentMs) return 'mastered';
    if (s.box <= 1 && s.wrong > 0) return 'shaky';
    return 'learning';
  }

  summary(): { mastered: number; learning: number; shaky: number; unseen: number } {
    const out = { mastered: 0, learning: 0, shaky: 0, unseen: 0 };
    for (let i = 0; i < FACT_COUNT; i++) out[this.mastery(i)]++;
    return out;
  }

  /** Accuracy over all recorded attempts. */
  accuracy(): number {
    let c = 0;
    let n = 0;
    for (const s of this.stats) {
      c += s.correct;
      n += s.correct + s.wrong;
    }
    return n === 0 ? 0 : c / n;
  }

  /** The n weakest seen facts (lowest box, then slowest). */
  weakest(n: number): number[] {
    const idx: number[] = [];
    for (let i = 0; i < FACT_COUNT; i++) if ((this.stats[i] as FactStat).seen > 0) idx.push(i);
    idx.sort((x, y) => {
      const a = this.stats[x] as FactStat;
      const b = this.stats[y] as FactStat;
      if (a.box !== b.box) return a.box - b.box;
      if (a.wrong !== b.wrong) return b.wrong - a.wrong;
      return b.rtAvg - a.rtAvg;
    });
    return idx.slice(0, n);
  }

  toJSON(): LearningSave {
    return {
      v: 1,
      unlocked: this.unlocked,
      facts: this.stats.map((s) => [s.box, s.seen, s.correct, s.wrong, Math.round(s.rtAvg), s.lastRound]),
    };
  }

  static fromJSON(data: unknown): LearningEngine {
    const e = new LearningEngine();
    if (!data || typeof data !== 'object') return e;
    const d = data as Partial<LearningSave>;
    if (d.v !== 1 || !Array.isArray(d.facts)) return e;
    if (typeof d.unlocked === 'number' && d.unlocked >= 1) {
      e.unlocked = Math.min(L.tableOrder.length, Math.floor(d.unlocked));
    }
    d.facts.forEach((row, i) => {
      const s = e.stats[i];
      if (!s || !Array.isArray(row) || row.length < 6) return;
      const [box, seen, correct, wrong, rt, last] = row.map((x) => (typeof x === 'number' && isFinite(x) ? x : 0));
      s.box = Math.max(0, Math.min(L.maxBox, Math.floor(box as number)));
      s.seen = Math.max(0, seen as number);
      s.correct = Math.max(0, correct as number);
      s.wrong = Math.max(0, wrong as number);
      s.rtAvg = (rt as number) > 0 ? (rt as number) : -1;
      s.lastRound = last as number;
    });
    return e;
  }
}

/** For a debug/progress view: fact index → "7×8" plus stat. */
export function describeFact(e: LearningEngine, i: number): string {
  const f = FACTS[i];
  const s = e.stats[i];
  if (!f || !s) return '?';
  const rt = s.rtAvg < 0 ? '--' : (s.rtAvg / 1000).toFixed(1) + 's';
  return `${f.a}×${f.b} box${s.box} ${s.correct}/${s.correct + s.wrong} ${rt}`;
}
