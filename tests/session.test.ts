import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { LearningEngine } from '../src/logic/learning';
import { Rng } from '../src/logic/rng';
import { GameSession, PERK_IDS, type PerkId } from '../src/logic/session';

const NO_UP = { maxHp: 0, slowmo: 0, shield: 0, magnet: 0 };

function make(seed = 1) {
  const learning = new LearningEngine();
  const s = new GameSession(learning, new Rng(seed));
  const log: string[] = [];
  for (const ev of ['runStart', 'roundStart', 'playing', 'hitCorrect', 'hitWrong', 'comboTier', 'comboBreak', 'damage', 'heal', 'roundClear', 'timeout', 'bossVolley', 'bossHit', 'bossWrong', 'bossDefeated', 'bugPunched', 'perkOffer', 'perkTaken', 'slowmo', 'blockChanged', 'gameOver'] as const) {
    s.events.on(ev, () => log.push(ev));
  }
  return { s, learning, log };
}

function toPlaying(s: GameSession) {
  for (let i = 0; i < 200 && s.phase === 'intro'; i++) s.tick(0.05);
  expect(s.phase).toBe('playing');
}

function clearGrid(s: GameSession) {
  for (const b of s.blocks) if (b.correct && b.alive) s.hitBlock(b.id);
}

function finishClearToNextRound(s: GameSession, perk?: PerkId) {
  for (let i = 0; i < 200 && s.phase === 'clear'; i++) s.tick(0.05);
  expect(s.phase).toBe('perk');
  s.takePerk(perk ?? s.perkOffer[0]!);
  expect(s.phase).toBe('intro');
}

function beatBoss(s: GameSession) {
  toPlaying(s);
  let guard = 0;
  while (s.phase === 'playing' && guard++ < 10000) {
    if (s.boss?.active) s.hitOrb(s.boss.correctIndex);
    s.tick(0.05);
  }
}

