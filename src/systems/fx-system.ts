import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type Handedness } from '../game/context.js';
import { createParticleMaterial, createVignetteMaterial } from '../render/shaders.js';

const MAXP = CONFIG.fx.maxParticles;
const RINGS = 4;

/**
 * FX: pooled particle bursts (1 draw call), shockwave rings, a head-locked edge
 * vignette for damage/slow-mo (never full-field, rate-limited by the flash
 * governor), hit-stop, and controller haptics.
 */
export class FXSystem extends createSystem({}) {
  private mesh!: InstancedMesh;
  private aLife!: InstancedBufferAttribute;
  private pos = new Float32Array(MAXP * 3);
  private vel = new Float32Array(MAXP * 3);
  private life = new Float32Array(MAXP);
  private maxLife = new Float32Array(MAXP).fill(1);
  private size = new Float32Array(MAXP);
  private cursor = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private sc = new Vector3();
  private c = new Color();
  private rings: Array<{ mesh: Mesh; mat: MeshBasicMaterial; t: number }> = [];
  private vignette!: Mesh;
  private vMat!: ReturnType<typeof createVignetteMaterial>;
  private vAmount = 0;
  private vGlitch = 0;
  private chain: Array<{ at: number; x: number; y: number; z: number; color: number }> = [];
  private chainT = 0;

