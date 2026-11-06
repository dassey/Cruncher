import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, Vector3, createSystem } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type Target } from '../game/context.js';
import { drawBossScreen } from '../render/creatures.js';
import { buildSkin, skinName, type CreatureRig } from '../render/skins.js';
import { haloTexture } from '../render/gloves.js';
import { CanvasPanel, FONT_DISPLAY, neonText } from '../render/text.js';

interface Orb {
  root: Group;
  core: MeshBasicMaterial;
  haloMat: MeshBasicMaterial;
  label: CanvasPanel;
  target: Target;
  /** 0 = flying out, 1 = holding. */
  t: number;
  from: Vector3;
  to: Vector3;
  value: number;
  alive: boolean;
  burst: number;
}

const BC = CONFIG.boss;
/** Every boss skin is scaled to this height (m). */
const BOSS_HEIGHT = 1.75;

/**
 * BOSS (every 5th round): Calcu-Llama yells a fact on its calculator screen and
 * spits answer orbs that float into reach. Punch the right one.
 */
export class BossSystem extends createSystem({}) {
  private boss!: CreatureRig;
  private screen!: CanvasPanel;
  private hpPanel!: CanvasPanel;
  private skinId = '';
  private orbs: Orb[] = [];
  private root = new Group();
  private p = new Vector3();
  private flinch = 0;
  private shout = 0;
  private hp: number = BC.hp;

