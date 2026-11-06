import { Group, createSystem, Vector3 } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game } from '../game/context.js';
import { BANNER_ABOVE_HUD, BILLBOARD_DIST, hudBandY } from '../game/layout.js';
import { CanvasPanel, FONT_DISPLAY, FONT_UI, neonText } from '../render/text.js';

const GLYPHS = '#$%&@01<>/\\=+*?!';

/**
 * RULE: drives the round flow (ticks the session state machine) and shows the
 * current rule as a big "decrypting" banner overhead.
 */
export class RuleSystem extends createSystem({}) {
  private root = new Group();
  private banner!: CanvasPanel;
  private sub!: CanvasPanel;
  private reveal = 1;
  private title = '';
  private subtitle = '';
  private roundLabel = '';
  private color: number = CONFIG.colors.yellow;
  private p = new Vector3();
  private seed = 0;

  init(): void {
    this.banner = new CanvasPanel(1024, 220, 1.25, { renderOrder: 12 });
    this.sub = new CanvasPanel(1024, 90, 1.0, { renderOrder: 12 });
    // Sub-line sits where the HUD strip appears once play starts.
    this.sub.mesh.position.y = -BANNER_ABOVE_HUD;
    this.root.add(this.banner.mesh, this.sub.mesh);
    this.root.name = 'RuleBanner';
    this.world.createTransformEntity(this.root, { persistent: true });
    const s = game().session;
    this.cleanupFuncs.push(
      s.events.on('roundStart', (e) => {
        this.reveal = 0;
        this.seed++;
        if (e.isBoss) {
          this.title = 'BOSS: CALCU-LLAMA';
          this.subtitle = e.callout;
          this.color = CONFIG.colors.magenta;
        } else if (e.rule) {
          this.title = e.rule.title;
          this.subtitle = e.rule.subtitle;
          this.color = e.rule.kind === 'multiples' ? CONFIG.colors.yellow : e.rule.kind === 'equals' ? CONFIG.colors.cyan : CONFIG.colors.green;
        }
        this.roundLabel = e.isBoss ? `ROUND ${e.round + 1} · BOSS` : `ROUND ${e.round + 1}`;
      }),
      // In boss rounds the banner IS the question: big and centred.
      s.events.on('bossVolley', (e) => {
        this.title = `${e.a} × ${e.b} = ?`;
        this.subtitle = 'PUNCH THE RIGHT ORB';
        this.color = CONFIG.colors.yellow;
        this.reveal = 0.55;
      }),
      s.events.on('bossHit', (e) => {
        this.title = e.bossHp > 0 ? `${e.receipt}  CRIT!` : 'BOSS DELETED';
        this.subtitle = e.bossHp > 0 ? `${e.bossHp} HITS LEFT` : 'GG EZ';
        this.color = CONFIG.colors.green;
        this.reveal = 1;
      }),
      s.events.on('bossWrong', (e) => {
        this.title = e.readout;
        this.subtitle = 'NEXT ONE.';
        this.color = 0xff5577;
        this.reveal = 1;
      }),
    );
  }

  update(delta: number, time: number): void {
    const ctx = game();
    const s = ctx.session;
    // The game clock: session advances on real time except during hit-stop.
    if (ctx.screen === 'game' && !ctx.paused) s.tick(ctx.hitStop > 0 ? 0 : Math.min(delta, 0.1));

    const show = ctx.screen === 'game' && !ctx.userPaused && (s.phase === 'intro' || s.phase === 'playing' || s.phase === 'clear');
    this.root.visible = show;
    if (!show) return;
    this.reveal = Math.min(1, this.reveal + delta * 1.6);
    ctx.playPoint(this.p, 0, hudBandY(s.params.rows, ctx.settings.seated, s.isBossRound) + BANNER_ABOVE_HUD, -BILLBOARD_DIST);
    this.root.position.copy(this.p);
    this.root.rotation.set(0, ctx.anchorYaw, 0);
    const pop = s.phase === 'intro' ? 1 + 0.12 * Math.max(0, 1 - s.phaseTime * 2) : 1;
    this.root.scale.setScalar(pop);

    const shown = decode(this.title, this.reveal, this.seed + Math.floor(time * 20));
    const done = this.reveal >= 1;
    // Per-frame decrypt redraws skip the (expensive) blur; the final frame gets full glow.
    this.banner.draw(`${shown}|${this.color}|${done}`, (g, w, h) => {
      neonText(g, shown, w / 2, h * 0.55, { size: 118, color: this.color, family: FONT_DISPLAY, maxWidth: w - 40, stroke: 10, glow: done ? undefined : 0 });
    });
    const line = s.phase === 'intro' ? `${this.roundLabel}  ·  ${this.subtitle}` : '';
    this.sub.mesh.visible = s.phase === 'intro';
    this.sub.draw(`${line}|${done}`, (g, w, h) => {
      if (done) neonText(g, line, w / 2, h / 2, { size: 46, color: 0xffffff, family: FONT_UI, glow: 8, maxWidth: w - 40 });
    });
  }
}

/** Hacker "decrypt" reveal: unrevealed letters show random glyphs. */
function decode(text: string, t: number, seed: number): string {
  if (t >= 1) return text;
  const n = Math.floor(text.length * t);
  let out = text.slice(0, n);
  for (let i = n; i < text.length; i++) {
    const ch = text[i] as string;
    out += ch === ' ' ? ' ' : (GLYPHS[(i * 7 + seed * 13) % GLYPHS.length] as string);
  }
  return out;
}
