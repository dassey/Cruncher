import { Group, Vector3, createSystem } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game } from '../game/context.js';
import { CanvasPanel, FONT_DISPLAY, FONT_UI, neonText } from '../render/text.js';

interface Popup {
  panel: CanvasPanel;
  root: Group;
  life: number;
  max: number;
  vel: number;
  big: boolean;
}

const POOL = 8;

/**
 * SCORING: floating score popups ("+300 · CLEAN · 7×4"), wrong-hit fact
 * readouts ("7 × 4 = 28"), combo milestones and bug/boss callouts.
 */
export class ScoringSystem extends createSystem({}) {
  private pool: Popup[] = [];
  private next = 0;
  private tmp = new Vector3();
  private dir = new Vector3();
  private comboPanel!: CanvasPanel;
  private comboLife = 0;

  init(): void {
    const ctx = game();
    for (let i = 0; i < POOL; i++) {
      const panel = new CanvasPanel(512, 256, 0.26, { renderOrder: 20, depthTest: false });
      const root = new Group();
      root.add(panel.mesh);
      root.visible = false;
      this.world.createTransformEntity(root, { persistent: true });
      this.pool.push({ panel, root, life: 0, max: 1, vel: 0, big: false });
    }
    this.comboPanel = new CanvasPanel(1024, 256, 0.7, { renderOrder: 21, depthTest: false });
    this.comboPanel.mesh.visible = false;
    this.world.createTransformEntity(this.comboPanel.mesh, { persistent: true });

    ctx.actions.announce = (title, sub, color) => this.announce(title, sub, color);
    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ev.on('hitCorrect', (e) => {
        const top = e.sixSeven ? 'SIX SEVEN!' : `+${e.points}`;
        const mid = e.sixSeven ? '(6 × 7 = 42)' : e.callout;
        this.spawn(this.blockPos(e.block.id), top, mid, e.receipt, e.sixSeven ? CONFIG.colors.magenta : CONFIG.colors.yellow, 0.9, false);
      }),
      ev.on('hitWrong', (e) => {
        // The fact is the big text; the joke is tiny and self-deprecating. The wrong
        // block stays, so the readout pops well in front of it.
        const at = this.blockPos(e.block.id, 0.1);
        at.y += 0.02;
        this.spawn(at, e.readout, e.shielded ? 'SHIELD SAVED YOUR COMBO' : e.callout, '', 0xff5577, 1.5, true);
      }),
      ev.on('comboTier', (e) => this.showCombo(`x${e.combo} ${e.text}`)),
      ev.on('bugPunched', (e) => this.spawn(this.headFront(0.12, 0.42), `+${e.points}`, e.callout, '', CONFIG.colors.green, 0.8, false)),
      ev.on('bossHit', (e) => this.spawn(this.headFront(0.05, 0.6), `+${e.points}`, e.receipt, '', CONFIG.colors.yellow, 1.0, true)),
      ev.on('bossWrong', (e) => this.spawn(this.headFront(0.05, 0.6), e.readout, `NOT ${e.value}`, '', 0xff5577, 1.6, true)),
      ev.on('damage', (e) => {
        if (e.source !== 'wrong') this.spawn(this.headFront(-0.05, 0.5), e.callout, e.source === 'timeout' ? 'LAG SPIKE' : '-1 HEART', '', 0xff2244, 1.0, false);
      }),
    );
  }

  /** Block position pulled a fixed distance (m) toward the eyes — never a fraction
   *  (fractions compound and land popups 30 cm from the face). */
  private blockPos(id: number, pull = 0.06): Vector3 {
    const t = game().targets.find((x) => x.kind === 'block' && x.id === id);
    if (t) this.tmp.copy(t.pos);
    this.dir.subVectors(game().head, this.tmp).normalize();
    this.tmp.addScaledVector(this.dir, pull);
    return this.tmp;
  }

  private headFront(up: number, dist: number): Vector3 {
    return game().playPoint(this.tmp, 0, up - 0.05, -dist);
  }

  private spawn(pos: Vector3, top: string, mid: string, low: string, color: number, life: number, big: boolean): void {
    const p = this.pool[this.next] as Popup;
    this.next = (this.next + 1) % POOL;
    p.life = life;
    p.max = life;
    p.vel = big ? 0.015 : 0.035;
    p.big = big;
    p.root.visible = true;
    p.root.position.copy(pos);
    p.panel.draw(`${top}|${mid}|${low}|${color}`, (g, w, h) => {
      neonText(g, top, w / 2, h * 0.32, { size: big ? 78 : 96, color, family: FONT_DISPLAY, stroke: 10, glow: 14, maxWidth: w - 20 });
      if (mid) neonText(g, mid, w / 2, h * 0.66, { size: 44, color: 0xffffff, family: FONT_UI, stroke: 8, glow: 0, maxWidth: w - 20 });
      if (low) neonText(g, low, w / 2, h * 0.88, { size: 34, color: CONFIG.colors.cyan, family: FONT_UI, stroke: 6, glow: 0, maxWidth: w - 20 });
    });
  }

  /** Two-line centre card, reusing the combo panel. */
  announce(title: string, sub: string, color: number): void {
    this.comboLife = 2.2;
    this.comboPanel.invalidate();
    this.comboPanel.draw(`${title}|${sub}`, (g, w, h) => {
      neonText(g, title, w / 2, h * 0.38, { size: 76, color, family: FONT_DISPLAY, stroke: 12, maxWidth: w - 30 });
      neonText(g, sub, w / 2, h * 0.78, { size: 44, color: 0xffffff, family: FONT_UI, stroke: 8, glow: 6, maxWidth: w - 30 });
    });
  }

  private showCombo(text: string): void {
    this.comboLife = 1.4;
    this.comboPanel.draw(text, (g, w, h) => {
      neonText(g, text, w / 2, h / 2, { size: 100, color: CONFIG.colors.magenta, family: FONT_DISPLAY, stroke: 12, maxWidth: w - 30 });
    });
  }

  update(delta: number): void {
    const ctx = game();
    const head = ctx.head;
    for (const p of this.pool) {
      if (!p.root.visible) continue;
      if (!ctx.freezePopups) p.life -= delta;
      if (p.life <= 0 || ctx.screen !== 'game') {
        p.root.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.root.position.y += p.vel * delta;
      p.root.lookAt(head);
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 0.5);
      p.root.scale.setScalar(pop * (p.big ? 1.15 : 1));
      p.panel.material.opacity = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
    }
    if (this.comboLife > 0) {
      this.comboLife -= delta;
      const m = this.comboPanel.mesh;
      m.visible = this.comboLife > 0 && ctx.screen === 'game';
      ctx.playPoint(m.position, 0, 0.05 + (1.4 - this.comboLife) * 0.03, -0.75);
      m.lookAt(head);
      const k = Math.max(0, 1.4 - this.comboLife);
      m.scale.setScalar(k < 0.15 ? 0.5 + k * 4 : 1.1);
      this.comboPanel.material.opacity = Math.min(1, this.comboLife * 2.5);
    }
  }
}
