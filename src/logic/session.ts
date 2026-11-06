import { CONFIG } from '../config.js';
import { CalloutPicker, isSixSeven } from './callouts.js';
import { roundParams, updateHeat, type RoundParams } from './difficulty.js';
import { Emitter } from './events.js';
import { FACTS, factIndex } from './facts.js';
import { bossChoices, countRemaining, generateGrid, rerollBlock, type Block } from './grid.js';
import type { LearningEngine } from './learning.js';
import type { Rng } from './rng.js';
import { chooseRule, readout, receipt, type Rule } from './rules.js';
import { comboMultiplier, comboTier, pointsForHit, shardsForRun } from './scoring.js';

export type Phase = 'menu' | 'intro' | 'playing' | 'clear' | 'perk' | 'gameover';
export type DamageSource = 'bug' | 'wrong' | 'timeout' | 'orb';

export type PerkId = 'heal' | 'time' | 'fists' | 'combo' | 'freeze' | 'shards' | 'slowmo';
export const PERK_INFO: Record<PerkId, { name: string; desc: string }> = {
  heal: { name: 'PATCH', desc: '+1 HEART' },
  time: { name: 'OVERCLOCK', desc: '+10s EVERY ROUND' },
  fists: { name: 'THICC FISTS', desc: 'BIGGER PUNCH ZONE' },
  combo: { name: 'HEAD START', desc: 'ROUNDS START AT x2' },
  freeze: { name: 'FIREWALL', desc: 'BUGZ MOVE SLOWER' },
  shards: { name: 'CRYPTO BRO', desc: '+50% SHARDS THIS RUN' },
  slowmo: { name: 'LAG SWITCH+', desc: '+1 SLOW-MO' },
};
export const PERK_IDS = Object.keys(PERK_INFO) as PerkId[];

export interface BossState {
  hp: number;
  maxHp: number;
  /** Current volley; null between volleys. */
  a: number;
  b: number;
  fact: number;
  choices: number[];
  correctIndex: number;
  active: boolean;
  volleyTime: number;
  gap: number;
  /** Facts to bring back soon (missed ones). */
  requeue: number[];
}

export interface SessionEvents {
  runStart: { hp: number; maxHp: number };
  roundStart: { round: number; rule: Rule | null; isBoss: boolean; params: RoundParams; callout: string };
  playing: { round: number };
  hitCorrect: { block: Block; points: number; combo: number; mult: number; rtMs: number; callout: string; receipt: string; sixSeven: boolean };
  hitWrong: { block: Block; readout: string; callout: string; shielded: boolean };
  comboTier: { tier: number; combo: number; text: string };
  comboBreak: { combo: number };
  damage: { amount: number; hp: number; source: DamageSource; callout: string };
  heal: { amount: number; hp: number };
  roundClear: { round: number; perfect: boolean; bonus: number; callout: string; accuracy: number; isBoss: boolean };
  timeout: { round: number; callout: string };
  bossVolley: { a: number; b: number; choices: number[]; correctIndex: number; bossHp: number };
  bossHit: { bossHp: number; points: number; receipt: string };
  bossWrong: { readout: string; value: number };
  bossDefeated: { round: number };
  bugPunched: { points: number; callout: string };
  perkOffer: { perks: PerkId[] };
  perkTaken: { perk: PerkId };
  slowmo: { active: boolean; charges: number };
  blockChanged: { block: Block };
  gameOver: { score: number; round: number; shards: number; callout: string; bestCombo: number; seconds: number };
}

export interface RunUpgrades {
  maxHp: number;
  slowmo: number;
  shield: number;
  magnet: number;
}

export interface RunStats {
  correct: number;
  wrong: number;
  roundsCleared: number;
  perfectRounds: number;
  bossesBeaten: number;
  bestCombo: number;
  seconds: number;
  bugsPunched: number;
  sixSevens: number;
  goldens: number;
  damageBy: Record<DamageSource, number>;
}

const P = CONFIG.player;
const R = CONFIG.rounds;
const S = CONFIG.scoring;

/**
 * One CRUNCHER run as a pure state machine. Systems call `tick(dt)` every frame
 * and the input/hit methods on gameplay moments; everything else reacts to events.
 */
export class GameSession {
  readonly events = new Emitter<SessionEvents>();
  readonly callouts: CalloutPicker;

