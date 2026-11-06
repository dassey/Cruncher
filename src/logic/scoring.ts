import { CONFIG } from '../config.js';

const S = CONFIG.scoring;

export function comboMultiplier(combo: number): number {
  let m = 1;
  for (const t of S.comboTiers) if (combo >= t.at) m = t.mult;
  return m;
}

/** Index of the combo tier for a combo count. */
export function comboTier(combo: number): number {
  let idx = 0;
  S.comboTiers.forEach((t, i) => {
    if (combo >= t.at) idx = i;
  });
  return idx;
}

/** Points for a correct hit with combo *after* increment and response time. */
export function pointsForHit(combo: number, rtMs: number): number {
  const speed = rtMs >= S.speedBonusMs ? 0 : Math.round(S.speedBonusMax * (1 - rtMs / S.speedBonusMs));
  return (S.basePoints + speed) * comboMultiplier(combo);
}

/** Shards earned for a run summary. */
export function shardsForRun(roundsCleared: number, perfectRounds: number, bossesBeaten: number, score: number, magnetLevel: number): number {
  const C = CONFIG.shards;
  const base = roundsCleared * C.perRound + perfectRounds * C.perfectRound + bossesBeaten * C.perBoss + Math.floor(score / C.perPoints);
  return Math.round(base * (1 + 0.25 * magnetLevel));
}
