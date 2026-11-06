import { createSystem, Vector3 } from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type Screen } from '../game/context.js';
import { dateKey, recordRun } from '../logic/progression.js';

/**
 * PROGRESSION: run lifecycle (start, death, rewards), screen flow, play-area
 * anchoring, and persistence of shards, upgrades, high scores and settings.
 */
export class ProgressionSystem extends createSystem({}) {
  private fwd = new Vector3();
  private head = new Vector3();
  private reanchorIn = 0;

  update(): void {
    if (this.reanchorIn <= 0) return;
    this.reanchorIn--;
    const ctx = game();
    if (this.reanchorIn === 0 && ctx.screen !== 'game') {
      this.anchor();
      ctx.ui.emit('screen', { screen: ctx.screen }); // UI rebuilds layout at the new anchor
    }
  }

  init(): void {
    const ctx = game();
    ctx.actions.setScreen = (s: Screen) => this.setScreen(s);
    ctx.actions.toMenu = () => {
      if (ctx.session.phase !== 'gameover' && ctx.session.phase !== 'menu') {
        // Quitting mid-run still counts toward the parent playtime view.
        const sec = ctx.session.stats.seconds;
        ctx.progress.playSeconds += sec;
        const key = dateKey(new Date());
        ctx.progress.daily[key] = (ctx.progress.daily[key] ?? 0) + sec;
        ctx.session.quitToMenu();
        ctx.save();
      }
      this.setScreen('title');
    };
    ctx.actions.startRun = () => {
      this.anchor();
      this.setScreen('game');
      ctx.session.startRun({ ...ctx.progress.upgrades }, ctx.progress.lifetimeRounds);
    };
    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ev.on('gameOver', (e) => {
        ctx.progress.lifetimeRounds += e.round;
        ctx.lastRunNewBest = recordRun(ctx.progress, { score: e.score, roundsReached: e.round, bestCombo: e.bestCombo, shards: e.shards, seconds: e.seconds });
        ctx.save();
      }),
      this.visibilityState.subscribe(() => {
        // Entering/leaving XR changes the head pose. The first XR pose isn't
        // available yet inside this callback, so re-anchor a few frames later.
        this.reanchorIn = 3;
      }),
    );
    this.anchor();
  }

  setScreen(s: Screen): void {
    const ctx = game();
    if (s !== 'game') this.anchor();
    ctx.screen = s;
    ctx.ui.emit('screen', { screen: s });
  }

  /** Place the play area in front of where the player is looking now. */
  anchor(): void {
    const ctx = game();
    if (!ctx.immersive) {
      ctx.reanchor(this.head.set(0, CONFIG.grid.defaultHeadY, 0), 0);
      return;
    }
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.fwd);
    const yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    ctx.reanchor(this.head, yaw);
  }
}