  phase: Phase = 'menu';
  phaseTime = 0;
  round = 0;
  params: RoundParams = roundParams(0);
  rule: Rule | null = null;
  blocks: Block[] = [];
  timeLeft = 0;
  hp: number = P.baseHp;
  maxHp: number = P.baseHp;
  score = 0;
  combo = 0;
  heat = 0;
  iFrames = 0;
  shieldCharges = 0;
  slowmoCharges = 0;
  slowmoTime = 0;
  boss: BossState | null = null;
  perkOffer: PerkId[] = [];
  perks: Record<PerkId, number> = { heal: 0, time: 0, fists: 0, combo: 0, freeze: 0, shards: 0, slowmo: 0 };
  stats: RunStats = this.freshStats();
  upgrades: RunUpgrades = { maxHp: 0, slowmo: 0, shield: 0, magnet: 0 };
  lastShards = 0;

  private clock = 0;
  private lastAction = 0;
  private roundCorrect = 0;
  private roundWrong = 0;
  private sixSevenShown = false;
  private lifetimeBase = 0;

  constructor(
    readonly learning: LearningEngine,
    readonly rng: Rng,
  ) {
    this.callouts = new CalloutPicker(rng);
  }

  private freshStats(): RunStats {
    return { correct: 0, wrong: 0, roundsCleared: 0, perfectRounds: 0, bossesBeaten: 0, bestCombo: 0, seconds: 0, bugsPunched: 0, sixSevens: 0, goldens: 0, damageBy: { bug: 0, wrong: 0, timeout: 0, orb: 0 } };
  }

  /** Effective time scale for world simulation (slow-mo). */
  get timeScale(): number {
    return this.slowmoTime > 0 ? CONFIG.slowmo.timeScale : 1;
  }

  get remaining(): number {
    return countRemaining(this.blocks);
  }

  get multiplier(): number {
    return comboMultiplier(this.combo);
  }

  get fistScale(): number {
    return this.perks.fists > 0 ? CONFIG.perks.fistScale : 1;
  }

  get bugSpeedScale(): number {
    return Math.pow(CONFIG.perks.bugSlow, this.perks.freeze);
  }

  /** True when the player is stuck: correct blocks should shimmer as a hint. */
  get assistActive(): boolean {
    return this.phase === 'playing' && !this.boss && this.clock - this.lastAction > R.assistAfter;
  }

  get isBossRound(): boolean {
    return this.params.isBoss;
  }

  // ---------------------------------------------------------------- run flow

  startRun(upgrades: RunUpgrades, lifetimeRounds = 0): void {
    this.upgrades = { ...upgrades };
    this.lifetimeBase = lifetimeRounds;
    this.maxHp = Math.min(P.maxHpCap, P.baseHp + P.hpPerUpgrade * upgrades.maxHp);
    this.hp = this.maxHp;
    this.score = 0;
    this.combo = 0;
    this.heat = 0;
    this.round = 0;
    this.iFrames = 0;
    this.slowmoCharges = CONFIG.slowmo.baseCharges + upgrades.slowmo;
    this.slowmoTime = 0;
    this.perks = { heal: 0, time: 0, fists: 0, combo: 0, freeze: 0, shards: 0, slowmo: 0 };
    this.stats = this.freshStats();
    this.sixSevenShown = false;
    this.lastShards = 0;
    this.rule = null;
    this.events.emit('runStart', { hp: this.hp, maxHp: this.maxHp });
    this.beginRound();
  }

