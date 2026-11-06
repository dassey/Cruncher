import { Group, createSystem } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type Screen, type Target } from '../game/context.js';
import { BILLBOARD_DIST, hudBandY } from '../game/layout.js';
import { FACTS, factIndex } from '../logic/facts.js';
import { UPGRADE_IDS, UPGRADE_INFO, buyOrEquipSkin, buyUpgrade, playtime, upgradeCost, type UpgradeId } from '../logic/progression.js';
import { PERK_INFO, type PerkId } from '../logic/session.js';
import { PunchButton } from '../render/button.js';
import { CanvasPanel, FONT_DISPLAY, FONT_GLITCH, FONT_UI, css, neonText, plate } from '../render/text.js';

interface Slot {
  btn: PunchButton;
  target: Target;
  action: string;
  active: boolean;
}

const MAX_BUTTONS = 12;
const C = CONFIG.colors;

/**
 * UI: in-world HUD plus every menu. Menu buttons are punchable blocks (same
 * verb as gameplay); on desktop they are clickable. Screens: title, shop,
 * stats (parent-friendly "BRAIN.EXE" scan), settings, perk pick, game over.
 */
export class UISystem extends createSystem({}) {
  private slots: Slot[] = [];
  private menuRoot = new Group();
  private hud!: CanvasPanel;
  private info!: CanvasPanel;
  private logo!: CanvasPanel;
  private debug!: CanvasPanel;
  private lastScreen: Screen | '' = '';
  private lastPhase = '';
  private armDelay = 0;
  private resetArmed = 0;
  private skinCursor = 0;
  private lastGameOver = { score: 0, round: 0, shards: 0, callout: '', bestCombo: 0, newBest: false };

