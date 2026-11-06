import { CONFIG } from '../config.js';
import { FACTS } from './facts.js';
import { LearningEngine } from './learning.js';
import { Rng } from './rng.js';
import { GameSession, type RunUpgrades } from './session.js';

/** A simulated player for headless balance and learning-effectiveness tests. */
export interface SimProfile {
  name: string;
  /** Probability of answering a given fact correctly. */
  accuracy: (a: number, b: number) => number;
  /** Mean response time (ms) for a fact. */
  rtMs: (a: number, b: number) => number;
}

export const PROFILES = {
  solid: {
    name: 'solid',
    accuracy: () => 0.92,
    rtMs: () => 1800,
  } satisfies SimProfile,
  missesSevens: {
    name: 'misses-7s',
    accuracy: (a: number, b: number) => (a === 7 || b === 7 ? 0 : 0.92),
    rtMs: (a: number, b: number) => (a === 7 || b === 7 ? 6000 : 1800),
  } satisfies SimProfile,
};

export interface SimReport {
  rounds: number;
  /** Per-round share of practised items involving table 7. */
  sevenShare: number[];
  focusSevenRules: number;
  totalRules: number;
  deaths: number;
  runs: number;
  avgRoundsPerRun: number;
}

const involves7 = (fi: number): boolean => {
  const f = FACTS[fi];
  return !!f && (f.a === 7 || f.b === 7);
};

/**
 * Plays `targetRounds` rounds (across as many runs as needed) with a profile.
 * Simulated time advances in fixed steps. Returns per-round exposure stats.
 */
export function simulate(profile: SimProfile, targetRounds: number, seed = 1, unlockAll = true): SimReport {
  const rng = new Rng(seed);
  const learning = new LearningEngine();
  if (unlockAll) learning.unlockAll();
  const session = new GameSession(learning, rng);
  const playerRng = new Rng(seed * 7919 + 3);
  const upgrades: RunUpgrades = { maxHp: 3, slowmo: 0, shield: 0, magnet: 0 };
  const report: SimReport = { rounds: 0, sevenShare: [], focusSevenRules: 0, totalRules: 0, deaths: 0, runs: 0, avgRoundsPerRun: 0 };
  let lifetime = 0;
  let roundsThisRun = 0;
  const roundsPerRun: number[] = [];

  session.events.on('roundStart', (e) => {
    report.totalRules++;
    if (e.rule && e.rule.kind === 'multiples' && e.rule.n === 7) report.focusSevenRules++;
    // Share of correct grid blocks involving 7 = how much 7-practice the engine served.
    if (!e.isBoss) {
      let s = 0;
      let n = 0;
      for (const b of session.blocks) {
        if (!b.correct || b.fact < 0) continue;
        n++;
        if (involves7(b.fact)) s++;
      }
      report.sevenShare.push(n === 0 ? 0 : s / n);
    }
  });
  session.events.on('bossVolley', (e) => {
    report.sevenShare.push(e.a === 7 || e.b === 7 ? 1 : 0);
  });
  session.events.on('gameOver', () => {
    report.deaths++;
  });

  const step = 1 / 30;
  session.startRun(upgrades, lifetime);
  report.runs++;
  let thinkTimer = 0;
  let guard = 0;
  while (report.rounds < targetRounds && guard++ < 2_000_000) {
    const phase = session.phase;
    if (phase === 'gameover') {
      roundsPerRun.push(roundsThisRun);
      roundsThisRun = 0;
      lifetime += session.round + 1;
      session.startRun(upgrades, lifetime);
      report.runs++;
      continue;
    }
    if (phase === 'perk') {
      const prevRound = session.round;
      session.takePerk(session.perkOffer[0] ?? 'heal');
      if (session.round !== prevRound) {
        report.rounds++;
        roundsThisRun++;
      }
      continue;
    }
    if (phase === 'playing') {
      thinkTimer -= step;
      if (thinkTimer <= 0) {
        actOnce(session, profile, playerRng);
        thinkTimer = 0.6 + playerRng.next() * 0.6;
      }
    }
    session.tick(step);
  }
  roundsPerRun.push(roundsThisRun);
  report.avgRoundsPerRun = roundsPerRun.reduce((a, b) => a + b, 0) / Math.max(1, roundsPerRun.length);
  return report;
}

function actOnce(session: GameSession, profile: SimProfile, rng: Rng): void {
  if (session.boss) {
    const boss = session.boss;
    if (!boss.active) return;
    const ok = rng.chance(profile.accuracy(boss.a, boss.b));
    if (ok) session.hitOrb(boss.correctIndex);
    else session.hitOrb((boss.correctIndex + 1) % boss.choices.length);
    return;
  }
  // Grid: pick a random alive correct block; decide whether the kid "sees" it.
  const alive = session.blocks.filter((b) => b.alive);
  const correct = alive.filter((b) => b.correct);
  const wrong = alive.filter((b) => !b.correct);
  if (correct.length === 0) return;
  const target = rng.pick(correct);
  const f = FACTS[target.fact];
  const p = f ? profile.accuracy(f.a, f.b) : 0.9;
  if (rng.chance(p) || wrong.length === 0 || session.assistActive) {
    session.hitBlock(target.id);
  } else {
    // Confused: punches a distractor instead (or freezes and leaves it).
    if (rng.chance(0.3)) session.hitBlock(rng.pick(wrong).id);
  }
}

/** Mean of an array slice. */
export function mean(xs: number[], from = 0, to = xs.length): number {
  const s = xs.slice(from, to);
  return s.length === 0 ? 0 : s.reduce((a, b) => a + b, 0) / s.length;
}

export const SIM_DEFAULTS = { rounds: 60, step: 1 / 30, maxBox: CONFIG.learning.maxBox };