  /** Abandon to menu (no rewards). */
  quitToMenu(): void {
    this.setPhase('menu');
    this.blocks = [];
    this.boss = null;
    this.slowmoTime = 0;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private beginRound(): void {
    this.params = roundParams(this.round, this.heat);
    this.learning.beginRound(this.lifetimeBase + this.round);
    this.timeLeft = this.params.timeLimit + CONFIG.perks.timeBonus * this.perks.time;
    this.shieldCharges = this.upgrades.shield;
    this.roundCorrect = 0;
    this.roundWrong = 0;
    this.combo = this.perks.combo > 0 ? CONFIG.perks.comboStart : 0;
    if (this.params.isBoss) {
      this.rule = null;
      this.blocks = [];
      this.boss = {
        hp: CONFIG.boss.hp,
        maxHp: CONFIG.boss.hp,
        a: 0,
        b: 0,
        fact: -1,
        choices: [],
        correctIndex: -1,
        active: false,
        volleyTime: 0,
        gap: R.bossStartDelay,
        requeue: [],
      };
    } else {
      this.boss = null;
      this.rule = chooseRule(this.round, this.learning, this.rng, this.rule ?? undefined);
      this.blocks = generateGrid(this.rule, this.params.cols, this.params.rows, this.rng, this.learning, this.heat);
      if (this.rng.chance(CONFIG.golden.chance)) {
        const pool = this.blocks.filter((b) => b.correct);
        if (pool.length > 0) this.rng.pick(pool).golden = true;
      }
    }
    this.setPhase('intro');
    this.events.emit('roundStart', {
      round: this.round,
      rule: this.rule,
      isBoss: this.params.isBoss,
      params: this.params,
      callout: this.params.isBoss ? this.callouts.pick('bossIntro') : '',
    });
  }

  tick(dtReal: number): void {
    const dt = Math.min(dtReal, 0.1);
    this.phaseTime += dt;
    if (this.iFrames > 0) this.iFrames = Math.max(0, this.iFrames - dt);
    if (this.slowmoTime > 0) {
      this.slowmoTime -= dt;
      if (this.slowmoTime <= 0) {
        this.slowmoTime = 0;
        this.events.emit('slowmo', { active: false, charges: this.slowmoCharges });
      }
    }
    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= R.introSeconds) {
          this.setPhase('playing');
          this.clock = 0;
          this.lastAction = 0;
          this.events.emit('playing', { round: this.round });
        }
        break;
      case 'playing':
        this.stats.seconds += dt;
        this.clock += dt;
        this.timeLeft -= dt * this.timeScale;
        if (this.boss) this.tickBoss(dt);
        if (this.phase === 'playing' && this.timeLeft <= 0) this.onTimeout();
        break;
      case 'clear':
        if (this.phaseTime >= R.clearSeconds) {
          if (this.hp <= 0) this.endRun();
          else this.offerPerks();
        }
        break;
      case 'perk':
        if (this.phaseTime >= R.perkSeconds) this.takePerk(this.perkOffer[0] ?? 'heal');
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------- grid hits

  /** Player smashed block `id`. Returns 'correct' | 'wrong' | null (ignored). */
  hitBlock(id: number, blast = false): 'correct' | 'wrong' | null {
    if (this.phase !== 'playing' || !this.rule) return null;
    const block = this.blocks[id];
    if (!block || !block.alive) return null;
    const rtMs = (this.clock - this.lastAction) * 1000;
    // Grid RT includes visual search, which grows with grid size: normalise to a
    // 5×4 grid before judging fluency (boss orbs are pure recall: no scaling).
    const learnRt = rtMs / Math.sqrt(Math.max(1, this.blocks.length) / 20);
    if (block.correct) {
      block.alive = false;
      this.lastAction = this.clock;
      this.combo++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      this.stats.correct++;
      this.roundCorrect++;
      let points = pointsForHit(this.combo, rtMs);
      if (blast) points = Math.round(points * CONFIG.blaster.pointsMult);
      if (block.golden) {
        points *= CONFIG.golden.pointsMult;
        this.stats.goldens++;
      }
      this.score += points;
      if (block.fact >= 0) this.learning.record(block.fact, true, learnRt);
      const f = FACTS[block.fact];
      const six = !this.sixSevenShown && !!f && isSixSeven(f.a, f.b);
      if (six) {
        this.sixSevenShown = true;
        this.stats.sixSevens++;
      }
      this.events.emit('hitCorrect', {
        block,
        points,
        combo: this.combo,
        mult: this.multiplier,
        rtMs,
        callout: block.golden ? `GOLDEN! +${CONFIG.golden.shards} ◆` : this.callouts.pick('correct'),
        receipt: receipt(this.rule, block),
        sixSeven: six,
      });
      const tierNow = comboTier(this.combo);
      if (tierNow > comboTier(this.combo - 1)) {
        this.events.emit('comboTier', { tier: tierNow, combo: this.combo, text: this.callouts.combo(tierNow) });
      }
      if (this.remaining === 0) this.onRoundClear();
      return 'correct';
    }
    // Wrong.
    this.stats.wrong++;
    this.roundWrong++;
    if (block.fact >= 0) this.learning.record(block.fact, false, learnRt);
    const shielded = this.shieldCharges > 0 && this.combo > 0;
    if (shielded) this.shieldCharges--;
    else this.breakCombo();
    this.score = Math.max(0, this.score - S.wrongPenalty);
    this.events.emit('hitWrong', { block, readout: readout(this.rule, block), callout: this.callouts.pick('wrong'), shielded });
    this.damage(P.wrongDamage, 'wrong', true);
    return 'wrong';
  }

  private breakCombo(): void {
    if (this.combo > 0) this.events.emit('comboBreak', { combo: this.combo });
    this.combo = 0;
  }

  /** A bug corrupted a block: re-roll its value but keep the round solvable. */
  corruptBlock(id: number): void {
    if (this.phase !== 'playing' || !this.rule) return;
    const block = this.blocks[id];
    if (!block || !block.alive) return;
    const next = rerollBlock(this.rule, block, this.rng);
    this.blocks[id] = next;
    this.events.emit('blockChanged', { block: next });
  }

  // ------------------------------------------------------------- damage etc.

  /** Returns true if damage applied. `ignoreIFrames` for self-inflicted wrong hits. */
  damage(amount: number, source: DamageSource, ignoreIFrames = false): boolean {
    if (this.phase !== 'playing') return false;
    if (!ignoreIFrames && this.iFrames > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.stats.damageBy[source] += amount;
    this.iFrames = P.iFrames;
    if (source !== 'wrong') this.breakCombo();
    this.events.emit('damage', { amount, hp: this.hp, source, callout: this.callouts.pick('damage') });
    if (this.hp <= 0) this.endRun();
    return true;
  }

  /** Bug touched the player. */
  bugContact(): boolean {
    return this.damage(P.bugDamage, 'bug');
  }

  bugPunched(): void {
    if (this.phase !== 'playing') return;
    this.stats.bugsPunched++;
    this.score += S.bugPunchPoints;
    this.events.emit('bugPunched', { points: S.bugPunchPoints, callout: this.callouts.pick('bugPunch') });
  }

  heal(amount: number): void {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.hp > before) this.events.emit('heal', { amount: this.hp - before, hp: this.hp });
  }

  activateSlowmo(): boolean {
    if (this.phase !== 'playing' || this.slowmoTime > 0 || this.slowmoCharges <= 0) return false;
    this.slowmoCharges--;
    this.slowmoTime = CONFIG.slowmo.durationSec;
    this.events.emit('slowmo', { active: true, charges: this.slowmoCharges });
    return true;
  }

  // ------------------------------------------------------------- round end

  private roundAccuracy(): number {
    const n = this.roundCorrect + this.roundWrong;
    return n === 0 ? 1 : this.roundCorrect / n;
  }

  private onRoundClear(): void {
    const perfect = this.roundWrong === 0 && !this.params.isBoss;
    let bonus = S.roundClearBonus + (perfect ? S.perfectBonus : 0);
    bonus += Math.max(0, Math.floor(this.timeLeft)) * 5;
    this.score += bonus;
    this.stats.roundsCleared++;
    if (perfect) this.stats.perfectRounds++;
    if (this.params.isBoss) {
      this.stats.bossesBeaten++;
      this.heal(P.bossHeal);
      this.events.emit('bossDefeated', { round: this.round });
    } else {
      this.heal(P.clearHeal);
    }
    const acc = this.roundAccuracy();
    this.heat = updateHeat(this.heat, acc, this.roundCorrect + this.roundWrong);
    this.setPhase('clear');
    this.slowmoTime = 0;
    this.events.emit('roundClear', {
      round: this.round,
      perfect,
      bonus,
      callout: this.callouts.pick('roundClear'),
      accuracy: acc,
      isBoss: this.params.isBoss,
    });
  }

  private onTimeout(): void {
    // Unhit correct blocks were too slow: soft-miss them so they come back sooner.
    for (const b of this.blocks) if (b.alive && b.correct && b.fact >= 0) this.learning.recordSoftMiss(b.fact);
    if (this.boss?.active && this.boss.fact >= 0) this.learning.recordSoftMiss(this.boss.fact);
    this.events.emit('timeout', { round: this.round, callout: this.callouts.pick('timeout') });
    this.heat = updateHeat(this.heat, Math.min(this.roundAccuracy(), 0.6), Math.max(1, this.roundCorrect + this.roundWrong));
    this.damage(R.timeoutDamage, 'timeout', true);
    if (this.phase !== 'playing') return; // died
    this.setPhase('clear');
    this.slowmoTime = 0;
    this.events.emit('roundClear', { round: this.round, perfect: false, bonus: 0, callout: 'TIME\'S UP', accuracy: this.roundAccuracy(), isBoss: this.params.isBoss });
  }

  private offerPerks(): void {
    const pool = PERK_IDS.filter((p) => !(p === 'heal' && this.hp >= this.maxHp) && !(p === 'fists' && this.perks.fists > 0) && !(p === 'combo' && this.perks.combo > 0));
    this.perkOffer = this.rng.shuffle(pool.slice()).slice(0, 3);
    this.setPhase('perk');
    this.events.emit('perkOffer', { perks: this.perkOffer });
  }

  takePerk(perk: PerkId): void {
    if (this.phase !== 'perk') return;
    this.perks[perk]++;
    if (perk === 'heal') this.heal(CONFIG.perks.heal);
    if (perk === 'slowmo') this.slowmoCharges++;
    this.events.emit('perkTaken', { perk });
    this.round++;
    this.beginRound();
  }

  private endRun(): void {
    this.setPhase('gameover');
    this.slowmoTime = 0;
    const shards = Math.round(
      shardsForRun(this.stats.roundsCleared, this.stats.perfectRounds, this.stats.bossesBeaten, this.score, this.upgrades.magnet) *
        (1 + CONFIG.perks.shardBonus * this.perks.shards),
    ) + this.stats.goldens * CONFIG.golden.shards;
    this.lastShards = shards;
    this.events.emit('gameOver', {
      score: this.score,
      round: this.round + 1,
      shards,
      callout: this.callouts.pick('death'),
      bestCombo: this.stats.bestCombo,
      seconds: this.stats.seconds,
    });
  }

  // ------------------------------------------------------------- boss

  private tickBoss(dt: number): void {
    const boss = this.boss;
    if (!boss) return;
    if (!boss.active) {
      boss.gap -= dt * this.timeScale;
      if (boss.gap <= 0) this.startVolley();
      return;
    }
    boss.volleyTime += dt * this.timeScale;
    if (boss.volleyTime >= CONFIG.boss.volleyTimeout) {
      if (boss.fact >= 0) {
        this.learning.recordSoftMiss(boss.fact);
        boss.requeue.push(boss.fact);
      }
      boss.active = false;
      boss.gap = R.bossVolleyGap;
      this.damage(P.orbDamage, 'orb');
    }
  }

  private startVolley(): void {
    const boss = this.boss;
    if (!boss) return;
    let fact = -1;
    // Missed facts come back two volleys later; otherwise bias hard to weakest facts.
    if (boss.requeue.length > 0 && this.rng.chance(0.6)) fact = boss.requeue.shift() as number;
    if (fact < 0) {
      const weak = this.learning.weakest(5);
      fact = weak.length > 0 && this.rng.chance(0.7) ? this.rng.pick(weak) : this.learning.pickFact(this.rng);
    }
    const f = FACTS[fact] ?? FACTS[factIndex(6, 7)];
    if (!f) return;
    const flip = this.rng.chance(0.5);
    boss.a = flip ? f.b : f.a;
    boss.b = flip ? f.a : f.b;
    boss.fact = f.index;
    boss.choices = bossChoices(boss.a, boss.b, CONFIG.boss.orbCount, this.rng);
    boss.correctIndex = boss.choices.indexOf(boss.a * boss.b);
    boss.active = true;
    boss.volleyTime = 0;
    this.lastAction = this.clock;
    this.events.emit('bossVolley', { a: boss.a, b: boss.b, choices: boss.choices.slice(), correctIndex: boss.correctIndex, bossHp: boss.hp });
  }

  /** Player punched boss orb `index` of the current volley. */
  hitOrb(index: number): 'correct' | 'wrong' | null {
    const boss = this.boss;
    if (this.phase !== 'playing' || !boss || !boss.active) return null;
    if (index < 0 || index >= boss.choices.length) return null;
    const rtMs = (this.clock - this.lastAction) * 1000;
    boss.active = false;
    boss.gap = R.bossVolleyGap;
    if (index === boss.correctIndex) {
      this.learning.record(boss.fact, true, rtMs);
      boss.hp--;
      this.combo++;
      this.stats.correct++;
      this.roundCorrect++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      const points = S.bossHitPoints * comboMultiplier(this.combo);
      this.score += points;
      this.events.emit('bossHit', { bossHp: boss.hp, points, receipt: `${boss.a}×${boss.b}=${boss.a * boss.b}` });
      if (boss.hp <= 0) this.onRoundClear();
      return 'correct';
    }
    this.learning.record(boss.fact, false, rtMs);
    boss.requeue.push(boss.fact);
    this.stats.wrong++;
    this.roundWrong++;
    this.breakCombo();
    this.events.emit('bossWrong', { readout: `${boss.a} × ${boss.b} = ${boss.a * boss.b}`, value: boss.choices[index] as number });
    this.damage(P.wrongDamage, 'wrong', true);
    return 'wrong';
  }
}