  init(): void {
    const ctx = game();
    for (let i = 0; i < MAX_BUTTONS; i++) {
      const btn = new PunchButton(0.15, 0.11, 0.07);
      btn.root.visible = false;
      this.menuRoot.add(btn.root);
      const slot: Slot = {
        btn,
        action: '',
        active: false,
        target: ctx.addTarget({ kind: 'button', id: i, radius: 0.068, enabled: false, onHit: () => this.press(slot) }),
      };
      this.slots.push(slot);
    }
    this.info = new CanvasPanel(1024, 640, 1.35);
    this.logo = new CanvasPanel(1024, 300, 1.4);
    this.hud = new CanvasPanel(1024, 210, 1.15, { renderOrder: 14 });
    this.debug = new CanvasPanel(768, 768, 0.6, { renderOrder: 40, depthTest: false });
    this.menuRoot.add(this.info.mesh, this.logo.mesh);
    this.menuRoot.name = 'Menus';
    this.world.createTransformEntity(this.menuRoot, { persistent: true });
    this.world.createTransformEntity(this.hud.mesh, { persistent: true });
    this.world.createTransformEntity(this.debug.mesh, { persistent: true });

    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ctx.ui.on('screen', () => {
        this.lastScreen = '';
      }),
      ev.on('gameOver', (e) => {
        this.lastGameOver = { score: e.score, round: e.round, shards: e.shards, callout: e.callout, bestCombo: e.bestCombo, newBest: false };
        // Progression records the run first (registered earlier); read its verdict next frame.
        setTimeout(() => {
          this.lastGameOver.newBest = ctx.lastRunNewBest;
          this.lastScreen = '';
        }, 0);
        ctx.actions.setScreen('gameover');
      }),
    );
  }

  // ------------------------------------------------------------------ input
  private press(slot: Slot): void {
    if (!slot.active || this.armDelay > 0) return;
    const ctx = game();
    slot.btn.kick = 1;
    ctx.ui.emit('button', { id: slot.action });
    const [kind, arg] = slot.action.split(':') as [string, string | undefined];
    const p = ctx.progress;
    switch (kind) {
      case 'play':
        ctx.actions.startRun();
        break;
      case 'goto':
        ctx.actions.setScreen(arg as Screen);
        break;
      case 'menu':
        ctx.actions.toMenu();
        break;
      case 'upgrade':
        if (buyUpgrade(p, arg as UpgradeId)) ctx.save();
        break;
      case 'skin':
        if (arg && buyOrEquipSkin(p, arg)) ctx.save();
        break;
      case 'skinnav':
        this.skinCursor = (this.skinCursor + Number(arg) + CONFIG.skins.length) % CONFIG.skins.length;
        break;
      case 'perk':
        ctx.session.takePerk(arg as PerkId);
        break;
      case 'resume':
        ctx.userPaused = false;
        break;
      case 'seated':
        p.settings.seated = !p.settings.seated;
        ctx.save();
        break;
      case 'vol':
        p.settings.volume = clamp01(p.settings.volume + (arg === '+' ? 0.1 : -0.1));
        ctx.save();
        break;
      case 'music':
        p.settings.music = clamp01(p.settings.music + (arg === '+' ? 0.1 : -0.1));
        ctx.save();
        break;
      case 'aim':
        p.settings.aim = p.settings.aim === 'both' ? 'punch' : p.settings.aim === 'punch' ? 'blast' : 'both';
        ctx.save();
        break;
      case 'fx':
        p.settings.reducedFx = !p.settings.reducedFx;
        ctx.save();
        break;
      case 'reset':
        if (this.resetArmed > 0) {
          ctx.resetAll();
          this.resetArmed = 0;
        } else this.resetArmed = 3;
        break;
    }
    this.lastScreen = ''; // force rebuild to refresh labels
  }

  /** Bot/debug: press a button by action id. Returns false if not visible. */
  pressAction(action: string): boolean {
    const slot = this.slots.find((s) => s.active && s.action === action);
    if (!slot) return false;
    this.armDelay = 0;
    this.press(slot);
    return true;
  }

  visibleActions(): string[] {
    return this.slots.filter((s) => s.active).map((s) => s.action);
  }

  // ------------------------------------------------------------------ layout
  private layoutButtons(items: Array<{ action: string; title: string; sub?: string; color?: number; dim?: boolean; row?: number; w?: number }>): void {
    const ctx = game();
    const seated = ctx.settings.seated;
    const rows = new Map<number, number>();
    for (const it of items) rows.set(it.row ?? 0, (rows.get(it.row ?? 0) ?? 0) + 1);
    const idxInRow = new Map<number, number>();
    this.slots.forEach((s, i) => {
      const it = items[i];
      s.active = !!it;
      s.btn.root.visible = !!it;
      s.target.enabled = false;
      if (!it) return;
      const row = it.row ?? 0;
      const n = rows.get(row) ?? 1;
      const k = idxInRow.get(row) ?? 0;
      idxInRow.set(row, k + 1);
      s.action = it.action;
      s.btn.set(it.title, it.sub ?? '', it.color ?? C.cyan, it.dim ?? false);
      const R = 0.5;
      const spacing = 0.175;
      const theta = ((k - (n - 1) / 2) * spacing) / R;
      const y = -(seated ? CONFIG.grid.seatedBelowHead : CONFIG.grid.belowHead) + 0.17 - row * 0.17;
      ctx.playPoint(s.btn.root.position, Math.sin(theta) * R, y, -Math.cos(theta) * R);
      s.btn.root.rotation.set(0, ctx.anchorYaw - theta, 0);
      s.btn.root.updateMatrixWorld();
      s.btn.root.getWorldPosition(s.target.pos);
    });
    this.armDelay = 0.45;
  }

  private placePanels(): void {
    const ctx = game();
    ctx.playPoint(this.info.mesh.position, 0, 0.36, -1.15);
    this.info.mesh.rotation.set(0, ctx.anchorYaw, 0);
    ctx.playPoint(this.logo.mesh.position, 0, 0.3, -1.3);
    this.logo.mesh.rotation.set(0, ctx.anchorYaw, 0);
  }

  private build(screen: Screen): void {
    const ctx = game();
    const p = ctx.progress;
    this.placePanels();
    this.logo.mesh.visible = screen === 'title';
    this.info.mesh.visible = screen !== 'title' && screen !== 'game';
    this.info.invalidate();
    switch (screen) {
      case 'title':
        this.drawLogo();
        this.layoutButtons([
          { action: 'play', title: 'PLAY', sub: 'PUNCH ME', color: C.yellow, row: 0 },
          { action: 'goto:shop', title: 'SHOP', sub: `${p.shards} SHARDS`, color: C.magenta, row: 1 },
          { action: 'goto:stats', title: 'STATS', sub: 'BRAIN.EXE', color: C.green, row: 1 },
          { action: 'goto:settings', title: 'SETUP', sub: p.settings.seated ? 'SEATED' : 'STANDING', color: C.cyan, row: 1 },
        ]);
        break;
      case 'shop': {
        const items: Parameters<UISystem['layoutButtons']>[0] = [];
        for (const id of UPGRADE_IDS) {
          const cost = upgradeCost(p, id);
          items.push({ action: `upgrade:${id}`, title: UPGRADE_INFO[id].name, sub: cost === null ? 'MAXED' : `${cost} ◆ · LV${p.upgrades[id]}`, color: C.yellow, dim: cost === null || p.shards < cost, row: 0 });
        }
        // Row 1: a skin carousel (◀ current ▶) + BACK. Two rows total, all in reach.
        const sk = CONFIG.skins[this.skinCursor] ?? CONFIG.skins[0];
        const owned = p.skinsOwned.includes(sk.id);
        items.push({ action: 'skinnav:-1', title: '◀', sub: 'GLOVES', color: C.magenta, row: 1 });
        items.push({ action: `skin:${sk.id}`, title: sk.name, sub: p.skin === sk.id ? 'EQUIPPED' : owned ? 'PUNCH: EQUIP' : `${sk.cost} ◆ BUY`, color: sk.color, dim: !owned && p.shards < sk.cost, row: 1 });
        items.push({ action: 'skinnav:1', title: '▶', sub: 'GLOVES', color: C.magenta, row: 1 });
        items.push({ action: 'goto:title', title: 'BACK', color: C.cyan, row: 1 });
        this.layoutButtons(items);
        this.drawShop();
        break;
      }
      case 'stats':
        this.layoutButtons([{ action: 'goto:title', title: 'BACK', color: C.cyan, row: 1 }]);
        this.drawStats();
        break;
      case 'settings': {
        const st = p.settings;
        this.layoutButtons([
          { action: 'seated', title: st.seated ? 'SEATED' : 'STANDING', sub: 'TAP TO SWAP', color: C.cyan, row: 0 },
          { action: 'aim', title: st.aim === 'both' ? 'AIM: BOTH' : st.aim === 'punch' ? 'AIM: PUNCH' : 'AIM: BLAST', sub: 'PUNCH / POINT+ZAP', color: C.yellow, row: 0 },
          { action: 'fx', title: st.reducedFx ? 'FX: CHILL' : 'FX: FULL', sub: 'EFFECTS', color: C.magenta, row: 0 },
          { action: 'vol:-', title: 'VOL -', sub: `${Math.round(st.volume * 100)}%`, color: C.yellow, row: 1 },
          { action: 'vol:+', title: 'VOL +', sub: `${Math.round(st.volume * 100)}%`, color: C.yellow, row: 1 },
          { action: 'music:-', title: 'MUSIC -', sub: `${Math.round(st.music * 100)}%`, color: C.green, row: 1 },
          { action: 'music:+', title: 'MUSIC +', sub: `${Math.round(st.music * 100)}%`, color: C.green, row: 1 },
          { action: 'reset', title: this.resetArmed > 0 ? 'SURE?' : 'WIPE SAVE', sub: this.resetArmed > 0 ? 'PUNCH AGAIN' : 'PARENTS ONLY', color: C.red, row: 2 },
          { action: 'goto:title', title: 'BACK', color: C.cyan, row: 2 },
        ]);
        this.drawSettings();
        break;
      }
      case 'gameover':
        this.layoutButtons([
          { action: 'play', title: 'RUN IT BACK', sub: 'PUNCH TO RETRY', color: C.yellow, row: 0 },
          { action: 'menu', title: 'MENU', color: C.cyan, row: 0 },
        ]);
        this.drawGameOver();
        break;
      case 'game':
        this.layoutButtons([]);
        break;
    }
  }

  private buildPause(): void {
    const s = game().session;
    this.placePanels();
    this.layoutButtons([
      { action: 'resume', title: 'RESUME', sub: 'BACK TO IT', color: C.green, row: 0 },
      { action: 'menu', title: 'QUIT', sub: 'TO MENU', color: C.red, row: 0 },
    ]);
    this.info.mesh.visible = true;
    this.info.invalidate();
    this.info.draw('pause', (g, w, h) => {
      plate(g, w, h, C.cyan);
      neonText(g, 'PAUSED', w / 2, h * 0.32, { size: 120, color: C.cyan, family: FONT_GLITCH });
      neonText(g, `ROUND ${s.round + 1}  ·  ${s.score.toLocaleString()} AURA`, w / 2, h * 0.62, { size: 52, color: 0xffffff, family: FONT_UI, glow: 6 });
      neonText(g, 'B / Y / ESC TO RESUME', w / 2, h * 0.82, { size: 36, color: 0x9988bb, family: FONT_UI, glow: 0 });
    });
  }

  private buildPerks(): void {
    const s = game().session;
    this.layoutButtons(
      s.perkOffer.map((id) => ({ action: `perk:${id}`, title: PERK_INFO[id].name, sub: PERK_INFO[id].desc, color: C.green, row: 0 })),
    );
    this.info.mesh.visible = true;
    this.info.invalidate();
    this.info.draw('perk', (g, w, h) => {
      plate(g, w, h, C.green);
      neonText(g, 'ROUND CLEAR', w / 2, h * 0.3, { size: 92, color: C.yellow, family: FONT_DISPLAY });
      neonText(g, 'PUNCH A PERK', w / 2, h * 0.58, { size: 64, color: C.green, family: FONT_DISPLAY });
      neonText(g, `SCORE ${s.score.toLocaleString()}`, w / 2, h * 0.8, { size: 48, color: 0xffffff, family: FONT_UI, glow: 6 });
    });
  }

  // ------------------------------------------------------------------ drawing
  private drawLogo(): void {
    const p = game().progress;
    const best = p.highScores[0]?.score ?? 0;
    this.logo.draw(`logo${best}${p.shards}`, (g, w, h) => {
      // Chromatic split title: offset cyan/magenta copies, white-ish core on top.
      neonText(g, 'CRUNCHER', w / 2 - 7, h * 0.42 + 3, { size: 170, color: C.magenta, family: FONT_GLITCH, glow: 22 });
      neonText(g, 'CRUNCHER', w / 2 + 7, h * 0.42 - 3, { size: 170, color: C.cyan, family: FONT_GLITCH, glow: 22 });
      g.save();
      g.font = `170px "${FONT_GLITCH}"`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#1a0630';
      g.fillText('CRUNCHER', w / 2, h * 0.42);
      g.restore();
      neonText(g, 'YOU ARE THE GLITCH. CRUNCH THE NUMBERS.', w / 2, h * 0.78, { size: 40, color: 0xffffff, family: FONT_UI, glow: 8 });
      if (best > 0) neonText(g, `BEST ${best.toLocaleString()}`, w / 2, h * 0.94, { size: 34, color: C.yellow, family: FONT_UI, glow: 6 });
    });
  }

  private drawShop(): void {
    const p = game().progress;
    this.info.draw(`shop${p.shards}${JSON.stringify(p.upgrades)}${p.skin}${p.skinsOwned.length}${this.skinCursor}`, (g, w, h) => {
      plate(g, w, h, C.magenta);
      neonText(g, 'BLACK MARKET', w / 2, 80, { size: 76, color: C.magenta, family: FONT_DISPLAY });
      neonText(g, `${p.shards} ◆ DATA SHARDS`, w / 2, 160, { size: 54, color: C.yellow, family: FONT_DISPLAY });
      g.font = `34px "${FONT_UI}"`;
      g.textAlign = 'left';
      g.fillStyle = '#ffffff';
      let y = 240;
      for (const id of UPGRADE_IDS) {
        const lvl = p.upgrades[id];
        g.fillStyle = css(C.yellow);
        g.fillText(`${UPGRADE_INFO[id].name}  ${'■'.repeat(lvl)}${'□'.repeat(CONFIG.upgrades[id].max - lvl)}`, 80, y);
        g.fillStyle = '#ccbbee';
        g.fillText(UPGRADE_INFO[id].desc, 80, y + 38);
        y += 92;
      }
      // Glove carousel preview.
      const sk = CONFIG.skins[this.skinCursor] ?? CONFIG.skins[0];
      g.save();
      g.shadowColor = css(sk.color);
      g.shadowBlur = 24;
      g.fillStyle = css(sk.color);
      g.beginPath();
      g.arc(w - 170, 330, 70, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css(sk.accent);
      g.fillRect(w - 225, 300, 110, 22);
      g.restore();
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = `34px "${FONT_DISPLAY}"`;
      g.fillText(sk.name, w - 170, 450);
      g.font = `28px "${FONT_UI}"`;
      g.fillStyle = '#ccbbee';
      g.fillText(p.skinsOwned.includes(sk.id) ? (p.skin === sk.id ? 'EQUIPPED' : 'OWNED') : `${sk.cost} ◆`, w - 170, 490);
      g.fillText('SHARDS: EARNED EVERY RUN. NO REAL MONEY. EVER.', w / 2, h - 50);
    });
  }

  private drawStats(): void {
    const ctx = game();
    const L = ctx.learning;
    const p = ctx.progress;
    const sum = L.summary();
    this.info.draw(`stats${sum.mastered}${sum.learning}${sum.shaky}${p.runs}`, (g, w, h) => {
      plate(g, w, h, C.green);
      neonText(g, 'BRAIN.EXE // SYSTEM SCAN', w / 2, 56, { size: 50, color: C.green, family: FONT_DISPLAY });
      // 11×11 heat map of facts: rows a, cols b.
      const cell = 42;
      const ox = 70;
      const oy = 110;
      g.font = `24px "${FONT_UI}"`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let a = 2; a <= 12; a++) {
        g.fillStyle = '#9988bb';
        g.fillText(String(a), ox - 22, oy + (a - 2) * cell + cell / 2);
        g.fillText(String(a), ox + (a - 2) * cell + cell / 2, oy - 18);
        for (let b = 2; b <= 12; b++) {
          const lvl = L.mastery(factIndex(a, b));
          g.fillStyle = lvl === 'mastered' ? '#39ff88' : lvl === 'learning' ? '#ffe14d' : lvl === 'shaky' ? '#ff3366' : 'rgba(255,255,255,0.08)';
          g.fillRect(ox + (b - 2) * cell + 3, oy + (a - 2) * cell + 3, cell - 6, cell - 6);
        }
      }
      const tx = ox + 11 * cell + 50;
      g.textAlign = 'left';
      const line = (label: string, value: string, y: number, color = '#ffffff') => {
        g.font = `32px "${FONT_UI}"`;
        g.fillStyle = '#b8a8dd';
        g.fillText(label, tx, y, w - tx - 30);
        g.font = `54px "${FONT_DISPLAY}"`;
        g.fillStyle = color;
        g.fillText(value, tx, y + 46, w - tx - 30);
      };
      line('FACTS LOCKED IN', `${sum.mastered}/${FACTS.length}`, 130, '#39ff88');
      line('ACCURACY', `${Math.round(L.accuracy() * 100)}%`, 230);
      const pt = playtime(p, new Date());
      line('TODAY · THIS WEEK', `${fmtTime(pt.today)} · ${fmtTime(pt.week)}`, 330);
      line('RUNS · BEST ROUND', `${p.runs} · ${p.bestRound}`, 430);
      const weak = L.weakest(3).map((i) => `${FACTS[i]?.a}×${FACTS[i]?.b}`).join('  ');
      line('NEEDS REPS', weak || '—', 530, '#ff6688');
      g.font = `24px "${FONT_UI}"`;
      g.textAlign = 'left';
      const ly = oy + 11 * cell + 24;
      const legend: Array<[string, string]> = [
        ['#39ff88', 'LOCKED IN'],
        ['#ffe14d', 'LOADING'],
        ['#ff3366', 'GLITCHY'],
        ['rgba(255,255,255,0.2)', 'NOT SEEN'],
      ];
      legend.forEach(([c, t], i) => {
        g.fillStyle = c;
        g.fillRect(ox + i * 120, ly, 20, 20);
        g.fillStyle = '#ccbbee';
        g.fillText(t, ox + i * 120 + 26, ly + 11);
      });
    });
  }

  private drawSettings(): void {
    const st = game().progress.settings;
    this.info.draw(`set${JSON.stringify(st)}${this.resetArmed > 0}`, (g, w, h) => {
      plate(g, w, h, C.cyan);
      neonText(g, 'SETUP', w / 2, 80, { size: 80, color: C.cyan, family: FONT_DISPLAY });
      g.font = `36px "${FONT_UI}"`;
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      const lines = [
        `MODE: ${st.seated ? 'SEATED (GRID SITS LOWER)' : 'STANDING'}`,
        `VOLUME ${Math.round(st.volume * 100)}%   ·   MUSIC ${Math.round(st.music * 100)}%`,
        `EFFECTS: ${st.reducedFx ? 'CHILL (FEWER PARTICLES, NO GLITCH)' : 'FULL'}`,
        `AIM: ${st.aim === 'both' ? 'PUNCH OR POINT + TRIGGER/PINCH TO ZAP' : st.aim === 'punch' ? 'PUNCH ONLY' : 'ZAP ONLY (GREAT SEATED)'}`,
        'NO LOCOMOTION. NO FLASHING. STAY IN ONE SPOT.',
        'CLAP OR PRESS A/X FOR SLOW-MO.',
      ];
      lines.forEach((l, i) => g.fillText(l, w / 2, 190 + i * 70));
      g.fillStyle = '#9988bb';
      g.font = `28px "${FONT_UI}"`;
      g.fillText('ALL PROGRESS STAYS ON THIS HEADSET. NOTHING IS SENT ANYWHERE.', w / 2, h - 60);
    });
  }

  private drawGameOver(): void {
    const r = this.lastGameOver;
    const best = game().progress.highScores[0]?.score ?? 0;
    this.info.draw(`go${r.score}${r.newBest}${r.shards}`, (g, w, h) => {
      plate(g, w, h, C.red);
      neonText(g, r.callout || 'COOKED', w / 2, 110, { size: 120, color: C.red, family: FONT_GLITCH, glow: 30 });
      if (r.newBest) neonText(g, 'NEW PB · CERTIFIED W', w / 2, 210, { size: 56, color: C.yellow, family: FONT_DISPLAY });
      neonText(g, `${r.score.toLocaleString()} AURA`, w / 2, 310, { size: 80, color: 0xffffff, family: FONT_DISPLAY });
      neonText(g, `REACHED ROUND ${r.round}  ·  BEST COMBO x${r.bestCombo}`, w / 2, 400, { size: 40, color: C.cyan, family: FONT_UI, glow: 6 });
      neonText(g, `+${r.shards} ◆ SHARDS`, w / 2, 480, { size: 56, color: C.magenta, family: FONT_DISPLAY });
      neonText(g, `BEST ${best.toLocaleString()}`, w / 2, 560, { size: 34, color: 0x9988bb, family: FONT_UI, glow: 4 });
    });
  }

  private drawHud(): void {
    const ctx = game();
    const s = ctx.session;
    const t = Math.max(0, Math.ceil(s.timeLeft));
    const boss = s.boss;
    const key = `${s.hp}/${s.maxHp}|${s.score}|${s.combo}|${t}|${s.remaining}|${s.slowmoCharges}|${s.slowmoTime > 0}|${boss?.hp ?? -1}|${s.shieldCharges}`;
    const limit = s.params.timeLimit + CONFIG.perks.timeBonus * s.perks.time;
    this.hud.draw(key, (g, w, h) => {
      plate(g, w, h, s.slowmoTime > 0 ? C.cyan : C.magenta, 0.6, false);
      // Row 1: hearts (half-heart units) · score · combo multiplier. Big: read at a glance.
      const hearts = Math.ceil(s.maxHp / 2);
      const hr = hearts > 6 ? 22 : 27;
      for (let i = 0; i < hearts; i++) {
        const v = Math.max(0, Math.min(2, s.hp - i * 2));
        drawHeart(g, 58 + i * (hr * 2.4), 74, hr, v);
      }
      g.textBaseline = 'middle';
      neonText(g, s.score.toLocaleString(), w * 0.62, 72, { size: 96, color: 0xffffff, family: FONT_DISPLAY, glow: 0, stroke: 10 });
      const mult = s.multiplier;
      neonText(g, mult > 1 ? `x${mult}` : `${s.combo}`, w - 95, 72, { size: 96, color: mult > 1 ? C.yellow : 0x9988bb, family: FONT_DISPLAY, glow: 0, stroke: 10 });
      // Row 2: timer bar with remaining count on it.
      const frac = Math.max(0, Math.min(1, s.timeLeft / Math.max(1, limit)));
      const bx = 40;
      const bw = w - 80;
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(bx, 138, bw, 30);
      g.fillStyle = frac < 0.25 ? '#ff2244' : frac < 0.5 ? '#ffe14d' : '#00f0ff';
      g.fillRect(bx, 138, bw * frac, 30);
      g.font = `30px "${FONT_UI}"`;
      g.fillStyle = '#ffffff';
      g.textAlign = 'right';
      g.fillText(boss ? `BOSS HP ${boss.hp}` : `${s.remaining} LEFT · ${t}s`, w - 50, 186);
      g.textAlign = 'left';
      g.fillText(`SLOW-MO ${'◉'.repeat(s.slowmoCharges)}${s.shieldCharges > 0 ? '   SHIELD ◈' : ''}`, 50, 186);
    });
  }

  private drawDebug(): void {
    const ctx = game();
    const L = ctx.learning;
    const s = ctx.session;
    const fs = ctx.frameStats;
    const key = `${Math.floor(ctx.realTime * 2)}`;
    this.debug.draw(key, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.fillRect(0, 0, w, h);
      g.font = '22px monospace';
      g.fillStyle = '#39ff88';
      const lines = [
        `DEBUG  phase=${s.phase} round=${s.round} heat=${s.heat.toFixed(2)}`,
        `tables=${L.unlockedTables.join(',')}  acc=${(L.accuracy() * 100).toFixed(0)}%`,
        `rule=${s.rule?.title ?? (s.isBossRound ? 'BOSS' : '-')}  assist=${s.assistActive}`,
        `frame avg=${(fs.sumMs / Math.max(1, fs.frames)).toFixed(1)}ms worst=${fs.worstMs.toFixed(1)} >14ms=${fs.over14}`,
        `calls=${this.renderer.info.render.calls} tris=${this.renderer.info.render.triangles}`,
        '--- top weights ---',
      ];
      const w2 = FACTS.map((f) => ({ f, w: L.weightOf(f.index), st: L.stats[f.index] }))
        .sort((a, b) => b.w - a.w)
        .slice(0, 16);
      for (const x of w2) lines.push(`${x.f.a}×${x.f.b}  w=${x.w.toFixed(2)} box=${x.st?.box} ${x.st?.correct}/${(x.st?.correct ?? 0) + (x.st?.wrong ?? 0)} rt=${Math.round(x.st?.rtAvg ?? -1)}`);
      lines.forEach((l, i) => g.fillText(l, 16, 30 + i * 30));
    });
  }

  // ------------------------------------------------------------------ frame
  update(delta: number, time: number): void {
    const ctx = game();
    const s = ctx.session;
    this.armDelay = Math.max(0, this.armDelay - delta);
    if (this.resetArmed > 0) {
      this.resetArmed -= delta;
      if (this.resetArmed <= 0 && ctx.screen === 'settings') this.lastScreen = '';
    }
    const phaseKey = ctx.screen === 'game' ? `${s.phase}${ctx.userPaused ? ':paused' : ''}` : '';
    if (ctx.screen !== this.lastScreen || phaseKey !== this.lastPhase) {
      this.lastScreen = ctx.screen;
      this.lastPhase = phaseKey;
      if (ctx.screen === 'game' && ctx.userPaused) this.buildPause();
      else if (ctx.screen === 'game' && s.phase === 'perk') this.buildPerks();
      else this.build(ctx.screen);
    }
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.btn.animate(delta, time);
      let hover = 0;
      for (const side of ['left', 'right'] as const) {
        const h = ctx.hands[side];
        if (h.tracked) hover = Math.max(hover, 1 - Math.min(1, Math.max(0, (h.pos.distanceTo(slot.target.pos) - 0.06) / 0.12)));
      }
      slot.btn.hover = hover;
      slot.target.enabled = this.armDelay <= 0;
    }
    // HUD = strip under the rule text on the overhead billboard (one place to look,
    // same depth as the banner so they can never overlap). Hidden during the intro,
    // where the banner's sub-line shows the round number.
    const inGame = ctx.screen === 'game' && !ctx.userPaused && (s.phase === 'playing' || s.phase === 'clear');
    this.hud.mesh.visible = inGame;
    if (inGame) {
      ctx.playPoint(this.hud.mesh.position, 0, hudBandY(s.params.rows, ctx.settings.seated, s.isBossRound), -BILLBOARD_DIST);
      this.hud.mesh.rotation.set(0, ctx.anchorYaw, 0);
      this.drawHud();
    }
    this.debug.mesh.visible = ctx.debugOverlay;
    if (ctx.debugOverlay) {
      ctx.playPoint(this.debug.mesh.position, -0.75, 0.0, -0.9);
      this.debug.mesh.lookAt(ctx.head);
      this.drawDebug();
    }
  }
}

function clamp01(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** Heart icon; value 0, 1 (half) or 2 (full). */
function drawHeart(g: CanvasRenderingContext2D, x: number, y: number, r: number, value: number): void {
  const path = () => {
    g.beginPath();
    g.moveTo(x, y + r * 0.9);
    g.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
    g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
    g.closePath();
  };
  path();
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fill();
  if (value > 0) {
    g.save();
    if (value === 1) {
      g.beginPath();
      g.rect(x - r * 2, y - r * 2, r * 2, r * 4);
      g.clip();
    }
    path();
    g.shadowColor = '#ff2b6a';
    g.shadowBlur = 12;
    g.fillStyle = '#ff2b6a';
    g.fill();
    g.restore();
  }
}