  init(): void {
    const ctx = game();
    const geo = new PlaneGeometry(1, 1);
    this.aLife = new InstancedBufferAttribute(new Float32Array(MAXP), 1);
    this.aLife.setUsage(DynamicDrawUsage);
    geo.setAttribute('aLife', this.aLife);
    this.mesh = new InstancedMesh(geo, createParticleMaterial(), MAXP);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    this.mesh.name = 'Particles';
    for (let i = 0; i < MAXP; i++) {
      this.mesh.setColorAt(i, this.c.setHex(0xffffff));
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.world.createTransformEntity(this.mesh, { persistent: true });

    const ringGeo = new RingGeometry(0.42, 0.5, 40);
    for (let i = 0; i < RINGS; i++) {
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 31;
      this.world.createTransformEntity(mesh, { persistent: true });
      this.rings.push({ mesh, mat, t: 1 });
    }

    // Head-locked vignette quad, big enough to frame the view at 0.3 m.
    this.vMat = createVignetteMaterial();
    this.vignette = new Mesh(new PlaneGeometry(1.4, 1.1), this.vMat);
    this.vignette.position.set(0, 0, -0.3);
    this.vignette.renderOrder = 100;
    this.vignette.frustumCulled = false;
    this.vignette.visible = false;
    this.world.createTransformEntity(this.vignette, { parent: this.world.cameraEntity, persistent: true });

    const ev = ctx.session.events;
    const reduced = () => ctx.settings.reducedFx;
    this.cleanupFuncs.push(
      ev.on('hitCorrect', (e) => {
        const t = ctx.targets.find((x) => x.kind === 'block' && x.id === e.block.id);
        const big = e.combo >= 6;
        if (t) {
          const color = e.block.golden ? 0xffc83d : (e.block.col + e.block.row) % 2 === 0 ? CONFIG.colors.cyan : CONFIG.colors.blockAlt;
          if (e.block.golden) this.burst(t.pos, 0xffffff, reduced() ? 6 : 30, 2.2);
          this.burst(t.pos, color, reduced() ? CONFIG.fx.particlesPerHitReduced : CONFIG.fx.particlesPerHit + Math.min(20, e.combo * 2), 1.4 + (big ? 0.6 : 0));
          this.burst(t.pos, 0xffffff, reduced() ? 2 : 6, 0.8);
          this.ring(t.pos, color, big ? 0.5 : 0.32);
        }
        ctx.hitStop = big ? CONFIG.hit.hitStopBig : CONFIG.hit.hitStop;
        this.haptic(ctx.lastHitHand, big ? 0.9 : 0.6, big ? 70 : 45);
      }),
      ev.on('hitWrong', (e) => {
        const t = ctx.targets.find((x) => x.kind === 'block' && x.id === e.block.id);
        if (t) this.burst(t.pos, CONFIG.colors.red, reduced() ? 4 : 10, 0.6);
        this.haptic(ctx.lastHitHand, 1, 140);
        this.edge(CONFIG.colors.red, 0.6, 0.7);
      }),
      ev.on('damage', (e) => {
        if (e.source === 'wrong') return;
        this.haptic('left', 1, 200);
        this.haptic('right', 1, 200);
        this.edge(CONFIG.colors.red, 1, 1);
      }),
      ev.on('bugPunched', () => {
        const h = ctx.hands[ctx.lastHitHand];
        this.burst(h.pos, CONFIG.colors.green, reduced() ? 6 : 18, 1.6);
        this.ring(h.pos, CONFIG.colors.green, 0.4);
        ctx.hitStop = CONFIG.hit.hitStopBig;
        this.haptic(ctx.lastHitHand, 0.9, 80);
      }),
      ev.on('bossHit', () => {
        const h = ctx.hands[ctx.lastHitHand];
        this.burst(h.pos, CONFIG.colors.yellow, reduced() ? 10 : 40, 2.0);
        this.ring(h.pos, CONFIG.colors.yellow, 0.6);
        ctx.hitStop = CONFIG.hit.hitStopBig * 1.6;
        this.haptic(ctx.lastHitHand, 1, 120);
      }),
      ev.on('bossWrong', () => {
        this.haptic(ctx.lastHitHand, 1, 160);
        this.edge(CONFIG.colors.red, 0.6, 0.7);
      }),
      ev.on('roundClear', (e) => {
        ctx.playPoint(this.v, 0, -CONFIG.grid.belowHead, -CONFIG.grid.radius);
        this.burst(this.v, CONFIG.colors.yellow, reduced() ? 12 : 60, 2.4);
        this.ring(this.v, CONFIG.colors.magenta, 1.2);
        // "SERVER WIPED": every leftover block detonates in a staggered chain.
        if (!e.isBoss) {
          let k = 0;
          for (const t of ctx.targets) {
            if (t.kind !== 'block') continue;
            const b = ctx.session.blocks[t.id];
            if (!b || !b.alive) continue;
            this.chain.push({ at: 0.08 + k * 0.045, x: t.pos.x, y: t.pos.y, z: t.pos.z, color: (b.col + b.row) % 2 === 0 ? CONFIG.colors.cyan : CONFIG.colors.blockAlt });
            k++;
          }
          this.chainT = 0;
        }
        if (e.perfect) ctx.actions.announce('PERFECT ROUND', 'ZERO MISSES · +500', CONFIG.colors.yellow);
      }),
    );
  }

  /** Spawn a particle burst. Allocation-free (ring buffer). */
  burst(at: Vector3, color: number, count: number, speed: number): void {
    const rng = game().rng;
    this.c.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAXP;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      // Random direction on a sphere, biased upward.
      const u = rng.next() * 2 - 1;
      const th = rng.next() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + rng.next() * 0.8);
      this.vel[i * 3] = r * Math.cos(th) * sp;
      this.vel[i * 3 + 1] = Math.abs(u) * sp * 0.8 + 0.3;
      this.vel[i * 3 + 2] = r * Math.sin(th) * sp;
      const l = 0.35 + rng.next() * 0.45;
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = 0.011 + rng.next() * 0.018;
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  ring(at: Vector3, color: number, size: number): void {
    const r = this.rings.find((x) => x.t >= 1) ?? this.rings[0];
    if (!r) return;
    r.t = 0;
    r.mesh.position.copy(at);
    r.mesh.lookAt(game().head);
    r.mesh.scale.setScalar(0.01);
    r.mesh.userData.size = size;
    r.mat.color.setHex(color);
    r.mesh.visible = true;
  }

  /** Edge-only vignette pulse (rate-limited, capped opacity). */
  edge(color: number, amount: number, glitch: number): void {
    const ctx = game();
    if (!ctx.flash.request(ctx.realTime)) return;
    const reduced = ctx.settings.reducedFx;
    this.vMat.uniforms.uColor!.value.setHex(color);
    this.vMat.uniforms.uSeed!.value = ctx.rng.next() * 100;
    this.vAmount = Math.min(CONFIG.fx.vignetteMaxOpacity, amount * CONFIG.fx.vignetteMaxOpacity) * (reduced ? 0.6 : 1);
    this.vGlitch = reduced ? 0 : glitch;
  }

  haptic(side: Handedness, intensity: number, ms: number): void {
    const pad = this.input.xr.gamepads[side];
    const act = pad?.gamepad?.hapticActuators?.[0] as { pulse?: (v: number, d: number) => Promise<boolean> } | undefined;
    if (act?.pulse) void act.pulse(intensity, ms).catch(() => undefined);
  }

  update(delta: number): void {
    const ctx = game();
    const dt = Math.min(delta, 0.05);
    // Particles keep moving through hit-stop (only gameplay freezes).
    for (let i = 0; i < MAXP; i++) {
      const l = this.life[i]!;
      if (l <= 0) {
        if (this.aLife.getX(i) !== 0) {
          this.aLife.setX(i, 0);
          this.m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this.m);
        }
        continue;
      }
      const nl = l - dt;
      this.life[i] = nl;
      const k = i * 3;
      this.vel[k + 1]! -= 2.2 * dt;
      this.vel[k]! *= 0.96;
      this.vel[k + 2]! *= 0.96;
      this.pos[k]! += this.vel[k]! * dt;
      this.pos[k + 1]! += this.vel[k + 1]! * dt;
      this.pos[k + 2]! += this.vel[k + 2]! * dt;
      const f = Math.max(0, nl / this.maxLife[i]!);
      this.v.set(this.pos[k]!, this.pos[k + 1]!, this.pos[k + 2]!);
      this.sc.setScalar(this.size[i]! * (0.4 + f));
      this.m.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
      this.aLife.setX(i, f);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aLife.needsUpdate = true;

    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt * 3);
      const size = (r.mesh.userData.size as number) ?? 0.3;
      r.mesh.scale.setScalar(0.02 + r.t * size);
      r.mat.opacity = (1 - r.t) * 0.9;
      if (r.t >= 1) r.mesh.visible = false;
    }

    // Chain detonations after a clear.
    if (this.chain.length > 0) {
      this.chainT += dt;
      while (this.chain.length > 0 && (this.chain[0] as { at: number }).at <= this.chainT) {
        const c = this.chain.shift() as { x: number; y: number; z: number; color: number };
        this.v.set(c.x, c.y, c.z);
        this.burst(this.v, c.color, ctx.settings.reducedFx ? 3 : 9, 1.1);
        if ((this.chain.length & 1) === 0) ctx.actions.sfx('pop');
      }
    }

    // Vignette: damage pulse decays; slow-mo holds a calm cyan frame.
    const slow = ctx.session.slowmoTime > 0;
    this.vAmount = Math.max(0, this.vAmount - dt * 1.4);
    this.vGlitch = Math.max(0, this.vGlitch - dt * 3);
    let amount = this.vAmount;
    if (slow && amount < 0.22) {
      amount = 0.22;
      this.vMat.uniforms.uColor!.value.setHex(CONFIG.colors.cyan);
    }
    this.vMat.uniforms.uAmount!.value = amount;
    this.vMat.uniforms.uGlitch!.value = this.vGlitch;
    this.vignette.visible = amount > 0.001;
  }
}
