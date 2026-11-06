import { Group, Vector3, createSystem } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type HandState, type Target } from '../game/context.js';
import { gridBottom, gridTop } from '../game/layout.js';
import { ARCHETYPE_TELLS, type Archetype } from '../logic/skins.js';
import { buildSkin, skinName, type CreatureRig } from '../render/skins.js';

type BugType = Exclude<Archetype, 'boss'>;
const BUG_TYPES: BugType[] = ['drifter', 'lunger', 'scrambler', 'sweeper'];
/** Every bug skin is scaled to this height (m). */
const BUG_HEIGHT = 0.17;

type BugState = 'off' | 'enter' | 'wander' | 'telegraph' | 'lunge' | 'knocked' | 'respawn';

interface Bug {
  c: CreatureRig;
  type: BugType;
  state: BugState;
  t: number;
  /** Play-frame local position & waypoint. */
  local: Vector3;
  goal: Vector3;
  vel: Vector3;
  spin: number;
  nextLunge: number;
  nextZap: number;
  target: Target;
}

const B = CONFIG.bugs;

/**
 * ENEMY: the "Bugz" — original meme creatures drifting between you and the grid.
 *  - Wi-Fido wanders and bumps.   - Sockodile telegraphs, then lunges at your face.
 *  - Blendingo re-rolls nearby block numbers.   - Duckuum sweeps rows.
 * Punch any of them to yeet them (they respawn). A lunge that reaches your head costs HP.
 */
export class EnemySystem extends createSystem({}) {
  private bugs: Bug[] = [];
  private root = new Group();
  private head = new Vector3();
  private w = new Vector3();
  private tmp = new Vector3();
  private seenThisRun = new Set<BugType>();

