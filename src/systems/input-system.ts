import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, DynamicDrawUsage, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, createSystem, InputComponent, Vector3, Raycaster, Vector2, VisibilityState } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type HandState, type Target } from '../game/context.js';
import { skinDef } from '../logic/progression.js';
import { buildGlove, tintGlove, type Glove } from '../render/gloves.js';

const H = CONFIG.hit;
const BL = CONFIG.blaster;
const TRAIL = 14;

/**
 * INPUT: tracks both hands (controller grip or hand-tracking wrist), computes
 * velocity, resolves punches as swept spheres against every registered target,
 * handles desktop mouse clicks, slow-mo gestures and debug keys. Renders gloves.
 */
export class InputSystem extends createSystem({}) {
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private seg = new Vector3();
  private dir = new Vector3();
  private fwd = new Vector3();
  private gloves: Record<'left' | 'right', Glove> | null = null;
  private skinKey = '';
  private desktopHand!: HandState;
  private ray = new Raycaster();
  private ndc = new Vector2();
  private pendingClick = false;
  // Blaster (point & shoot): per-hand laser, reticle, aim target, queued shot.
  private beams: Record<'left' | 'right', { line: Mesh; glow: Mesh; mat: MeshBasicMaterial; glowMat: MeshBasicMaterial; reticle: Mesh; flash: number }> | null = null;
  private beamQ = new Quaternion();
  private zAxis = new Vector3(0, 0, 1);
  private aim: Record<'left' | 'right', Target | null> = { left: null, right: null };
  private aimPoint: Record<'left' | 'right', Vector3> = { left: new Vector3(), right: new Vector3() };
  private fireQueued = { left: false, right: false };
  private blastCd = { left: 0, right: 0 };
  private rayO = new Vector3();
  private rayD = new Vector3();
  private hookedSession: XRSession | null = null;
  private trails: Record<'left' | 'right', { line: Line; pos: Float32Array; attr: BufferAttribute; mat: LineBasicMaterial }> | null = null;

  init(): void {
    const ctx = game();
    this.desktopHand = { ...ctx.hands.right, side: 'right', tracked: true, pos: new Vector3(), prev: new Vector3(), vel: new Vector3(0, 0, -3), speed: 3 };
    const left = buildGlove('left');
    const right = buildGlove('right');
    this.world.createTransformEntity(left.root, { parent: this.world.playerSpaceEntities.gripSpaces.left, persistent: true });
    this.world.createTransformEntity(right.root, { parent: this.world.playerSpaceEntities.gripSpaces.right, persistent: true });
    this.gloves = { left, right };
    left.root.visible = right.root.visible = false;
    // Punch trails: a 14-point additive ribbon per fist, world space.
    const mkTrail = () => {
      const pos = new Float32Array(TRAIL * 3);
      const geo = new BufferGeometry();
      const attr = new BufferAttribute(pos, 3);
      attr.setUsage(DynamicDrawUsage);
      geo.setAttribute('position', attr);
      const mat = new LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      const line = new Line(geo, mat);
      line.frustumCulled = false;
      line.renderOrder = 25;
      this.world.createTransformEntity(line, { persistent: true });
      return { line, pos, attr, mat };
    };
    this.trails = { left: mkTrail(), right: mkTrail() };
    const ringGeo = new RingGeometry(0.008, 0.014, 20);
    const beamGeo = new BoxGeometry(1, 1, 1);
    beamGeo.translate(0, 0, 0.5); // origin at the start, extends along +Z
    const mkBeam = () => {
      const mat = new MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      const glowMat = new MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      const line = new Mesh(beamGeo, mat);
      const glow = new Mesh(beamGeo, glowMat);
      line.frustumCulled = glow.frustumCulled = false;
      line.renderOrder = glow.renderOrder = 26;
      line.visible = glow.visible = false;
      const reticle = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      reticle.renderOrder = 27;
      reticle.visible = false;
      this.world.createTransformEntity(line, { persistent: true });
      this.world.createTransformEntity(glow, { persistent: true });
      this.world.createTransformEntity(reticle, { persistent: true });
      return { line, glow, mat, glowMat, reticle, flash: 0 };
    };
    this.beams = { left: mkBeam(), right: mkBeam() };
    // Trigger (controllers) and pinch (hands) both arrive as XR 'selectstart'.
    const onSelect = (e: XRInputSourceEvent) => {
      const side = e.inputSource.handedness;
      if (side === 'left' || side === 'right') this.fireQueued[side] = true;
    };
    const hook = () => {
      const session = this.world.session ?? null;
      if (session === this.hookedSession) return;
      this.hookedSession?.removeEventListener('selectstart', onSelect);
      this.hookedSession = session;
      session?.addEventListener('selectstart', onSelect);
    };
    this.cleanupFuncs.push(this.visibilityState.subscribe(hook), () => this.hookedSession?.removeEventListener('selectstart', onSelect));

    const canvas = this.renderer.domElement;
    const onDown = (e: PointerEvent) => {
      if (ctx.immersive) return;
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pendingClick = true;
    };
    canvas.addEventListener('pointerdown', onDown);
    this.cleanupFuncs.push(() => canvas.removeEventListener('pointerdown', onDown));
  }

