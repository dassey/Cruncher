/**
 * CRUNCHER — every tuning number lives here.
 * Pure data: no imports, safe for logic, systems and tests.
 */

export const CONFIG = {
  facts: {
    min: 2,
    max: 12,
  },

  learning: {
    /** Leitner boxes 1..maxBox. New facts start in box 1. */
    maxBox: 5,
    /** Relative pick weight per box (index = box). Box 1 = weakest. */
    boxWeights: [0, 10, 6, 3, 1.5, 0.6],
    /** A correct answer slower than this (ms) does not promote the fact. */
    slowMs: 4500,
    /** A correct answer faster than this (ms) counts as fluent. */
    fluentMs: 2500,
    /** Extra weight multiplier applied to facts with a slow running average. */
    slowWeightBoost: 1.6,
    /** Unseen facts have this weight so they get introduced gradually. */
    unseenWeight: 2.5,
    /** Weight multiplier for facts outside the current unlocked frontier. */
    lockedWeight: 0,
    /** Max unseen facts introduced per round. */
    maxNewPerRound: 2,
    /** Exponential moving average factor for response time. */
    rtAlpha: 0.35,
    /** Box at/above which (with fluent avg time) a fact counts as mastered. */
    masteredBox: 4,
    /** Table unlock order (easy → hard). A table unlocks once enough of the unlocked set is box >= 2. */
    tableOrder: [2, 10, 5, 3, 4, 11, 9, 6, 8, 7, 12],
    initialTables: 3,
    unlockThreshold: 0.6,
    /** Response-time window: a hit later than this after the previous one is clamped. */
    maxRtMs: 9000,
  },

  grid: {
    /** Cell spacing (m) and block size (m). */
    blockSize: 0.115,
    spacing: 0.145,
    /** Arc radius from the player (m) — within a kid's arm reach. */
    radius: 0.48,
    /** Rows below the grid centre come this much closer per metre of drop (console-desk tilt). */
    tilt: 0.2,
    /** Grid centre height below head height (m). */
    belowHead: 0.28,
    seatedBelowHead: 0.24,
    /** Standing default head height when no tracking yet (m). */
    defaultHeadY: 1.45,
    /** Fraction of cells that are correct. */
    correctFraction: [0.34, 0.5] as [number, number],
    /** Weight multiplier applied each time a value is reused in the same grid. */
    repeatDamping: 0.3,
    /** How sharply grids focus on weak facts (exponent on learning weight), scaled by DDA heat. */
    focusExponent: 1.4,
    focusHeatScale: 0.5,
    bobAmp: 0.008,
    bobHz: 0.35,
  },

  rounds: {
    /** Grid size per round tier (cols, rows). */
    sizes: [
      [5, 4],
      [5, 4],
      [6, 4],
      [6, 4],
      [6, 5],
      [7, 5],
    ] as Array<[number, number]>,
    bossEvery: 5,
    /** Time limit (s) for a round, and how much it shrinks per round. */
    baseTime: 75,
    timePerRound: -2,
    minTime: 50,
    introSeconds: 2.2,
    clearSeconds: 2.6,
    /** Timer running out costs this much HP (half-hearts) and ends the round. */
    timeoutDamage: 2,
    perkSeconds: 14,
    /** Seconds without a correct hit before remaining correct blocks shimmer (anti-frustration). */
    assistAfter: 12,
    bossStartDelay: 2.0,
    bossVolleyGap: 1.4,
  },

  difficulty: {
    /** Dynamic difficulty: target accuracy (the "85% rule"). */
    targetAccuracy: 0.82,
    /** heat in [-1, 1]; positive = player is cruising, crank pressure. */
    heatGain: 0.6,
    heatDecay: 0.15,
    /** How much heat scales bug speed and time pressure (±). */
    heatSpeedScale: 0.25,
    heatTimeScale: 0.15,
  },

  player: {
    /** HP is counted in half-hearts: 10 = 5 hearts. */
    baseHp: 10,
    hpPerUpgrade: 2,
    maxHpCap: 18,
    wrongDamage: 1,
    bugDamage: 1,
    orbDamage: 2,
    clearHeal: 1,
    bossHeal: 4,
    /** Bug contact radius around the head centre (keeps lunges ~20 cm from the face: comfort). */
    headRadius: 0.22,
    /** Invulnerability after taking damage (s). */
    iFrames: 1.2,
  },

  hit: {
    /** Hand collision radius (m). */
    handRadius: 0.04,
    /** Punch point sits this far forward of the grip origin (knuckles, not wrist). */
    knuckleOffset: 0.05,
    /** Minimum hand speed (m/s) for a punch to register. */
    minPunchSpeed: 0.45,
    /** Per-hand cooldown between hits (s). */
    handCooldown: 0.25,
    /** Fraction of minPunchSpeed the hand must move *into* the target (blocks retract-swipes). */
    approachFactor: 0.6,
    /** Vertical part of the approach direction is damped so up/down sweeps don't count. */
    approachVertical: 0.35,
    /** Global hit-stop duration on a correct hit (s, real time). */
    hitStop: 0.045,
    hitStopBig: 0.08,
  },

  scoring: {
    basePoints: 100,
    /** Combo thresholds → multiplier. */
    comboTiers: [
      { at: 0, mult: 1 },
      { at: 3, mult: 2 },
      { at: 6, mult: 3 },
      { at: 10, mult: 4 },
      { at: 15, mult: 5 },
    ],
    /** Speed bonus: up to this many points for fast hits. */
    speedBonusMax: 60,
    speedBonusMs: 2500,
    bugPunchPoints: 150,
    bossHitPoints: 500,
    roundClearBonus: 300,
    perfectBonus: 500,
    /** Wrong hit aura penalty (cosmetic: score never goes below 0). */
    wrongPenalty: 50,
  },

  golden: {
    /** Chance a round has one golden (correct) block. */
    chance: 0.2,
    pointsMult: 3,
    shards: 2,
  },

  shards: {
    perRound: 3,
    perfectRound: 3,
    perBoss: 10,
    /** 1 shard per this many points scored. */
    perPoints: 2000,
  },

  bugs: {
    /** Bug count per round index (clamped). */
    countByRound: [0, 1, 1, 2, 2, 2, 3, 3, 3, 4],
    baseSpeed: 0.06,
    speedPerRound: 0.006,
    maxSpeed: 0.16,
    radius: 0.07,
    /** Seconds between lunges toward the player head. */
    lungeEvery: [7, 12] as [number, number],
    lungeTelegraph: 1.1,
    lungeSpeed: 0.55,
    /** Punched bug flies off and respawns after this many seconds. */
    respawnSeconds: 4,
    /** Corrupt (re-roll) the number of a block a bug passes through. */
    corruptChance: 0.25,
  },

  boss: {
    hp: 5,
    orbCount: 3,
    orbSpeed: 0.16,
    orbSpawnDistance: 1.4,
    /** Orbs stop this far from the player and wait to be punched. */
    orbHoldDistance: 0.45,
    /** Seconds before an un-punched volley hurts the player. */
    volleyTimeout: 9,
    orbRadius: 0.075,
  },

  upgrades: {
    maxHp: { cost: [30, 70, 140], max: 3 },
    slowmo: { cost: [40, 90], max: 2 },
    shield: { cost: [50, 110], max: 2 },
    magnet: { cost: [40, 100], max: 2 },
  },

  perks: {
    timeBonus: 10,
    fistScale: 1.3,
    comboStart: 3,
    bugSlow: 0.7,
    shardBonus: 0.5,
    heal: 2,
  },

  blaster: {
    /** Zaps score this fraction of a punch (punching stays the best move). */
    pointsMult: 0.75,
    cooldown: 0.18,
    range: 4,
    /** Target radius multiplier for rays (forgiving aim for kids). */
    aimAssist: 1.25,
  },

  slowmo: {
    baseCharges: 1,
    durationSec: 4,
    timeScale: 0.45,
    clapDistance: 0.12,
    clapSpeed: 0.8,
  },

  skins: [
    { id: 'neon', name: 'NEON DEFAULT', cost: 0, color: 0x00f0ff, accent: 0xff2bd6 },
    { id: 'lava', name: 'LAVA LAMP', cost: 40, color: 0xff5a1f, accent: 0xffd000 },
    { id: 'toxic', name: 'TOXIC SLIME', cost: 70, color: 0x5dff3a, accent: 0xa200ff },
    { id: 'void', name: 'VOID MODE', cost: 110, color: 0x9d4dff, accent: 0x00ffa8 },
    { id: 'gold', name: 'DRIP GOLD', cost: 170, color: 0xffc83d, accent: 0xffffff },
    { id: 'rgb', name: 'RGB GAMER', cost: 250, color: 0xff0055, accent: 0x00ffea },
  ],

  fx: {
    /** Photosensitivity: never more than this many luminance flashes per second. */
    maxFlashesPerSecond: 2,
    /** Max opacity of edge glitch vignette (never full-field). */
    vignetteMaxOpacity: 0.42,
    particlesPerHit: 22,
    particlesPerHitReduced: 8,
    maxParticles: 512,
    popupLifetime: 0.9,
  },

  audio: {
    masterDefault: 0.8,
    bpm: 124,
    bossBpm: 132,
    lookAhead: 0.12,
  },

  colors: {
    bg: 0x07010f,
    grid: 0xff2bd6,
    cyan: 0x00f0ff,
    magenta: 0xff2bd6,
    yellow: 0xffe14d,
    green: 0x39ff88,
    red: 0xff2244,
    purple: 0x8a2be2,
    blockFace: 0x10061f,
    block: 0x00e5ff,
    blockAlt: 0xb14dff,
  },

  storage: {
    key: 'cruncher.save.v1',
  },
} as const;

export type Config = typeof CONFIG;