  init(): void {
    const ctx = game();
    BUG_TYPES.forEach((type, i) => {
      const c = this.makeRig(ctx.roster[type]);
      this.root.add(c.root);
      const bug: Bug = {
        c,
        type,
        state: 'off',
        t: 0,
        local: new Vector3(),
        goal: new Vector3(),
        vel: new Vector3(),
        spin: 0,
        nextLunge: 0,
        nextZap: 0,
        target: ctx.addTarget({ kind: 'bug', id: i, radius: B.radius + 0.02, enabled: false, onHit: (_t, hand) => this.punched(bug, hand) }),
      };
      this.bugs.push(bug);
    });
    this.root.name = 'Bugz';
    this.world.createTransformEntity(this.root, { persistent: true });
    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ev.on('playing', () => this.spawnForRound()),
      ev.on('roundClear', () => this.despawnAll()),
      ev.on('gameOver', () => this.despawnAll()),
      ev.on('runStart', () => {
        this.despawnAll();
        this.seenThisRun.clear();
      }),
    );
  }

  private makeRig(skinId: string): CreatureRig {
    const c = buildSkin(skinId, 'wifido');
    c.root.userData.baseScale = BUG_HEIGHT / c.height;
    c.root.scale.setScalar(c.root.userData.baseScale as number);
    c.root.visible = false;
    return c;
  }

  /** Re-skin one behaviour live (art testing). Behaviour state is untouched. */
  setSkin(type: BugType, skinId: string): void {
    const b = this.bugs.find((x) => x.type === type);
    if (!b) return;
    const next = this.makeRig(skinId);
    next.root.visible = b.c.root.visible;
    next.root.position.copy(b.c.root.position);
    this.root.remove(b.c.root);
    this.root.add(next.root);
    b.c = next;
    game().roster[type] = (next.root.userData.skinId as string) ?? skinId;
  }

  /** Which bug types appear by round (introduce one new creature at a time). */
  private typesFor(round: number): BugType[] {
    if (round < 2) return ['drifter'];
    if (round < 3) return ['drifter', 'lunger'];
    if (round < 6) return ['lunger', 'scrambler', 'drifter'];
    return ['lunger', 'scrambler', 'sweeper', 'drifter'];
  }

  private spawnForRound(): void {
    const s = game().session;
    const n = s.params.bugCount;
    const types = this.typesFor(s.round);
    for (const b of this.bugs) b.state = 'off';
    let announced = false;
    for (let i = 0; i < n; i++) {
      const type = types[i % types.length] as BugType;
      if (!announced && !this.seenThisRun.has(type)) {
        this.seenThisRun.add(type);
        game().actions.announce(`NEW BUG: ${skinName(game().roster[type])}`, ARCHETYPE_TELLS[type], CONFIG.colors.green);
        announced = true;
      }
      const bug = this.bugs.find((b) => b.type === type && b.state === 'off');
      if (bug) this.enter(bug, i * 1.5 + 1);
    }
  }

  private despawnAll(): void {
    for (const b of this.bugs) {
      if (b.state !== 'off' && b.state !== 'knocked') b.state = 'off';
      b.target.enabled = false;
    }
  }

  private enter(b: Bug, delay: number): void {
    const ctx = game();
    b.state = 'enter';
    b.t = -delay;
    const side = ctx.rng.chance(0.5) ? -1 : 1;
    b.local.set(side * 0.9, gridTop(game().session.params.rows, ctx.settings.seated) + 0.1, -0.5);
    this.pickGoal(b);
    b.nextLunge = ctx.rng.range(B.lungeEvery[0], B.lungeEvery[1]);
    b.nextZap = ctx.rng.range(3, 5);
    b.spin = 0;
  }

  private pickGoal(b: Bug): void {
    const ctx = game();
    const s = ctx.session;
    const halfW = 0.12 + s.params.cols * 0.065;
    const top = gridTop(s.params.rows, ctx.settings.seated);
    const bot = gridBottom(s.params.rows, ctx.settings.seated);
    // Drift in the slab between the player and the blocks.
    const z = -CONFIG.grid.radius * ctx.rng.range(0.6, 0.85);
    if (b.type === 'sweeper') {
      // Sweeps along a row height.
      b.goal.set(b.local.x > 0 ? -halfW : halfW, ctx.rng.range(bot + 0.05, top - 0.05), z);
    } else {
      b.goal.set(ctx.rng.range(-halfW, halfW), ctx.rng.range(bot + 0.02, top + 0.06), z);
    }
  }

  private punched(b: Bug, hand: HandState): void {
    if (b.state === 'off' || b.state === 'knocked' || b.state === 'respawn') return;
    game().session.bugPunched();
    b.state = 'knocked';
    b.t = 0;
    // Fly off along the punch direction, converted into the play frame.
    const yaw = game().anchorYaw;
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    const vx = hand.vel.x * c + hand.vel.z * s;
    const vz = -hand.vel.x * s + hand.vel.z * c;
    b.vel.set(vx * 1.4, Math.abs(hand.vel.y) + 1.2, Math.min(vz * 1.4, -1.5));
    b.spin = 14;
    b.target.enabled = false;
  }

  update(delta: number, time: number): void {
    const ctx = game();
    const s = ctx.session;
    const dt = ctx.simDt;
    const active = ctx.screen === 'game' && s.phase === 'playing' && !ctx.paused;
    const speed = s.params.bugSpeed * s.bugSpeedScale;
    // Head in play-frame local coordinates.
    this.toLocal(ctx.head, this.head);
    for (const b of this.bugs) {
      const r = b.c.root;
      if (b.state === 'off') {
        r.visible = false;
        b.target.enabled = false;
        continue;
      }
      b.t += dt;
      switch (b.state) {
        case 'enter':
          if (b.t < 0) {
            r.visible = false;
            continue;
          }
          this.moveToward(b, b.goal, speed * 3, dt);
          if (b.local.distanceTo(b.goal) < 0.03) {
            b.state = 'wander';
            b.t = 0;
          }
          break;
        case 'wander':
          this.moveToward(b, b.goal, speed, dt);
          if (b.local.distanceTo(b.goal) < 0.03) this.pickGoal(b);
          b.nextLunge -= dt;
          b.nextZap -= dt;
          if (active && b.type === 'lunger' && b.nextLunge <= 0) {
            b.state = 'telegraph';
            b.t = 0;
          }
          if (active && b.type === 'scrambler' && b.nextZap <= 0) {
            b.nextZap = ctx.rng.range(3.5, 5.5);
            this.corruptNearest(b);
          }
          break;
        case 'telegraph':
          // Shake, open mouth: a clear 1.1 s "it's coming" tell.
          if (b.t >= B.lungeTelegraph) {
            b.state = 'lunge';
            b.t = 0;
          }
          break;
        case 'lunge': {
          // Aim at the face but stop short; contact counts within headRadius.
          this.tmp.copy(this.head);
          this.moveToward(b, this.tmp, B.lungeSpeed, dt);
          if (b.local.distanceTo(this.head) < CONFIG.player.headRadius + B.radius) {
            s.bugContact();
            b.state = 'knocked';
            b.t = 0;
            b.vel.set(ctx.rng.range(-0.5, 0.5), 0.6, -1.4);
            b.spin = 6;
          } else if (b.t > 2.5) {
            b.state = 'wander';
            b.nextLunge = ctx.rng.range(B.lungeEvery[0], B.lungeEvery[1]);
          }
          break;
        }
        case 'knocked':
          b.vel.y -= 3.5 * dt;
          b.local.addScaledVector(b.vel, dt);
          if (b.t > 1.2) {
            b.state = active ? 'respawn' : 'off';
            b.t = 0;
          }
          break;
        case 'respawn':
          r.visible = false;
          b.target.enabled = false;
          if (b.t >= B.respawnSeconds && active) this.enter(b, 0);
          if (!active) b.state = 'off';
          continue;
      }
      // Pose & animation.
      ctx.playPoint(this.w, b.local.x, b.local.y, b.local.z);
      if (b.state === 'telegraph') {
        this.w.x += Math.sin(time * 60) * 0.006;
        this.w.y += Math.sin(time * 47) * 0.004;
      }
      r.visible = true;
      r.position.copy(this.w);
      r.lookAt(ctx.head);
      if (b.spin > 0) {
        r.rotateZ(time * b.spin);
        r.rotateX(time * b.spin * 0.7);
      }
      const bob = Math.sin(time * 5 + b.c.root.id);
      for (const leg of b.c.legs) leg.rotation.x = bob * 0.5;
      if (b.c.spinner) b.c.spinner.rotation.y += delta * (b.state === 'wander' ? 6 : 20);
      if (b.c.jaw) {
        const open = b.state === 'telegraph' || b.state === 'lunge' ? 0.6 + 0.2 * Math.sin(time * 18) : 0.1 + 0.08 * Math.sin(time * 6);
        b.c.jaw.rotation.x = open;
      }
      for (const eye of b.c.eyes) {
        const pupil = eye.children[1];
        if (pupil) pupil.position.x = Math.sin(time * 9 + eye.id) * 0.008;
      }
      const big = b.state === 'telegraph' ? 1.15 + 0.05 * Math.sin(time * 30) : 1;
      r.scale.setScalar(big * ((r.userData.baseScale as number) ?? 1));
      b.target.pos.copy(this.w);
      b.target.enabled = active && b.state !== 'knocked' && b.state !== 'enter';
      b.target.threat = b.state === 'telegraph' || b.state === 'lunge';
    }
  }

  private moveToward(b: Bug, goal: Vector3, speed: number, dt: number): void {
    this.tmp.subVectors(goal, b.local);
    const d = this.tmp.length();
    if (d < 1e-5) return;
    const step = Math.min(d, speed * dt);
    b.local.addScaledVector(this.tmp, step / d);
  }

  private corruptNearest(b: Bug): void {
    const ctx = game();
    let best = -1;
    let bestD = 0.25;
    for (const t of ctx.targets) {
      if (t.kind !== 'block' || !t.enabled) continue;
      const d = t.pos.distanceTo(b.c.root.position);
      if (d < bestD) {
        bestD = d;
        best = t.id;
      }
    }
    if (best >= 0) ctx.session.corruptBlock(best);
  }

  private toLocal(world: Vector3, out: Vector3): void {
    const ctx = game();
    const dx = world.x - ctx.anchor.x;
    const dz = world.z - ctx.anchor.z;
    const c = Math.cos(ctx.anchorYaw);
    const s = Math.sin(ctx.anchorYaw);
    out.set(dx * c - dz * s, world.y - ctx.anchor.y, dx * s + dz * c);
  }
}
