import type { Rng } from './rng.js';

/**
 * Data-driven meme callouts (see docs/RESEARCH.md §2). Slang turns over every
 * 6–12 months: edit this table, not the systems. Banned list documented there.
 */
export const CALLOUTS = {
  correct: ['W', 'CLEAN', 'TUFF', 'EZ', 'BIG BRAIN', 'CALCULATED', 'GOATED', 'NO CAP', 'PEAK', 'CRISPY', 'YEET', 'SHEESH'],
  combo: ['HEATING UP', 'LOCKED IN', '+1000 AURA', 'DIABOLICAL', "LET 'EM COOK", 'ABSOLUTE CINEMA', 'UNREAL. GENUINELY.'],
  wrong: ['NAH', 'L (TINY ONE)', 'NOT IT', 'CAP DETECTED', 'MID PUNCH', 'ALMOST', 'PLOT TWIST'],
  damage: ['BONK', 'OUCH', '-50 AURA', 'BRO WHAT', 'HOLD UP', 'RUDE'],
  bossIntro: ['LOCK IN.', 'FINAL BOSS ENERGY', 'CHAT, IS THIS REAL?', 'THE AURA IS IMMENSE', 'BOSS FIGHT. NO CAP.'],
  death: ['COOKED', 'GG', 'RUN IT BACK', 'CRASHED OUT', 'WELL… THAT HAPPENED'],
  highScore: ['NEW PB', 'CERTIFIED W', 'AURA OVERFLOW', 'HISTORY MADE', 'LEGENDARY'],
  roundClear: ['SERVER WIPED', 'GG EZ', 'CLEARED', 'DATA CRUNCHED', 'TUFF ROUND'],
  timeout: ['TIME\'S UP', 'LAG SPIKE', 'TOO SLOW, CHIEF'],
  bugPunch: ['YEETED', 'BONKED', 'GET OUT', 'DELETED', 'BYE'],
} as const;

export type CalloutKind = keyof typeof CALLOUTS;

/** Picks a callout without repeating the previous one of the same kind. */
export class CalloutPicker {
  private last = new Map<CalloutKind, number>();
  constructor(private readonly rng: Rng) {}

  pick(kind: CalloutKind): string {
    const list: readonly string[] = CALLOUTS[kind];
    if (list.length === 1) return list[0] as string;
    const prev = this.last.get(kind) ?? -1;
    let i = Math.floor(this.rng.next() * list.length);
    if (i === prev) i = (i + 1) % list.length;
    this.last.set(kind, i);
    return list[i] as string;
  }

  /** Combo milestone text by tier index (1-based tiers past the first). */
  combo(tier: number): string {
    const list = CALLOUTS.combo;
    return list[Math.min(list.length - 1, Math.max(0, tier - 1))] as string;
  }
}

/** Easter egg: 6×7 (the "6-7" meme). Rare by design. */
export function isSixSeven(a: number, b: number): boolean {
  return (a === 6 && b === 7) || (a === 7 && b === 6);
}
