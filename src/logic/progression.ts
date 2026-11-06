import { CONFIG } from '../config.js';

export type UpgradeId = keyof typeof CONFIG.upgrades;
export const UPGRADE_IDS = Object.keys(CONFIG.upgrades) as UpgradeId[];

export const UPGRADE_INFO: Record<UpgradeId, { name: string; desc: string }> = {
  maxHp: { name: 'EXTRA HEART', desc: '+1 MAX HP EVERY RUN' },
  slowmo: { name: 'LAG SWITCH', desc: 'CLAP OR PRESS A/X: SLOW-MO' },
  shield: { name: 'COMBO SHIELD', desc: 'ONE OOPS PER ROUND KEEPS COMBO' },
  magnet: { name: 'SHARD MAGNET', desc: '+25% SHARDS PER RUN' },
};

export interface HighScore {
  score: number;
  round: number;
  combo: number;
}

export type AimMode = 'both' | 'punch' | 'blast';

export interface Settings {
  seated: boolean;
  /** Punch, point-and-blast, or both. */
  aim: AimMode;
  volume: number;
  music: number;
  reducedFx: boolean;
}

export interface Progress {
  v: 1;
  shards: number;
  upgrades: Record<UpgradeId, number>;
  skinsOwned: string[];
  skin: string;
  highScores: HighScore[];
  runs: number;
  lifetimeRounds: number;
  bestRound: number;
  bestCombo: number;
  playSeconds: number;
  /** Local-date key (YYYY-MM-DD) → seconds played. Last 14 days only. */
  daily: Record<string, number>;
  settings: Settings;
}

export function defaultSettings(): Settings {
  return { seated: false, aim: 'both', volume: CONFIG.audio.masterDefault, music: 0.7, reducedFx: false };
}

export function defaultProgress(): Progress {
  return {
    v: 1,
    shards: 0,
    upgrades: { maxHp: 0, slowmo: 0, shield: 0, magnet: 0 },
    skinsOwned: ['neon'],
    skin: 'neon',
    highScores: [],
    runs: 0,
    lifetimeRounds: 0,
    bestRound: 0,
    bestCombo: 0,
    playSeconds: 0,
    daily: {},
    settings: defaultSettings(),
  };
}

const num = (v: unknown, d: number, lo = 0, hi = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Validate/migrate untrusted saved data. Never throws. */
export function sanitizeProgress(data: unknown): Progress {
  const p = defaultProgress();
  if (!data || typeof data !== 'object') return p;
  const d = data as Record<string, unknown>;
  p.shards = Math.floor(num(d.shards, 0));
  const up = (d.upgrades ?? {}) as Record<string, unknown>;
  for (const id of UPGRADE_IDS) p.upgrades[id] = Math.floor(num(up[id], 0, 0, CONFIG.upgrades[id].max));
  const skinIds = CONFIG.skins.map((s) => s.id as string);
  if (Array.isArray(d.skinsOwned)) {
    p.skinsOwned = Array.from(new Set(['neon', ...d.skinsOwned.filter((s): s is string => typeof s === 'string' && skinIds.includes(s))]));
  }
  if (typeof d.skin === 'string' && p.skinsOwned.includes(d.skin)) p.skin = d.skin;
  if (Array.isArray(d.highScores)) {
    p.highScores = d.highScores
      .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
      .map((h) => ({ score: Math.floor(num(h.score, 0)), round: Math.floor(num(h.round, 0)), combo: Math.floor(num(h.combo, 0)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
  p.runs = Math.floor(num(d.runs, 0));
  p.lifetimeRounds = Math.floor(num(d.lifetimeRounds, 0));
  p.bestRound = Math.floor(num(d.bestRound, 0));
  p.bestCombo = Math.floor(num(d.bestCombo, 0));
  p.playSeconds = num(d.playSeconds, 0);
  if (d.daily && typeof d.daily === 'object') {
    for (const [k, v] of Object.entries(d.daily as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) p.daily[k] = num(v, 0);
    }
    pruneDaily(p);
  }
  const s = (d.settings ?? {}) as Record<string, unknown>;
  const ds = defaultSettings();
  p.settings = {
    seated: typeof s.seated === 'boolean' ? s.seated : ds.seated,
    aim: s.aim === 'punch' || s.aim === 'blast' || s.aim === 'both' ? s.aim : ds.aim,
    volume: num(s.volume, ds.volume, 0, 1),
    music: num(s.music, ds.music, 0, 1),
    reducedFx: typeof s.reducedFx === 'boolean' ? s.reducedFx : ds.reducedFx,
  };
  return p;
}

export function upgradeCost(p: Progress, id: UpgradeId): number | null {
  const lvl = p.upgrades[id];
  const def = CONFIG.upgrades[id];
  if (lvl >= def.max) return null;
  return def.cost[lvl] ?? null;
}

export function buyUpgrade(p: Progress, id: UpgradeId): boolean {
  const cost = upgradeCost(p, id);
  if (cost === null || p.shards < cost) return false;
  p.shards -= cost;
  p.upgrades[id]++;
  return true;
}

export function skinDef(id: string) {
  return CONFIG.skins.find((s) => s.id === id) ?? CONFIG.skins[0];
}

/** Buy (if needed) and equip a skin. */
export function buyOrEquipSkin(p: Progress, id: string): boolean {
  const def = CONFIG.skins.find((s) => s.id === id);
  if (!def) return false;
  if (!p.skinsOwned.includes(id)) {
    if (p.shards < def.cost) return false;
    p.shards -= def.cost;
    p.skinsOwned.push(id);
  }
  p.skin = id;
  return true;
}

/** Local calendar date key. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pruneDaily(p: Progress): void {
  const keys = Object.keys(p.daily).sort();
  while (keys.length > 14) delete p.daily[keys.shift() as string];
}

/** Seconds played today and over the last 7 days (inclusive). */
export function playtime(p: Progress, today: Date): { today: number; week: number } {
  let week = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    week += p.daily[dateKey(d)] ?? 0;
  }
  return { today: p.daily[dateKey(today)] ?? 0, week };
}

export interface RunResult {
  score: number;
  roundsReached: number;
  bestCombo: number;
  shards: number;
  seconds: number;
}

/** Fold a finished run into progress. Returns true if it is a new top score. */
export function recordRun(p: Progress, r: RunResult, today: Date = new Date()): boolean {
  const isBest = p.highScores.length === 0 || r.score > (p.highScores[0]?.score ?? 0);
  p.shards += r.shards;
  p.runs++;
  p.bestRound = Math.max(p.bestRound, r.roundsReached);
  p.bestCombo = Math.max(p.bestCombo, r.bestCombo);
  p.playSeconds += r.seconds;
  const key = dateKey(today);
  p.daily[key] = (p.daily[key] ?? 0) + r.seconds;
  pruneDaily(p);
  if (r.score > 0) {
    p.highScores.push({ score: r.score, round: r.roundsReached, combo: r.bestCombo });
    p.highScores.sort((a, b) => b.score - a.score);
    p.highScores.length = Math.min(p.highScores.length, 10);
  }
  return isBest && r.score > 0;
}

export function startingHp(p: Progress): number {
  return Math.min(CONFIG.player.maxHpCap, CONFIG.player.baseHp + CONFIG.player.hpPerUpgrade * p.upgrades.maxHp);
}
