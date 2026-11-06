import { createSystem } from '@iwsdk/core';
import { game } from '../game/context.js';

/**
 * LEARNING: the hidden engine lives in logic/learning.ts and is fed by the
 * session. This system persists it (localStorage only — never the network)
 * at safe moments and keeps lifetime counters in step.
 */
export class LearningSystem extends createSystem({}) {
  private dirty = false;
  private saveTimer = 0;

  init(): void {
    const ctx = game();
    const ev = ctx.session.events;
    const mark = () => {
      this.dirty = true;
    };
    this.cleanupFuncs.push(ev.on('hitCorrect', mark), ev.on('hitWrong', mark), ev.on('bossHit', mark), ev.on('bossWrong', mark), ev.on('roundClear', () => this.flush()), ev.on('perkTaken', () => this.flush()));
    const onHide = () => this.flush();
    window.addEventListener('pagehide', onHide);
    this.cleanupFuncs.push(() => window.removeEventListener('pagehide', onHide));
  }

  flush(): void {
    this.dirty = false;
    this.saveTimer = 0;
    game().save();
  }

  update(delta: number): void {
    if (!this.dirty) return;
    // Debounced save so a burst of hits does one write.
    this.saveTimer += delta;
    if (this.saveTimer > 5) this.flush();
  }
}
