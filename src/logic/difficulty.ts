import { CONFIG } from '../config.js';

export interface RoundParams {
  index: number;
  isBoss: boolean;
  cols: number;
  rows: number;
  timeLimit: number;
  bugCount: number;
  bugSpeed: number;
}

const R = CONFIG.rounds;
const D = CONFIG.difficulty;
const B = CONFIG.bugs;

/** Round 0-based index → parameters. `heat` ∈ [-1,1] nudges pressure (DDA). */
export function roundParams(index: number, heat = 0): RoundParams {
  const isBoss = (index + 1) % R.bossEvery === 0;
  // Grid grows every 2 normal rounds, capped. Never jumps the math.
  const tier = Math.min(R.sizes.length - 1, Math.floor(index / 2));
  const [cols, rows] = R.sizes[tier] as [number, number];
  const baseTime = Math.max(R.minTime, R.baseTime + R.timePerRound * index);
  const timeLimit = Math.round(baseTime * (1 - D.heatTimeScale * heat));
  const bugCount = isBoss ? 0 : (B.countByRound[Math.min(index, B.countByRound.length - 1)] as number);
  const speed = Math.min(B.maxSpeed, B.baseSpeed + B.speedPerRound * index) * (1 + D.heatSpeedScale * heat);
  return { index, isBoss, cols, rows, timeLimit, bugCount, bugSpeed: speed };
}

/** Update DDA heat from a round's accuracy. Above target → hotter (harder). */
export function updateHeat(heat: number, accuracy: number, attempts: number): number {
  if (attempts <= 0) return heat * (1 - D.heatDecay);
  const next = heat * (1 - D.heatDecay) + D.heatGain * (accuracy - D.targetAccuracy);
  return Math.max(-1, Math.min(1, next));
}
