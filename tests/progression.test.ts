import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buyOrEquipSkin, buyUpgrade, dateKey, defaultProgress, playtime, recordRun, sanitizeProgress, skinDef, startingHp, upgradeCost } from '../src/logic/progression';

describe('progression', () => {
  it('buys upgrades with escalating costs and caps', () => {
    const p = defaultProgress();
    expect(buyUpgrade(p, 'maxHp')).toBe(false);
    p.shards = 1000;
    let spent = 0;
    for (const c of CONFIG.upgrades.maxHp.cost) {
      expect(upgradeCost(p, 'maxHp')).toBe(c);
      expect(buyUpgrade(p, 'maxHp')).toBe(true);
      spent += c;
    }
    expect(upgradeCost(p, 'maxHp')).toBeNull();
    expect(buyUpgrade(p, 'maxHp')).toBe(false);
    expect(p.shards).toBe(1000 - spent);
    expect(startingHp(p)).toBe(CONFIG.player.baseHp + 3 * CONFIG.player.hpPerUpgrade);
  });
  it('buys and equips skins', () => {
    const p = defaultProgress();
    expect(buyOrEquipSkin(p, 'lava')).toBe(false);
    p.shards = 45;
    expect(buyOrEquipSkin(p, 'lava')).toBe(true);
    expect(p.skin).toBe('lava');
    expect(p.shards).toBe(5);
    expect(buyOrEquipSkin(p, 'neon')).toBe(true);
    expect(buyOrEquipSkin(p, 'lava')).toBe(true);
    expect(p.shards).toBe(5);
    expect(buyOrEquipSkin(p, 'nope')).toBe(false);
    expect(skinDef('nope').id).toBe('neon');
  });
  it('records runs and high scores', () => {
    const p = defaultProgress();
    expect(recordRun(p, { score: 500, roundsReached: 3, bestCombo: 4, shards: 7, seconds: 120 })).toBe(true);
    expect(recordRun(p, { score: 300, roundsReached: 2, bestCombo: 9, shards: 2, seconds: 60 })).toBe(false);
    expect(recordRun(p, { score: 0, roundsReached: 1, bestCombo: 0, shards: 0, seconds: 10 })).toBe(false);
    for (let i = 0; i < 12; i++) recordRun(p, { score: 10 + i, roundsReached: 1, bestCombo: 1, shards: 0, seconds: 1 });
    expect(p.highScores).toHaveLength(10);
    expect(p.highScores[0]!.score).toBe(500);
    expect(p.shards).toBe(9);
    expect(p.bestCombo).toBe(9);
    expect(p.runs).toBe(15);
  });
  it('sanitizes hostile saves', () => {
    expect(sanitizeProgress(null)).toEqual(defaultProgress());
    const p = sanitizeProgress({
      shards: -5,
      upgrades: { maxHp: 99, slowmo: 'x' },
      skinsOwned: ['lava', 42, 'hax'],
      skin: 'hax',
      highScores: [{ score: 5 }, null, { score: 9, round: 2, combo: 3 }],
      settings: { seated: true, volume: 7, reducedFx: 'yes' },
    });
    expect(p.shards).toBe(0);
    expect(p.upgrades.maxHp).toBe(CONFIG.upgrades.maxHp.max);
    expect(p.upgrades.slowmo).toBe(0);
    expect(p.skinsOwned).toEqual(['neon', 'lava']);
    expect(p.skin).toBe('neon');
    expect(p.highScores.map((h) => h.score)).toEqual([9, 5]);
    expect(p.settings.seated).toBe(true);
    expect(p.settings.volume).toBe(1);
    expect(p.settings.reducedFx).toBe(false);
    expect(p.settings.aim).toBe('both');
    expect(sanitizeProgress({ settings: { aim: 'blast' } }).settings.aim).toBe('blast');
    expect(sanitizeProgress({ settings: { aim: 'lol' } }).settings.aim).toBe('both');
    const round = sanitizeProgress(JSON.parse(JSON.stringify(p)));
    expect(round).toEqual(p);
  });
});

describe('parent playtime', () => {
  it('tracks today and the last 7 days locally, keeps 14 days', () => {
    const p = defaultProgress();
    const day = (n: number) => new Date(2026, 10, n, 12);
    for (let d = 1; d <= 20; d++) recordRun(p, { score: 0, roundsReached: 1, bestCombo: 0, shards: 0, seconds: 60 }, day(d));
    expect(Object.keys(p.daily)).toHaveLength(14);
    const t = playtime(p, day(20));
    expect(t.today).toBe(60);
    expect(t.week).toBe(7 * 60);
    expect(dateKey(day(5))).toBe('2026-11-05');
    const back = sanitizeProgress(JSON.parse(JSON.stringify({ ...p, daily: { ...p.daily, nope: 5, '2026-11-19': 'x' } })));
    expect(back.daily['nope' as string]).toBeUndefined();
    expect(back.daily['2026-11-19']).toBe(0);
  });
});