  init(): void {
    const ctx = game();
    this.screen = new CanvasPanel(512, 192, 0.72);
    this.hpPanel = new CanvasPanel(512, 64, 0.8);
    this.setSkin(ctx.roster.boss);
    const sphere = new SphereGeometry(0.5, 20, 14);
    const haloGeo = new PlaneGeometry(1, 1);
    for (let i = 0; i < BC.orbCount; i++) {
      const root = new Group();
      const core = new MeshBasicMaterial({ color: 0x2a0a4a, transparent: true, opacity: 0.85, toneMapped: false });
      const ball = new Mesh(sphere, core);
      ball.scale.setScalar(BC.orbRadius * 2);
      root.add(ball);
      const haloMat = new MeshBasicMaterial({ map: haloTexture(), color: CONFIG.colors.cyan, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      const halo = new Mesh(haloGeo, haloMat);
      halo.scale.setScalar(BC.orbRadius * 4.5);
      halo.name = 'halo';
      root.add(halo);
      const label = new CanvasPanel(256, 256, BC.orbRadius * 2.2, { renderOrder: 15, depthTest: false });
      label.mesh.position.z = BC.orbRadius * 0.6;
      root.add(label.mesh);
      root.visible = false;
      this.root.add(root);
      const orb: Orb = {
        root,
        core,
        haloMat,
        label,
        t: 0,
        from: new Vector3(),
        to: new Vector3(),
        value: 0,
        alive: false,
        burst: 0,
        target: ctx.addTarget({ kind: 'orb', id: i, radius: BC.orbRadius * 1.3, enabled: false, onHit: (t) => ctx.session.hitOrb(t.id) }),
      };
      this.orbs.push(orb);
    }
    this.root.name = 'BossArena';
    this.root.visible = false;
    this.world.createTransformEntity(this.root, { persistent: true });

    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ev.on('roundStart', (e) => {
        if (!e.isBoss) return;
        this.hp = BC.hp;
        drawBossScreen(this.screen, 'HELLO', 'PREPARE TO GET CALCULATED');
        this.drawHp();
        this.hideOrbs();
      }),
      ev.on('bossVolley', (e) => {
        this.shout = 1;
        drawBossScreen(this.screen, `${e.a} × ${e.b}!`, 'PUNCH THE ANSWER');
        this.launch(e.choices, e.correctIndex);
      }),
      ev.on('bossHit', (e) => {
        this.hp = e.bossHp;
        this.flinch = 1;
        this.drawHp();
        this.popAll(true);
        drawBossScreen(this.screen, e.bossHp > 0 ? 'OOF' : 'ERROR', e.receipt);
      }),
      ev.on('bossWrong', (e) => {
        this.popAll(false);
        drawBossScreen(this.screen, 'HAHA', e.readout);
      }),
      ev.on('damage', (e) => {
        if (e.source === 'orb') {
          this.hideOrbs();
          drawBossScreen(this.screen, 'TOO SLOW', '');
        }
      }),
      ev.on('roundClear', () => this.hideOrbs()),
    );
  }

  /** Swap the boss's looks; behaviour, screen and HP bar carry over. */
  setSkin(id: string): void {
    if (this.boss) this.root.remove(this.boss.root);
    this.boss = buildSkin(id, 'calcullama');
    this.skinId = (this.boss.root.userData.skinId as string) ?? id;
    // Normalise any skin to a ~1.75 m-tall boss.
    this.boss.root.scale.setScalar(BOSS_HEIGHT / this.boss.height);
    this.root.add(this.boss.root);
    const anchor = this.boss.screenAnchor ?? this.boss.root;
    anchor.add(this.screen.mesh);
    if (!this.boss.screenAnchor) this.screen.mesh.position.set(0, this.boss.height * 0.45, this.boss.height * 0.2);
    else this.screen.mesh.position.set(0, 0, 0.002);
    // Screen and HP bar keep the same world size whatever the skin's scale.
    const k = BOSS_HEIGHT / this.boss.height;
    this.screen.mesh.scale.setScalar(1.25 / k);
    this.boss.root.add(this.hpPanel.mesh);
    this.hpPanel.mesh.position.set(0, this.boss.height * 0.98, 0.1);
    this.hpPanel.mesh.scale.setScalar(1.25 / k);
    game().roster.boss = this.skinId;
  }

  get currentSkin(): string {
    return this.skinId;
  }

  private drawHp(): void {
    const hp = this.hp;
    this.hpPanel.draw(`hp${hp}`, (g, w, h) => {
      const seg = (w - 40) / BC.hp;
      for (let i = 0; i < BC.hp; i++) {
        g.fillStyle = i < hp ? '#ff2bd6' : 'rgba(255,255,255,0.12)';
        g.fillRect(20 + i * seg + 4, 14, seg - 8, h - 28);
      }
      neonText(g, skinName(this.skinId), w / 2, h / 2, { size: 30, color: 0xffffff, family: FONT_DISPLAY, glow: 6 });
    });
  }

  private launch(choices: number[], correct: number): void {
    const ctx = game();
    const seated = ctx.settings.seated;
    void correct;
    choices.forEach((v, i) => {
      const o = this.orbs[i];
      if (!o) return;
      o.value = v;
      o.alive = true;
      o.t = 0;
      o.burst = 0;
      o.root.visible = true;
      o.root.scale.setScalar(1);
      ctx.playPoint(o.from, 0, 0.1, -2.3);
      // Low and wide so the boss's belly screen (the fact) stays visible between them.
      const x = (i - (choices.length - 1) / 2) * 0.27;
      ctx.playPoint(o.to, x, -(seated ? CONFIG.grid.seatedBelowHead : CONFIG.grid.belowHead) - 0.04 + (i % 2) * 0.04, -BC.orbHoldDistance);
      o.label.invalidate();
      o.label.draw(`${v}`, (g, w, h) => {
        neonText(g, String(v), w / 2, h / 2 + 6, { size: String(v).length > 2 ? 120 : 150, color: 0xffffff, family: FONT_DISPLAY, stroke: 14 });
      });
      o.core.color.setHex(0x2a0a4a);
    });
  }

  private popAll(correctHit: boolean): void {
    for (const o of this.orbs) {
      if (!o.alive) continue;
      o.alive = false;
      o.burst = 1;
      o.core.color.setHex(correctHit ? 0xffe14d : 0xff2244);
      o.target.enabled = false;
    }
  }

  private hideOrbs(): void {
    for (const o of this.orbs) {
      o.alive = false;
      o.burst = 0;
      o.root.visible = false;
      o.target.enabled = false;
    }
  }

  update(delta: number, time: number): void {
    const ctx = game();
    const s = ctx.session;
    const show = ctx.screen === 'game' && s.isBossRound && (s.phase === 'intro' || s.phase === 'playing' || s.phase === 'clear');
    this.root.visible = show;
    if (!show) {
      for (const o of this.orbs) o.target.enabled = false;
      return;
    }
    const dt = ctx.simDt;
    // Boss stands far away, bobbing; leans back when hit.
    this.flinch = Math.max(0, this.flinch - delta * 2);
    this.shout = Math.max(0, this.shout - delta * 2.5);
    const dying = s.phase === 'clear';
    ctx.playPoint(this.p, 0, -0.02 + Math.sin(time * 2) * 0.03 - (dying ? Math.min(1, s.phaseTime) * 0.9 : 0), -2.6);
    const b = this.boss.root;
    b.position.copy(this.p);
    b.rotation.set(-this.flinch * 0.3 - (dying ? s.phaseTime * 0.6 : 0), ctx.anchorYaw + Math.sin(time * 1.3) * 0.12, Math.sin(time * 1.7) * 0.05);
    const jaw = this.boss.jaw;
    if (jaw) {
      jaw.userData.baseY ??= jaw.position.y;
      jaw.position.y = (jaw.userData.baseY as number) - this.shout * 0.06;
    }
    if (this.boss.spinner) this.boss.spinner.rotation.z = Math.sin(time * 3) * 0.08;
    // Volley timer bar on the screen sub-line would redraw every frame; keep it on the orbs instead.
    const boss = s.boss;
    const urgency = boss && boss.active ? boss.volleyTime / BC.volleyTimeout : 0;
    for (const o of this.orbs) {
      if (o.burst > 0) {
        o.burst -= delta * 3;
        o.root.scale.setScalar(1 + (1 - o.burst) * 1.5);
        if (o.burst <= 0) o.root.visible = false;
        continue;
      }
      if (!o.alive) continue;
      o.t = Math.min(1, o.t + dt * BC.orbSpeed * 3.2);
      const e = 1 - Math.pow(1 - o.t, 3);
      o.root.position.lerpVectors(o.from, o.to, e);
      o.root.position.y += Math.sin(time * 3 + o.value) * 0.01;
      o.root.lookAt(ctx.head);
      o.haloMat.color.setHex(urgency > 0.7 ? CONFIG.colors.red : CONFIG.colors.cyan);
      o.target.pos.copy(o.root.position);
      o.target.enabled = s.phase === 'playing' && !ctx.paused && o.t > 0.6;
    }
  }
}