  update(delta: number, time: number): void {
    const ctx = game();
    ctx.frameStart = performance.now();
    ctx.realTime = time;
    const vis = this.visibilityState.peek();
    ctx.immersive = vis !== VisibilityState.NonImmersive;
    const inRun = ctx.screen === 'game' && (ctx.session.phase === 'intro' || ctx.session.phase === 'playing');
    const padL = this.input.xr.gamepads.left;
    const padR = this.input.xr.gamepads.right;
    if (inRun && (padL?.getButtonDown(InputComponent.Y_Button) || padR?.getButtonDown(InputComponent.B_Button) || this.input.keyboard.getKeyDown('Escape'))) {
      ctx.userPaused = !ctx.userPaused;
    }
    if (!inRun) ctx.userPaused = false;
    ctx.paused = ctx.userPaused || vis === VisibilityState.VisibleBlurred || vis === VisibilityState.Hidden;

    // Hit-stop and slow-mo produce the simulation delta for everyone downstream.
    if (ctx.paused) {
      ctx.simDt = 0;
    } else if (ctx.hitStop > 0) {
      ctx.hitStop = Math.max(0, ctx.hitStop - delta);
      ctx.simDt = 0;
    } else {
      ctx.simDt = Math.min(delta, 0.05) * ctx.session.timeScale;
    }

    this.camera.getWorldPosition(ctx.head);
    this.camera.getWorldDirection(this.fwd);

    this.updateHand(ctx.hands.left, 'left', delta);
    this.updateHand(ctx.hands.right, 'right', delta);
    this.updateGloves(time);

    // Slow-mo: clap (hands meet fast) or A/X button.
    const l = ctx.hands.left;
    const r = ctx.hands.right;
    if (l.tracked && r.tracked && l.pos.distanceTo(r.pos) < CONFIG.slowmo.clapDistance && l.speed + r.speed > CONFIG.slowmo.clapSpeed * 2) {
      ctx.session.activateSlowmo();
    }
    const gl = this.input.xr.gamepads.left;
    const gr = this.input.xr.gamepads.right;
    if (gl?.getButtonDown(InputComponent.X_Button) || gr?.getButtonDown(InputComponent.A_Button)) ctx.session.activateSlowmo();
    // Debug overlay: both thumbsticks clicked, or the ` key.
    if ((gl?.getButtonPressed(InputComponent.Thumbstick) && gr?.getButtonDown(InputComponent.Thumbstick)) || this.input.keyboard.getKeyDown('Backquote')) {
      ctx.debugOverlay = !ctx.debugOverlay;
    }
    if (this.input.keyboard.getKeyDown('Space')) ctx.session.activateSlowmo();

    if (ctx.settings.aim !== 'blast') {
      this.resolvePunches(ctx.hands.left);
      this.resolvePunches(ctx.hands.right);
    }
    this.updateBlaster('left', delta);
    this.updateBlaster('right', delta);
    if (this.pendingClick) {
      this.pendingClick = false;
      this.resolveClick();
    }
  }

  private updateHand(h: HandState, side: 'left' | 'right', delta: number): void {
    const adapter = this.input.xr.visualAdapters[side].peek();
    const tracked = !!adapter?.connected && game().immersive;
    h.isHand = !!adapter?.inputSource?.hand;
    const grip = this.player.gripSpaces[side];
    grip.getWorldPosition(this.tmp);
    // Knuckles, not wrist: offset along the grip's forward (-Z) axis.
    grip.getWorldDirection(this.tmp2);
    this.tmp.addScaledVector(this.tmp2, -H.knuckleOffset);
    if (!h.tracked && tracked) h.prev.copy(this.tmp);
    else h.prev.copy(h.pos);
    h.pos.copy(this.tmp);
    h.tracked = tracked;
    if (delta > 0) {
      this.tmp2.subVectors(h.pos, h.prev).divideScalar(Math.max(delta, 1 / 120));
      h.vel.lerp(this.tmp2, 0.6);
    }
    h.speed = h.vel.length();
    h.cooldown = Math.max(0, h.cooldown - delta);
    const pad = this.input.xr.gamepads[side];
    // Trigger is the blaster; squeeze (or trigger in punch-only mode) is the touch "poke".
    const punchOnly = game().settings.aim === 'punch';
    h.poke = !!pad && (pad.getButtonDown(InputComponent.Squeeze) || (punchOnly && pad.getButtonDown(InputComponent.Trigger)));
  }