describe('session state machine', () => {
  it('menu → intro → playing → clear → perk → next round', () => {
    const { s, log } = make();
    expect(s.phase).toBe('menu');
    expect(s.hitBlock(0)).toBeNull();
    s.startRun(NO_UP);
    expect(s.phase).toBe('intro');
    expect(s.hp).toBe(CONFIG.player.baseHp);
    expect(s.blocks.length).toBe(20);
    expect(s.rule?.kind).toBe('multiples');
    expect(s.hitBlock(0)).toBeNull(); // not during intro
    toPlaying(s);
    clearGrid(s);
    expect(s.phase).toBe('clear');
    expect(s.stats.perfectRounds).toBe(1);
    expect(s.score).toBeGreaterThan(0);
    finishClearToNextRound(s);
    expect(s.round).toBe(1);
    expect(log).toContain('perkOffer');
    expect(log).toContain('comboTier');
  });

  it('wrong hits cost HP, reset combo, show a readout and are learned', () => {
    const { s, learning } = make(2);
    s.startRun(NO_UP);
    toPlaying(s);
    const right = s.blocks.find((b) => b.correct)!;
    expect(s.hitBlock(right.id)).toBe('correct');
    expect(s.hitBlock(right.id)).toBeNull(); // already smashed
    expect(s.combo).toBe(1);
    const wrong = s.blocks.find((b) => !b.correct)!;
    let readout = '';
    s.events.on('hitWrong', (e) => (readout = e.readout));
    expect(s.hitBlock(wrong.id)).toBe('wrong');
    expect(readout).toMatch(/\d+ × \d+ = \d+/);
    expect(s.combo).toBe(0);
    expect(s.hp).toBe(CONFIG.player.baseHp - CONFIG.player.wrongDamage);
    if (wrong.fact >= 0) expect(learning.stats[wrong.fact]!.wrong).toBe(1);
    expect(s.hitBlock(9999)).toBeNull();
  });

  it('combo shield keeps combo once per round', () => {
    const { s } = make(3);
    s.startRun({ ...NO_UP, shield: 1 });
    toPlaying(s);
    s.hitBlock(s.blocks.find((b) => b.correct)!.id);
    const wrongs = s.blocks.filter((b) => !b.correct);
    s.hitBlock(wrongs[0]!.id);
    expect(s.combo).toBe(1);
    s.hitBlock(wrongs[1]!.id);
    expect(s.combo).toBe(0);
  });

  it('timeout damages and soft-misses remaining facts, run continues', () => {
    const { s, learning, log } = make(4);
    s.startRun(NO_UP);
    toPlaying(s);
    const pending = s.blocks.filter((b) => b.correct && b.fact >= 0).map((b) => b.fact);
    for (let i = 0; i < 2000 && s.phase === 'playing'; i++) s.tick(0.1);
    expect(log).toContain('timeout');
    expect(s.hp).toBe(CONFIG.player.baseHp - CONFIG.rounds.timeoutDamage);
    expect(s.phase).toBe('clear');
    expect(learning.stats[pending[0]!]!.rtAvg).toBeGreaterThan(CONFIG.learning.slowMs);
  });

  it('bug contact respects i-frames; bug punch scores', () => {
    const { s } = make(5);
    s.startRun(NO_UP);
    expect(s.bugContact()).toBe(false); // not playing yet
    toPlaying(s);
    expect(s.bugContact()).toBe(true);
    expect(s.bugContact()).toBe(false);
    for (let i = 0; i < 40; i++) s.tick(0.05);
    expect(s.bugContact()).toBe(true);
    const before = s.score;
    s.bugPunched();
    expect(s.score).toBe(before + CONFIG.scoring.bugPunchPoints);
    expect(s.stats.bugsPunched).toBe(1);
  });

  it('dies at 0 HP, awards shards, restart works', () => {
    const { s, log } = make(6);
    s.startRun(NO_UP);
    toPlaying(s);
    clearGrid(s);
    finishClearToNextRound(s);
    toPlaying(s);
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 100) {
      s.bugContact();
      for (let i = 0; i < 30; i++) s.tick(0.05);
    }
    expect(s.phase).toBe('gameover');
    expect(log).toContain('gameOver');
    expect(s.lastShards).toBeGreaterThan(0);
    s.startRun(NO_UP);
    expect(s.phase).toBe('intro');
    expect(s.hp).toBe(s.maxHp);
    expect(s.round).toBe(0);
    expect(s.score).toBe(0);
  });

  it('round 5 is a boss: volleys, wrong/correct orbs, timeout, defeat heals', () => {
    const { s, log, learning } = make(7);
    learning.unlockAll();
    s.startRun({ ...NO_UP, maxHp: 3 });
    for (let r = 0; r < 4; r++) {
      toPlaying(s);
      clearGrid(s);
      finishClearToNextRound(s, 'time');
    }
    expect(s.round).toBe(4);
    expect(s.isBossRound).toBe(true);
    expect(s.blocks).toHaveLength(0);
    toPlaying(s);
    expect(s.hitOrb(0)).toBeNull(); // before first volley
    for (let i = 0; i < 100 && !s.boss!.active; i++) s.tick(0.05);
    expect(s.boss!.active).toBe(true);
    expect(s.boss!.choices[s.boss!.correctIndex]).toBe(s.boss!.a * s.boss!.b);
    const hp0 = s.hp;
    expect(s.hitOrb((s.boss!.correctIndex + 1) % 3)).toBe('wrong');
    expect(s.hp).toBe(hp0 - CONFIG.player.wrongDamage);
    expect(s.boss!.requeue.length).toBe(1);
    // Let one volley time out.
    for (let i = 0; i < 100 && !s.boss!.active; i++) s.tick(0.05);
    for (let i = 0; i < 400 && s.boss!.active; i++) s.tick(0.05);
    expect(s.hitOrb(99)).toBeNull();
    beatBoss(s);
    expect(log).toContain('bossDefeated');
    expect(s.stats.bossesBeaten).toBe(1);
    expect(s.phase).toBe('clear');
  });

  it('perks apply', () => {
    const { s } = make(8);
    s.startRun(NO_UP);
    toPlaying(s);
    clearGrid(s);
    for (let i = 0; i < 200 && s.phase === 'clear'; i++) s.tick(0.05);
    expect(s.perkOffer.length).toBe(3);
    for (const p of s.perkOffer) expect(PERK_IDS).toContain(p);
    s.perks.fists = 1;
    expect(s.fistScale).toBe(CONFIG.perks.fistScale);
    s.perks.freeze = 1;
    expect(s.bugSpeedScale).toBeLessThan(1);
    const t = s.params.timeLimit;
    s.takePerk('time');
    expect(s.timeLeft).toBe(roundTime(s) );
    expect(t).toBeGreaterThan(0);
    s.takePerk('heal'); // ignored outside perk phase
    // Perk auto-picks after timeout.
    toPlaying(s);
    clearGrid(s);
    for (let i = 0; i < 2000 && s.phase !== 'intro'; i++) s.tick(0.05);
    expect(s.round).toBe(2);
  });

  it('slow-mo consumes charges and scales time', () => {
    const { s, log } = make(9);
    s.startRun({ ...NO_UP, slowmo: 1 });
    expect(s.activateSlowmo()).toBe(false);
    toPlaying(s);
    expect(s.slowmoCharges).toBe(2);
    expect(s.activateSlowmo()).toBe(true);
    expect(s.timeScale).toBe(CONFIG.slowmo.timeScale);
    expect(s.activateSlowmo()).toBe(false);
    const t0 = s.timeLeft;
    s.tick(0.1);
    expect(t0 - s.timeLeft).toBeCloseTo(0.1 * CONFIG.slowmo.timeScale, 5);
    for (let i = 0; i < 100; i++) s.tick(0.05);
    expect(s.timeScale).toBe(1);
    expect(log.filter((e) => e === 'slowmo')).toHaveLength(2);
  });

  it('corrupt re-rolls a live block and quit resets', () => {
    const { s, log } = make(10);
    s.startRun(NO_UP);
    s.corruptBlock(0); // ignored in intro
    toPlaying(s);
    const before = s.blocks[0]!;
    s.corruptBlock(0);
    expect(s.blocks[0]!.correct).toBe(before.correct);
    expect(log).toContain('blockChanged');
    s.heal(99);
    expect(s.hp).toBe(s.maxHp);
    s.quitToMenu();
    expect(s.phase).toBe('menu');
    expect(s.multiplier).toBe(1);
  });

  it('plays 500 headless runs without soft-locking', () => {
    const { s } = make(11);
    const rng = new Rng(99);
    for (let run = 0; run < 500; run++) {
      s.startRun(NO_UP);
      let guard = 0;
      while (s.phase !== 'gameover' && guard++ < 200000) {
        if (s.phase === 'perk') s.takePerk(s.perkOffer[0]!);
        else if (s.phase === 'playing') {
          if (s.boss?.active && rng.chance(0.05)) s.hitOrb(rng.chance(0.7) ? s.boss.correctIndex : 0);
          else if (rng.chance(0.08)) {
            const alive = s.blocks.filter((b) => b.alive);
            if (alive.length) s.hitBlock(rng.pick(alive).id);
          }
          if (rng.chance(0.002)) s.bugContact();
        }
        s.tick(1 / 20);
      }
      expect(s.phase).toBe('gameover');
    }
  });
});

