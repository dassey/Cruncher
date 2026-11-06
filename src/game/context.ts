import { Vector3 } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { Emitter } from '../logic/events.js';
import { FlashGovernor } from '../logic/flash-governor.js';
import { LearningEngine } from '../logic/learning.js';
import { defaultProgress, sanitizeProgress, type Progress } from '../logic/progression.js';
import { Rng } from '../logic/rng.js';
import { DEFAULT_ROSTER, type Archetype } from '../logic/skins.js';
import { GameSession } from '../logic/session.js';
import { BrowserKV, readJSON, writeJSON, type KV } from '../logic/storage.js';

/** Things the player can punch. Owners update `pos` each frame. */
export type TargetKind = 'block' | 'orb' | 'bug' | 'button';

export interface Target {
  kind: TargetKind;
  /** Owner-specific id (block id, orb index, bug slot, button index). */
  id: number;
  pos: Vector3;
  radius: number;
  enabled: boolean;
  /** True while this target is actively attacking (bot + hint visuals). */
  threat?: boolean;
  /** Called when punched. dir = hand velocity direction, speed in m/s. */
  onHit: ((t: Target, hand: HandState, speed: number, blast: boolean) => void) | null;
}

export type Handedness = 'left' | 'right';

export interface HandState {
  side: Handedness;
  tracked: boolean;
  isHand: boolean;
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  speed: number;
  cooldown: number;
  /** Trigger/pinch held (backup "poke" input). */
  poke: boolean;
}

export interface GameActions {
  startRun(): void;
  toMenu(): void;
  setScreen(s: Screen): void;
  /** Big centre-screen card (e.g. NEW BUG intros). */
  announce(title: string, sub: string, color: number): void;
  /** Fire-and-forget named SFX (cross-system hook). */
  sfx(name: 'pop' | 'zap'): void;
}

export type Screen = 'title' | 'shop' | 'stats' | 'settings' | 'game' | 'gameover';

interface SaveFile {
  v: 1;
  progress: Progress;
  learning: unknown;
}

function makeHand(side: Handedness): HandState {
  return {
    side,
    tracked: false,
    isHand: false,
    pos: new Vector3(),
    prev: new Vector3(),
    vel: new Vector3(),
    speed: 0,
    cooldown: 0,
    poke: false,
  };
}

/**
 * Runtime singleton shared by all systems: the pure-logic session plus the
 * small amount of frame state (hands, head, punch targets, hit-stop) that
 * several systems need. Keeps systems decoupled from each other.
 */
export class GameContext {
  readonly kv: KV;
  readonly rng: Rng;
  readonly learning: LearningEngine;
  progress: Progress;
  readonly session: GameSession;
  readonly flash = new FlashGovernor(CONFIG.fx.maxFlashesPerSecond);

  screen: Screen = 'title';
  /** Which skin each behaviour wears (swappable at runtime for art testing). */
  roster: Record<Archetype, string> = { ...DEFAULT_ROSTER };
  readonly hands: Record<Handedness, HandState> = { left: makeHand('left'), right: makeHand('right') };
  readonly head = new Vector3(0, CONFIG.grid.defaultHeadY, 0);
  /** Head yaw (radians) captured when the play area was last anchored. */
  anchorYaw = 0;
  readonly anchor = new Vector3(0, CONFIG.grid.defaultHeadY, 0);
  immersive = false;
  /** Headset menu open / page hidden / player pause: freeze the game. */
  paused = false;
  /** Player-requested pause (B/Y, Esc). */
  userPaused = false;

  /** Real-time seconds remaining in a hit-stop freeze. */
  hitStop = 0;
  /** Simulation delta for this frame (0 during hit-stop, scaled by slow-mo). */
  simDt = 0;
  realTime = 0;
  debugOverlay = false;
  /** QA only: freeze popup lifetimes so slow (swiftshader) screenshots catch them. */
  freezePopups = false;
  /** Hand that landed the most recent punch (for haptics). */
  lastHitHand: Handedness = 'right';
  /** Music beat pulse 0..1 (decays), for visuals. */
  beat = 0;
  /** True when the last finished run set a new best score. */
  lastRunNewBest = false;
  /** Actions provided by systems (progression/menu flow) for UI and bot. */
  actions: GameActions = {
    startRun: () => undefined,
    toMenu: () => undefined,
    setScreen: () => undefined,
    announce: () => undefined,
    sfx: () => undefined,
  };

  readonly targets: Target[] = [];
  /** UI-level events (menu presses) for audio/haptics. */
  readonly ui = new Emitter<{ button: { id: string }; screen: { screen: Screen } }>();
  /** Frame counters for perf logging (read by the bot). */
  frameStats = { frames: 0, worstMs: 0, sumMs: 0, over14: 0, jsSumMs: 0, jsWorstMs: 0 };
  /** performance.now() when the first game system ran this frame. */
  frameStart = 0;

  constructor(kv: KV = new BrowserKV(), seed = Date.now() >>> 0) {
    this.kv = kv;
    this.rng = new Rng(seed);
    const save = readJSON(kv, CONFIG.storage.key) as Partial<SaveFile> | undefined;
    this.progress = save ? sanitizeProgress(save.progress) : defaultProgress();
    this.learning = LearningEngine.fromJSON(save?.learning);
    this.session = new GameSession(this.learning, this.rng);
  }

  get settings() {
    return this.progress.settings;
  }

  addTarget(t: Omit<Target, 'pos'> & { pos?: Vector3 }): Target {
    const target: Target = { ...t, pos: t.pos ?? new Vector3() };
    this.targets.push(target);
    return target;
  }

  save(): void {
    const file: SaveFile = { v: 1, progress: this.progress, learning: this.learning.toJSON() };
    writeJSON(this.kv, CONFIG.storage.key, file);
  }

  /** Parent "wipe progress" (settings screen, hold to confirm). */
  resetAll(): void {
    this.kv.remove(CONFIG.storage.key);
    this.progress = defaultProgress();
    this.learning.reset();
  }

  /** World-space point in the play frame: x right, y up, z toward the player. */
  playPoint(out: Vector3, x: number, y: number, z: number): Vector3 {
    const c = Math.cos(this.anchorYaw);
    const s = Math.sin(this.anchorYaw);
    out.set(this.anchor.x + x * c + z * s, this.anchor.y + y, this.anchor.z - x * s + z * c);
    return out;
  }

  /** Re-anchor the play area in front of the current head pose. */
  reanchor(headWorld: Vector3, yaw: number): void {
    this.anchor.copy(headWorld);
    this.anchorYaw = yaw;
  }
}

let instance: GameContext | null = null;
export function setGame(ctx: GameContext): void {
  instance = ctx;
}
export function game(): GameContext {
  if (!instance) throw new Error('GameContext not initialised');
  return instance;
}