  private updateGloves(time: number): void {
    const ctx = game();
    if (!this.gloves) return;
    const skin = skinDef(ctx.progress.skin);
    const key = skin.id;
    if (key !== this.skinKey) {
      this.skinKey = key;
      tintGlove(this.gloves.left, skin.color, skin.accent);
      tintGlove(this.gloves.right, skin.accent === 0xffffff ? skin.color : skin.color, skin.accent);
    }
    for (const side of ['left', 'right'] as const) {
      const g = this.gloves[side];
      const h = ctx.hands[side];
      g.root.visible = h.tracked;
      const tr = this.trails?.[side];
      if (tr) {
        // Shift history and push the newest fist position (allocation-free).
        if (!h.tracked || tr.pos[0] === 0) {
          for (let i = 0; i < TRAIL; i++) {
            tr.pos[i * 3] = h.pos.x;
            tr.pos[i * 3 + 1] = h.pos.y;
            tr.pos[i * 3 + 2] = h.pos.z;
          }
        }
        tr.pos.copyWithin(3, 0, (TRAIL - 1) * 3);
        tr.pos[0] = h.pos.x;
        tr.pos[1] = h.pos.y;
        tr.pos[2] = h.pos.z;
        tr.attr.needsUpdate = true;
        const k = Math.max(0, Math.min(1, (h.speed - 0.8) / 2.5));
        tr.mat.opacity = h.tracked ? k * 0.9 : 0;
        tr.mat.color.copy(g.haloMat.color);
        tr.line.visible = h.tracked && k > 0.01;
      }
      const s = ctx.session.fistScale;
      g.root.scale.setScalar(s);
      // Halo brightens with speed so a "charged" punch reads; combo sets the fists on fire.
      const mult = ctx.screen === 'game' ? ctx.session.multiplier : 1;
      const fire = Math.max(0, mult - 1) / 4;
      g.haloMat.opacity = Math.min(1, 0.25 + h.speed * 0.25 + fire * 0.5);
      g.halo.scale.setScalar(0.22 * (1 + fire * 0.9 + 0.08 * Math.sin(time * 14) * fire));
      if (h.tracked) g.halo.lookAt(ctx.head);
      if (fire > 0 && skin.id !== 'rgb') g.haloMat.color.setHex(mult >= 4 ? 0xffe14d : mult >= 3 ? 0xff7a1f : skin.color);
      else if (skin.id !== 'rgb') g.haloMat.color.setHex(skin.color);
      if (skin.id === 'rgb') {
        const hue = (time * 0.15 + (side === 'left' ? 0 : 0.5)) % 1;
        g.body.color.setHSL(hue, 1, 0.55);
        g.body.emissive.setHSL(hue, 1, 0.2);
        g.haloMat.color.setHSL(hue, 1, 0.6);
      }
    }
  }