function roundTime(s: GameSession): number {
  return s.params.timeLimit + CONFIG.perks.timeBonus * s.perks.time;
}

describe('fluency timing', () => {
  it('normalises grid response time by grid size (search time is not recall time)', () => {
    const learning = new LearningEngine();
    const s = new GameSession(learning, new Rng(21));
    s.startRun(NO_UP);
    toPlaying(s);
    // Fake a big grid: duplicate blocks to 35 cells.
    while (s.blocks.length < 35) s.blocks.push({ ...s.blocks[0]!, id: s.blocks.length, alive: false });
    for (let i = 0; i < 60; i++) s.tick(0.05); // 3 s
    const b = s.blocks.find((x) => x.correct && x.alive && x.fact >= 0)!;
    s.hitBlock(b.id);
    const rt = learning.stats[b.fact]!.rtAvg;
    expect(rt).toBeLessThan(3000);
    expect(rt).toBeGreaterThan(2000);
  });
});

describe('golden blocks', () => {
  it('golden correct block triples points and adds shards', () => {
    const { s } = make(31);
    let found = false;
    for (let attempt = 0; attempt < 40 && !found; attempt++) {
      s.startRun(NO_UP);
      found = s.blocks.some((b) => b.golden);
    }
    expect(found).toBe(true);
    const g = s.blocks.find((b) => b.golden)!;
    expect(g.correct).toBe(true);
    toPlaying(s);
    let pts = 0;
    let callout = '';
    s.events.on('hitCorrect', (e) => {
      pts = e.points;
      callout = e.callout;
    });
    s.hitBlock(g.id);
    expect(callout).toContain('GOLDEN');
    expect(pts).toBeGreaterThanOrEqual(300);
    expect(s.stats.goldens).toBe(1);
  });
});

describe('blaster', () => {
  it('zaps count like punches but score less', () => {
    const a = make(41);
    const b = make(41);
    a.s.startRun(NO_UP);
    b.s.startRun(NO_UP);
    toPlaying(a.s);
    toPlaying(b.s);
    const id = a.s.blocks.find((x) => x.correct && !x.golden)!.id;
    expect(a.s.hitBlock(id)).toBe('correct');
    expect(b.s.hitBlock(id, true)).toBe('correct');
    expect(b.s.score).toBeLessThan(a.s.score);
    expect(b.s.score).toBe(Math.round(a.s.score * CONFIG.blaster.pointsMult));
  });
});