  private resolvePunches(h: HandState): void {
    if (!h.tracked || h.cooldown > 0) return;
    const ctx = game();
    const fast = h.speed >= H.minPunchSpeed;
    if (!fast && !h.poke) return;
    const radius = H.handRadius * ctx.session.fistScale;
    let best: Target | null = null;
    let bestScore = Infinity;
    this.seg.subVectors(h.pos, h.prev);
    const segLen2 = this.seg.lengthSq();
    for (const t of ctx.targets) {
      if (!t.enabled) continue;
      const r = t.radius + radius;
      // Closest approach of segment prev→pos to the target centre.
      let u = 1;
      if (segLen2 > 1e-8) {
        this.tmp.subVectors(t.pos, h.prev);
        u = Math.max(0, Math.min(1, this.tmp.dot(this.seg) / segLen2));
      }
      this.tmp2.copy(h.prev).addScaledVector(this.seg, u);
      const d2 = this.tmp2.distanceToSquared(t.pos);
      if (d2 > r * r) continue;
      // Must be moving INTO the target (outward from the head), not retracting or sweeping down.
      if (!h.poke) {
        this.dir.subVectors(t.pos, ctx.head);
        this.dir.y *= H.approachVertical;
        this.dir.normalize();
        if (h.vel.dot(this.dir) < H.minPunchSpeed * H.approachFactor) continue;
      }
      // When a swing passes several targets, the one it went most squarely
      // through wins (grazing a neighbour's edge shouldn't count).
      const score = Math.sqrt(d2) / r + u * 0.15;
      if (score < bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (best && best.onHit) {
      h.cooldown = H.handCooldown;
      ctx.lastHitHand = h.side;
      best.onHit(best, h, Math.max(h.speed, 1), false);
    }
  }

  /** Point & shoot: aim the controller/hand ray, pull trigger or pinch to zap. */
  private updateBlaster(side: 'left' | 'right', delta: number): void {
    const ctx = game();
    const beam = this.beams?.[side];
    const h = ctx.hands[side];
    const queued = this.fireQueued[side];
    this.fireQueued[side] = false;
    this.blastCd[side] = Math.max(0, this.blastCd[side] - delta);
    if (!beam) return;
    const enabled = h.tracked && ctx.settings.aim !== 'punch' && !ctx.paused;
    if (!enabled) {
      beam.line.visible = false;
      beam.glow.visible = false;
      beam.reticle.visible = false;
      this.aim[side] = null;
      return;
    }
    const ray = this.player.raySpaces[side];
    ray.getWorldPosition(this.rayO);
    ray.getWorldDirection(this.rayD).negate(); // ray space points down -Z
    let best: Target | null = null;
    let bestT: number = BL.range;
    for (const t of ctx.targets) {
      if (!t.enabled) continue;
      this.tmp.subVectors(t.pos, this.rayO);
      const along = this.tmp.dot(this.rayD);
      if (along <= 0.05 || along >= bestT) continue;
      const r = t.radius * BL.aimAssist;
      if (this.tmp.lengthSq() - along * along <= r * r) {
        best = t;
        bestT = along;
      }
    }
    this.aim[side] = best;
    const len = best ? bestT : 0.35;
    const end = this.aimPoint[side].copy(this.rayO).addScaledVector(this.rayD, len);
    // Solid beam (core + soft glow): GL lines are 1 px and vanish in a headset.
    beam.flash = Math.max(0, beam.flash - delta * 6);
    this.beamQ.setFromUnitVectors(this.zAxis, this.rayD);
    const w = 0.004 + beam.flash * 0.006;
    for (const [m, width] of [[beam.line, w], [beam.glow, w * 4]] as const) {
      m.position.copy(this.rayO);
      m.quaternion.copy(this.beamQ);
      m.scale.set(width, width, len);
      m.visible = true;
    }
    const color = beam.flash > 0.3 ? 0xffffff : best ? 0xffe14d : 0x00f0ff;
    beam.mat.color.setHex(color);
    beam.glowMat.color.setHex(color);
    beam.mat.opacity = (best ? 0.85 : 0.35) + beam.flash * 0.15;
    beam.glowMat.opacity = best ? 0.22 : 0.08;
    beam.reticle.visible = !!best;
    if (best) {
      beam.reticle.position.copy(end).addScaledVector(this.rayD, -0.02);
      beam.reticle.lookAt(ctx.head);
      beam.reticle.scale.setScalar(1 + beam.flash * 1.5);
    }
    if (queued && this.blastCd[side] <= 0) {
      this.blastCd[side] = BL.cooldown;
      beam.flash = 1;
      ctx.actions.sfx('zap');
      const act = this.input.xr.gamepads[side]?.gamepad?.hapticActuators?.[0] as { pulse?: (v: number, d: number) => Promise<boolean> } | undefined;
      if (act?.pulse) void act.pulse(0.35, 25).catch(() => undefined);
      if (best && best.onHit) {
        // Virtual "hand" moving along the ray so knock-backs fly the right way.
        this.desktopHand.pos.copy(end);
        this.desktopHand.vel.copy(this.rayD).multiplyScalar(3);
        ctx.lastHitHand = side;
        best.onHit(best, this.desktopHand, 3, true);
      }
    }
  }

  private resolveClick(): void {
    const ctx = game();
    this.ray.setFromCamera(this.ndc, this.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    let best: Target | null = null;
    let bestDist = Infinity;
    for (const t of ctx.targets) {
      if (!t.enabled) continue;
      this.tmp.subVectors(t.pos, o);
      const along = this.tmp.dot(d);
      if (along < 0) continue;
      const perp2 = this.tmp.lengthSq() - along * along;
      const r = t.radius * 1.1;
      if (perp2 <= r * r && along < bestDist) {
        best = t;
        bestDist = along;
      }
    }
    if (best && best.onHit) {
      this.desktopHand.pos.copy(best.pos);
      this.desktopHand.vel.copy(d).multiplyScalar(3);
      ctx.lastHitHand = 'right';
      best.onHit(best, this.desktopHand, 3, true);
    }
  }
}
